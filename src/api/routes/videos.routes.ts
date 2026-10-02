import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../../config.js";
import { CODIGOS_IDIOMA } from "../../idiomas.js";
import { encolarReintentoSegmento, encolarVideo } from "../../queue/colas.js";
import {
  listarSegmentos,
  listarSegmentosListos,
  progresoVideo,
  reiniciarSegmentosConError,
} from "../../repositories/segmentos.repo.js";
import {
  actualizarEstadoVideo,
  crearVideo,
  listarVideosDeUsuario,
  obtenerVideoDeUsuario,
} from "../../repositories/videos.repo.js";
import { claves, subirArchivo, urlFirmada } from "../../storage/s3.js";
import { aSrt, aVtt, generarCues } from "../../subtitulos/formatos.js";
import { requiereUsuario } from "../middleware/usuario.js";

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^(video|audio)\//.test(file.mimetype)),
});

const esquemaCrear = z.object({
  idioma_destino: z.enum(CODIGOS_IDIOMA),
  url: z.url({ protocol: /^https?$/ }).optional(),
  nombre: z.string().trim().min(1).max(200).optional(),
});

const esquemaId = z.object({ id: z.uuid() });

const esquemaFormato = z.object({
  formato: z.enum(["srt", "vtt", "json"]).default("json"),
  descargar: z.enum(["0", "1"]).optional(),
});

export const videosRouter = Router();
videosRouter.use(requiereUsuario);

/** Busca el video del usuario o responde 404. */
async function videoDelUsuario(req: Request, res: Response) {
  const params = esquemaId.safeParse(req.params);
  const video = params.success ? await obtenerVideoDeUsuario(params.data.id, req.usuarioId!) : null;
  if (!video) res.status(404).json({ error: "Video no encontrado" });
  return video;
}

/**
 * POST /videos
 * multipart/form-data: video=<archivo>, idioma_destino=es
 * o JSON:              { "url": "https://...", "idioma_destino": "es" }
 */
videosRouter.post("/", upload.single("video"), async (req, res) => {
  const archivo = req.file;
  try {
    const datos = esquemaCrear.parse(req.body);
    if (!archivo === !datos.url) {
      res.status(400).json({ error: "Envía un archivo de video o una url (solo uno de los dos)" });
      return;
    }

    const id = randomUUID();
    let storageKey: string | null = null;
    if (archivo) {
      storageKey = claves.videoOriginal(id, path.extname(archivo.originalname).toLowerCase() || ".mp4");
      await subirArchivo(storageKey, archivo.path, archivo.mimetype);
    }

    const video = await crearVideo({
      id,
      usuarioId: req.usuarioId!,
      nombre: datos.nombre ?? archivo?.originalname ?? datos.url!,
      origenTipo: archivo ? "archivo" : "url",
      origenUrl: datos.url ?? null,
      storageKey,
      idiomaDestino: datos.idioma_destino,
    });
    await encolarVideo(video.id);

    res.status(201).json(video);
  } finally {
    if (archivo) await rm(archivo.path, { force: true });
  }
});

/** GET /videos — historial del usuario, el más reciente primero. */
videosRouter.get("/", async (req, res) => {
  res.json(await listarVideosDeUsuario(req.usuarioId!));
});

/** GET /videos/:id — detalle + URL temporal para el reproductor. */
videosRouter.get("/:id", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  res.json({
    ...video,
    url_reproduccion: video.storage_key ? await urlFirmada(video.storage_key) : null,
  });
});

/**
 * GET /videos/:id/estado — lo consulta el frontend cada pocos segundos.
 * Incluye los segmentos ya traducidos para pintarlos sin esperar al final.
 */
videosRouter.get("/:id/estado", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;

  const [progreso, segmentos] = await Promise.all([progresoVideo(video.id), listarSegmentos(video.id)]);
  const total = video.total_segmentos ?? progreso.total;

  res.json({
    id: video.id,
    estado: video.estado,
    error: video.error,
    idioma_origen: video.idioma_origen,
    idioma_destino: video.idioma_destino,
    progreso: {
      ...progreso,
      total,
      porcentaje: total ? Math.round((progreso.listos / total) * 100) : 0,
    },
    segmentos: segmentos.map((s) => ({
      indice: s.indice,
      tiempo_inicio: s.tiempo_inicio,
      tiempo_fin: s.tiempo_fin,
      estado: s.estado,
      texto_traducido: s.estado === "listo" ? s.texto_traducido : null,
      error: s.estado === "error" ? s.ultimo_error : null,
    })),
  });
});

/**
 * GET /videos/:id/subtitulos?formato=srt|vtt|json&descargar=1
 * Devuelve lo que esté listo hasta el momento (sirve también a mitad de proceso).
 */
videosRouter.get("/:id/subtitulos", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  const { formato, descargar } = esquemaFormato.parse(req.query);

  const segmentos = await listarSegmentosListos(video.id);

  if (formato === "json") {
    res.json({
      id: video.id,
      estado: video.estado,
      idioma: video.idioma_destino,
      segmentos: segmentos.map((s) => ({
        indice: s.indice,
        inicio: s.tiempo_inicio,
        fin: s.tiempo_fin,
        original: s.texto_original,
        traducido: s.texto_traducido,
      })),
    });
    return;
  }

  const cues = generarCues(segmentos);
  const cuerpo = formato === "srt" ? aSrt(cues) : aVtt(cues);
  res.type(formato === "srt" ? "application/x-subrip" : "text/vtt").set("Cache-Control", "no-store");
  if (descargar === "1") {
    const base = path.parse(video.nombre).name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "subtitulos";
    res.attachment(`${base}.${video.idioma_destino}.${formato}`);
  }
  res.send(cuerpo);
});

/** POST /videos/:id/reintentar — vuelve a encolar los segmentos que quedaron en error. */
videosRouter.post("/:id/reintentar", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  const ids = await reiniciarSegmentosConError(video.id);
  if (ids.length > 0) {
    await actualizarEstadoVideo(video.id, "procesando");
    await Promise.all(ids.map((id) => encolarReintentoSegmento(id, 0)));
  }
  res.json({ reencolados: ids.length });
});
