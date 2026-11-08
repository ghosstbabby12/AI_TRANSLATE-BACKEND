import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import type { JobExportarVideo, JobProcesarVideo, JobReintentarSegmento } from "../models/types.js";
import { conTiempoLimite, logLimitado } from "../util/resiliencia.js";

// Workers: BullMQ exige maxRetriesPerRequest: null; esperan y reconectan solos.
export function crearConexionRedis(): Redis {
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", logLimitado("redis"));
  return redis;
}

/**
 * Para operaciones dentro de una petición HTTP: si Redis no está conectado
 * fallan al instante (sin cola offline) en vez de dejar la petición colgada.
 */
export function crearConexionRedisRapida(): Redis {
  const redis = new Redis(config.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 3_000,
  });
  redis.on("error", logLimitado("redis"));
  return redis;
}

const MENSAJE_COLA = "La cola de trabajos no está disponible en este momento. Intenta de nuevo en unos segundos.";

export const COLA_VIDEOS = "videos";
export const COLA_SEGMENTOS = "segmentos";
export const COLA_EXPORTACIONES = "exportaciones";

const conexion = crearConexionRedisRapida();

export const colaVideos = new Queue<JobProcesarVideo>(COLA_VIDEOS, { connection: conexion });
export const colaSegmentos = new Queue<JobReintentarSegmento>(COLA_SEGMENTOS, { connection: conexion });
export const colaExportaciones = new Queue<JobExportarVideo>(COLA_EXPORTACIONES, { connection: conexion });

/** Para /salud/detalle. */
export const pingRedis = () => conTiempoLimite(conexion.ping(), 3_000);

export function encolarVideo(videoId: string): Promise<void> {
  return conTiempoLimite(encolarVideoSinLimite(videoId), 8_000, MENSAJE_COLA);
}

async function encolarVideoSinLimite(videoId: string): Promise<void> {
  const jobId = `video-${videoId}`;
  // BullMQ ignora un add() con el id de un job que aún guarda (p. ej. uno
  // fallido), así que para reintentar hay que quitar el anterior.
  const previo = await colaVideos.getJob(jobId);
  if (previo && (await previo.isFailed())) await previo.remove();

  await colaVideos.add(
    "procesar-video",
    { videoId },
    {
      jobId,
      // Reintenta fallos de infraestructura (descarga, ffmpeg, S3). Los fallos
      // de IA se manejan por segmento y no hacen fallar este job.
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
}

/** Backoff exponencial por segmento: 5s, 20s, 80s, ... (tope 10 min). */
export async function encolarReintentoSegmento(segmentoId: string, intentos: number): Promise<void> {
  const delay = Math.min(5_000 * 4 ** Math.max(0, intentos - 1), 600_000);
  const agregar = colaSegmentos.add(
    "reintentar-segmento",
    { segmentoId },
    {
      // Sin jobId fijo: reclamarSegmento() ya impide que dos jobs procesen el mismo segmento.
      delay,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
  await conTiempoLimite(agregar, 8_000, MENSAJE_COLA);
}

/** Video con subtítulos incrustados. Un solo job por video a la vez. */
export function encolarExportacion(videoId: string): Promise<void> {
  return conTiempoLimite(encolarExportacionSinLimite(videoId), 8_000, MENSAJE_COLA);
}

async function encolarExportacionSinLimite(videoId: string): Promise<void> {
  const jobId = `export-${videoId}`;
  // Como en encolarVideo: un job terminado o fallido con el mismo id impediría volver a generarlo.
  const previo = await colaExportaciones.getJob(jobId);
  if (previo && ((await previo.isFailed()) || (await previo.isCompleted()))) await previo.remove();

  await colaExportaciones.add(
    "exportar-video",
    { videoId },
    { jobId, attempts: 2, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 100, removeOnFail: 100 },
  );
}
