import { Worker } from "bullmq";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import type { JobProcesarVideo, JobReintentarSegmento } from "./models/types.js";
import { recalcularEstadoVideo } from "./pipeline/estadoVideo.js";
import { procesarSegmento } from "./pipeline/procesarSegmento.js";
import { procesarVideo } from "./pipeline/procesarVideo.js";
import { COLA_SEGMENTOS, COLA_VIDEOS, crearConexionRedis } from "./queue/colas.js";
import { obtenerSegmento } from "./repositories/segmentos.repo.js";
import { actualizarEstadoVideo, obtenerVideo } from "./repositories/videos.repo.js";

const workerVideos = new Worker<JobProcesarVideo>(
  COLA_VIDEOS,
  async (job) => {
    console.log(`[videos] procesando ${job.data.videoId} (intento ${job.attemptsMade + 1})`);
    await procesarVideo(job.data.videoId);
  },
  { connection: crearConexionRedis(), concurrency: config.WORKER_CONCURRENCIA_VIDEOS },
);

// Un fallo aquí es de infraestructura (descarga, ffmpeg, S3), no de un segmento.
// Solo en el último intento se marca el video como error.
workerVideos.on("failed", async (job, err) => {
  if (!job) return;
  const ultimo = err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(`[videos] ${job.data.videoId} falló${ultimo ? " definitivamente" : ""}: ${err.message}`);
  if (ultimo) await actualizarEstadoVideo(job.data.videoId, "error", err.message.slice(0, 1000));
});

const workerSegmentos = new Worker<JobReintentarSegmento>(
  COLA_SEGMENTOS,
  async (job) => {
    const seg = await obtenerSegmento(job.data.segmentoId);
    if (!seg) return; // el video se borró
    const video = await obtenerVideo(seg.video_id);
    if (!video) return;
    const resultado = await procesarSegmento(seg.id, video.idioma_destino);
    console.log(`[segmentos] reintento de ${seg.video_id}#${seg.indice}: ${resultado}`);
    await recalcularEstadoVideo(seg.video_id);
  },
  { connection: crearConexionRedis(), concurrency: config.WORKER_CONCURRENCIA_REINTENTOS },
);

console.log("Worker escuchando colas:", COLA_VIDEOS, COLA_SEGMENTOS);

// Cierre ordenado: termina los jobs en curso antes de salir (Render/ECS envían SIGTERM).
async function cerrar() {
  console.log("Cerrando worker...");
  await Promise.all([workerVideos.close(), workerSegmentos.close()]);
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
