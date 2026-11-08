import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../../config.js";
import { CODIGOS_IDIOMA } from "../../idiomas.js";
import { encolarExportacion, encolarReintentoSegmento, encolarVideo } from "../../queue/colas.js";
import {
  listarSegmentos,
  listarSegmentosListos,
  progresoVideo,
  reiniciarSegmentosConError,
} from "../../repositories/segmentos.repo.js";
import {
  actualizarEstadoVideo,
  actualizarExportacion,
  contarUsosDeArchivo,
  crearTraduccion,
  eliminarVideo,
  listarTraducciones,
  renombrarVideo,
  crearVideo,
  listarVideosDeUsuario,
  obtenerVideoDeUsuario,
} from "../../repositories/videos.repo.js";
import { borrarObjeto, borrarPrefijo, claves, subirArchivo, urlFirmada } from "../../storage/s3.js";
import { aSrt, aTxt, aVtt, generarCues } from "../../subtitulos/formatos.js";
import type { Video } from "../../models/types.js";
import { describirError } from "../../util/resiliencia.js";
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

const esquemaTraducir = z.object({ idioma_destino: z.enum(CODIGOS_IDIOMA) });

const esquemaRenombrar = z.object({ nombre: z.string().trim().min(1, "Escribe un nombre").max(200) });

const esquemaFormato = z.object({
  formato: z.enum(["srt", "vtt", "txt", "json"]).default("json"),
  descargar: z.enum(["0", "1"]).optional(),
});

export const videosRouter = Router();
videosRouter.use(requiereUsuario);

/**
 * multer entrega el nombre del archivo decodificado como Latin-1, así que
 * cualquier carácter no ASCII llega roto (macOS, por ejemplo, pone un espacio
 * estrecho U+202F antes de "p.m." en las grabaciones de pantalla).
 */
function nombreOriginal(nombre: string): string {
  const utf8 = Buffer.from(nombre, "latin1").toString("utf8");
  // Si no era UTF-8 válido, aparece el carácter de reemplazo: se deja como vino.
  return utf8.includes("\uFFFD") ? nombre : utf8;
}

/** Nombre de archivo seguro para descargas: "<nombre>.<idioma>.<ext>". */
function nombreDescarga(video: Video, extension: string): string {
  const base = path.parse(video.nombre).name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "video";
  return `${base}.${video.idioma_destino}.${extension}`;
}

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
      nombre: datos.nombre ?? (archivo ? nombreOriginal(archivo.originalname) : datos.url!),
      origenTipo: archivo ? "archivo" : "url",
      origenUrl: datos.url ?? null,
      storageKey,
      idiomaDestino: datos.idioma_destino,
    });
    try {
      await encolarVideo(video.id);
    } catch (err) {
      // El video ya quedó guardado como "pendiente": el barrido periódico de
      // los workers lo encolará cuando Redis vuelva. No es un error para el usuario.
      console.warn(`[videos] ${video.id} sin encolar por ahora: ${describirError(err)}`);
    }

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
    // Todas las traducciones del mismo archivo, para saltar entre idiomas
    traducciones: video.storage_key ? await listarTraducciones(video.usuario_id, video.storage_key) : [],
    url_reproduccion: video.storage_key ? await urlFirmada(video.storage_key) : null,
    // Video con subtítulos incrustados, si ya se generó: se descarga con nombre propio.
    url_exportacion:
      video.export_estado === "listo" && video.export_key
        ? await urlFirmada(video.export_key, 3600, nombreDescarga(video, "mp4"))
        : null,
  });
});

/**
 * PATCH /videos/:id — cambia el nombre. Se aplica también a las demás
 * traducciones del mismo video, que son el mismo contenido en otro idioma.
 */
videosRouter.patch("/:id", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  const { nombre } = esquemaRenombrar.parse(req.body);
  const actualizados = await renombrarVideo(video, nombre);
  res.json({ nombre, actualizados });
});

/**
 * DELETE /videos/:id — elimina esta traducción. Si ningún otro video usa el
 * mismo archivo, también se borran de S3 el original y los trozos de audio.
 */
videosRouter.delete("/:id", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  await eliminarVideo(video.id);
  res.status(204).end();

  // Limpieza de almacenamiento después de responder: si falla, solo se registra
  // (el video ya no existe para el usuario; quedaría un archivo huérfano).
  void (async () => {
    try {
      if (video.export_key) await borrarObjeto(video.export_key);
      if (video.storage_key && (await contarUsosDeArchivo(video.storage_key)) === 0) {
        // Original, trozos de audio y exportación viven bajo la carpeta del video que se subió
        const carpeta = video.storage_key.slice(0, video.storage_key.lastIndexOf("/") + 1);
        const borrados = await borrarPrefijo(carpeta);
        console.log(`[eliminar] ${video.id}: ${borrados} archivo(s) borrados de ${carpeta}`);
      }
    } catch (err) {
      console.error(`[eliminar] no se pudo limpiar el almacenamiento de ${video.id}: ${describirError(err)}`);
    }
  })();
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
  const idiomas = `${(video.idioma_origen ?? "?").toUpperCase()} → ${video.idioma_destino.toUpperCase()}`;
  const [cuerpo, tipo] =
    formato === "srt"
      ? [aSrt(cues), "application/x-subrip"]
      : formato === "vtt"
        ? [aVtt(cues), "text/vtt"]
        : [aTxt(segmentos, { titulo: video.nombre, idiomas }), "text/plain"];
  res.type(tipo).set("Cache-Control", "no-store");
  if (descargar === "1") res.attachment(nombreDescarga(video, formato));
  res.send(cuerpo);
});

/**
 * POST /videos/:id/traducir — traduce los subtítulos ya generados a otro idioma.
 * Reutiliza la transcripción (no vuelve a descargar ni transcribir el audio):
 * crea una traducción nueva del mismo video y solo corre el paso de traducir.
 * Si ya existe una traducción a ese idioma, devuelve esa.
 */
videosRouter.post("/:id/traducir", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  const { idioma_destino } = esquemaTraducir.parse(req.body);

  if (!video.storage_key || video.total_segmentos === null) {
    res.status(409).json({ error: "Espera a que el video termine de prepararse para traducirlo a otro idioma." });
    return;
  }
  const existente = (await listarTraducciones(video.usuario_id, video.storage_key)).find(
    (t) => t.idioma_destino === idioma_destino,
  );
  if (existente) {
    res.json({ id: existente.id, existente: true });
    return;
  }

  const nuevo = await crearTraduccion(video.id, idioma_destino);
  try {
    await encolarVideo(nuevo.id);
  } catch (err) {
    // Queda "procesando": el barrido periódico de los workers la retomará.
    console.warn(`[traducir] ${nuevo.id} sin encolar por ahora: ${describirError(err)}`);
  }
  res.status(201).json({ id: nuevo.id, existente: false });
});

/**
 * POST /videos/:id/exportar — pide el video con los subtítulos incrustados.
 * Es un trabajo en segundo plano (recodificar tarda): la app consulta
 * GET /videos/:id hasta que `export_estado` sea "listo" y trae `url_exportacion`.
 */
videosRouter.post("/:id/exportar", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  if (!video.storage_key) {
    res.status(409).json({ error: "El video original todavía no está disponible." });
    return;
  }
  if ((await listarSegmentosListos(video.id)).length === 0) {
    res.status(409).json({ error: "Todavía no hay subtítulos traducidos para incrustar." });
    return;
  }
  if (video.export_estado !== "procesando") {
    await actualizarExportacion(video.id, { estado: "procesando" });
    try {
      await encolarExportacion(video.id);
    } catch (err) {
      // Queda "procesando": el barrido periódico de los workers lo retomará.
      console.warn(`[exportar] ${video.id} sin encolar por ahora: ${describirError(err)}`);
    }
  }
  res.status(202).json({ export_estado: "procesando" });
});

/**
 * POST /videos/:id/reintentar — vuelve a encolar los segmentos que quedaron en
 * error o, si el video falló antes de dividirse (p. ej. la descarga), el video entero.
 */
videosRouter.post("/:id/reintentar", async (req, res) => {
  const video = await videoDelUsuario(req, res);
  if (!video) return;
  if (video.total_segmentos === null) {
    if (video.estado !== "error") {
      res.status(409).json({ error: "El video todavía se está preparando" });
      return;
    }
    await actualizarEstadoVideo(video.id, "pendiente");
    await encolarVideo(video.id);
    res.json({ reencolados: 0, video: true });
    return;
  }
  const ids = await reiniciarSegmentosConError(video.id);
  if (ids.length > 0) {
    await actualizarEstadoVideo(video.id, "procesando");
    // Los subtítulos van a cambiar: el video exportado quedaría desactualizado.
    if (video.export_estado) await actualizarExportacion(video.id, { estado: null });
    await Promise.all(ids.map((id) => encolarReintentoSegmento(id, 0)));
  }
  res.json({ reencolados: ids.length });
});
