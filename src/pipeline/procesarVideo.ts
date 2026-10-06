import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { UnrecoverableError } from "bullmq";
import { config } from "../config.js";
import { descargarDesdeUrl } from "../media/descargar.js";
import { extraerYDividirAudio, tienePistaDeAudio, type TrozoAudio } from "../media/ffmpeg.js";
import {
  insertarSegmentos,
  liberarSegmentosColgados,
  listarSegmentos,
} from "../repositories/segmentos.repo.js";
import { actualizarEstadoVideo, obtenerVideo, registrarDivision } from "../repositories/videos.repo.js";
import type { Video } from "../models/types.js";
import { claves, descargarArchivo, subirArchivo } from "../storage/s3.js";
import { recalcularEstadoVideo } from "./estadoVideo.js";
import { procesarSegmento } from "./procesarSegmento.js";

/**
 * Job principal de un video:
 *   1. Consigue el archivo (desde S3 o descargándolo del link).
 *   2. Extrae el audio y lo divide en trozos (una pasada de ffmpeg).
 *   3. Sube los trozos a S3 y crea las filas de `segmentos` (pendiente).
 *   4. Procesa los segmentos EN ORDEN, uno por uno, para que cada uno tenga
 *      disponible la traducción del anterior como contexto y el usuario vea
 *      avanzar los subtítulos de principio a fin.
 *
 * Si el job se reintenta (worker caído, error de ffmpeg), los pasos 1-3 se
 * saltan cuando los segmentos ya existen y solo se retoman los pendientes.
 */
export async function procesarVideo(videoId: string): Promise<void> {
  const video = await obtenerVideo(videoId);
  if (!video) throw new UnrecoverableError(`Video ${videoId} no existe`);

  await actualizarEstadoVideo(videoId, "procesando");

  let segmentos = await listarSegmentos(videoId);
  if (segmentos.length === 0) {
    await prepararSegmentos(video);
    segmentos = await listarSegmentos(videoId);
  } else {
    await liberarSegmentosColgados(videoId);
    segmentos = await listarSegmentos(videoId);
  }

  for (const seg of segmentos) {
    if (seg.estado !== "pendiente") continue;
    await procesarSegmento(seg.id, video.idioma_destino);
  }

  await recalcularEstadoVideo(videoId);
}

// El navegador decide si puede reproducir el video según su Content-Type.
const TIPOS_VIDEO: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
};

async function prepararSegmentos(video: Video): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), `video-${video.id}-`));
  try {
    // 1. Archivo local
    let rutaVideo: string;
    let storageKey: string | undefined;
    if (video.origen_tipo === "url") {
      rutaVideo = await descargarDesdeUrl(video.origen_url!, dir);
      // Se guarda en S3 para que el frontend lo pueda reproducir
      const ext = path.extname(rutaVideo).toLowerCase();
      storageKey = claves.videoOriginal(video.id, ext);
      await subirArchivo(storageKey, rutaVideo, TIPOS_VIDEO[ext] ?? "application/octet-stream");
    } else {
      rutaVideo = path.join(dir, `original${path.extname(video.storage_key!)}`);
      await descargarArchivo(video.storage_key!, rutaVideo);
    }

    if (!(await tienePistaDeAudio(rutaVideo))) {
      throw new UnrecoverableError("El video no tiene pista de audio");
    }

    // 2. Audio dividido
    const trozos = await extraerYDividirAudio(rutaVideo, dir, config.SEGMENTO_SEGUNDOS);
    if (trozos.length === 0) throw new UnrecoverableError("No se obtuvo audio del video");

    // 3. Trozos a S3 (de a 5 en paralelo) y filas en la BD
    await subirTrozos(video.id, trozos);
    await insertarSegmentos(
      video.id,
      trozos.map((t) => ({
        indice: t.indice,
        tiempoInicio: t.inicio,
        tiempoFin: t.fin,
        audioKey: claves.audioSegmento(video.id, t.indice),
      })),
    );
    await registrarDivision(video.id, {
      totalSegmentos: trozos.length,
      duracionSeg: trozos.at(-1)!.fin,
      storageKey,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function subirTrozos(videoId: string, trozos: TrozoAudio[], paralelo = 5): Promise<void> {
  for (let i = 0; i < trozos.length; i += paralelo) {
    await Promise.all(
      trozos
        .slice(i, i + paralelo)
        .map((t) => subirArchivo(claves.audioSegmento(videoId, t.indice), t.ruta, "audio/mpeg")),
    );
  }
}
