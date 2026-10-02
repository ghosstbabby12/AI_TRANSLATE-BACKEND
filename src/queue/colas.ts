import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import type { JobProcesarVideo, JobReintentarSegmento } from "../models/types.js";

// BullMQ exige maxRetriesPerRequest: null en las conexiones de los workers.
export function crearConexionRedis(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export const COLA_VIDEOS = "videos";
export const COLA_SEGMENTOS = "segmentos";

const conexion = crearConexionRedis();

export const colaVideos = new Queue<JobProcesarVideo>(COLA_VIDEOS, { connection: conexion });
export const colaSegmentos = new Queue<JobReintentarSegmento>(COLA_SEGMENTOS, { connection: conexion });

export async function encolarVideo(videoId: string): Promise<void> {
  await colaVideos.add(
    "procesar-video",
    { videoId },
    {
      jobId: `video-${videoId}`,
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
  await colaSegmentos.add(
    "reintentar-segmento",
    { segmentoId },
    {
      // Sin jobId fijo: reclamarSegmento() ya impide que dos jobs procesen el mismo segmento.
      delay,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
}
