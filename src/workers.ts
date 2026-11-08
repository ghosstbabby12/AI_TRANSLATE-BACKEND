import { Worker } from "bullmq";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import type { JobProcesarVideo, JobReintentarSegmento } from "./models/types.js";
import { recalcularEstadoVideo } from "./pipeline/estadoVideo.js";
import { procesarSegmento } from "./pipeline/procesarSegmento.js";
import { procesarVideo } from "./pipeline/procesarVideo.js";
import { COLA_SEGMENTOS, COLA_VIDEOS, crearConexionRedis, encolarVideo } from "./queue/colas.js";
import { obtenerSegmento } from "./repositories/segmentos.repo.js";
import { actualizarEstadoVideo, obtenerVideo } from "./repositories/videos.repo.js";
import { describirError, logLimitado, reintentarHastaLograr } from "./util/resiliencia.js";

/**
 * Arranca los consumidores de las dos colas. Lo usa el proceso worker
 * (worker.ts) o, en el plan gratuito de Render, la propia API (WORKER_EN_API).
 * Devuelve una función para cerrarlos de forma ordenada.
 */
export async function iniciarWorkers(): Promise<() => Promise<void>> {
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
    if (!ultimo) return;
    // Si la base tampoco responde, no debe convertirse en un rechazo sin capturar.
    await actualizarEstadoVideo(job.data.videoId, "error", err.message.slice(0, 1000)).catch((e) =>
      console.error(`[videos] no se pudo marcar ${job.data.videoId} como error: ${describirError(e)}`),
    );
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

  // Redis caído: los workers reconectan solos; solo se registra (sin inundar los logs).
  workerVideos.on("error", logLimitado("worker videos"));
  workerSegmentos.on("error", logLimitado("worker segmentos"));

  // En segundo plano y con reintentos: si la base o Redis aún no responden,
  // el arranque no se bloquea ni se cae.
  void reintentarHastaLograr("recuperar trabajos", recuperarTrabajos);
  // Y luego cada 2 minutos: si Redis se cayó un rato, los videos que no se
  // pudieron encolar (o cuya cola se perdió) se retoman solos.
  const barrido = setInterval(() => {
    recuperarTrabajos().catch(logLimitado("recuperar trabajos"));
  }, 2 * 60_000);
  barrido.unref();
  console.log("Worker escuchando colas:", COLA_VIDEOS, COLA_SEGMENTOS);

  return async () => {
    clearInterval(barrido);
    await Promise.all([workerVideos.close(), workerSegmentos.close()]);
  };
}

/**
 * Si Redis perdió la cola (el Key Value gratuito de Render no persiste), no
 * estaba disponible al crear el video, o el proceso murió a mitad de un video,
 * esos videos quedarían "pendiente"/"procesando" para siempre. Se vuelven a
 * encolar al arrancar y periódicamente; procesarVideo retoma solo los
 * segmentos pendientes, y encolarVideo no duplica un job que siga en la cola.
 */
async function recuperarTrabajos(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM videos WHERE estado IN ('pendiente', 'procesando')",
  );
  for (const { id } of rows) await encolarVideo(id);
  if (rows.length > 0) console.log(`Recuperados ${rows.length} video(s) sin terminar`);
}
