import { Worker } from "bullmq";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import type { JobAudioVideo, JobExportarVideo, JobProcesarVideo, JobReintentarSegmento, JobResumirVideo } from "./models/types.js";
import { recalcularEstadoVideo } from "./pipeline/estadoVideo.js";
import { procesarSegmento } from "./pipeline/procesarSegmento.js";
import { exportarVideo } from "./pipeline/exportarVideo.js";
import { ERROR_AUDIO_INTERRUMPIDO, generarAudio } from "./pipeline/generarAudio.js";
import { completarMiniaturas } from "./pipeline/miniatura.js";
import { procesarVideo } from "./pipeline/procesarVideo.js";
import { resumirVideo } from "./pipeline/resumirVideo.js";
import {
  COLA_AUDIOS,
  COLA_EXPORTACIONES,
  COLA_RESUMENES,
  COLA_SEGMENTOS,
  COLA_VIDEOS,
  crearConexionRedis,
  encolarAudio,
  encolarExportacion,
  encolarResumen,
  encolarVideo,
} from "./queue/colas.js";
import { obtenerSegmento } from "./repositories/segmentos.repo.js";
import {
  actualizarAudio,
  contarIntentoAudio,
  actualizarEstadoVideo,
  actualizarExportacion,
  actualizarResumen,
  obtenerVideo,
} from "./repositories/videos.repo.js";
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

  // Videos con subtítulos incrustados: recodificar es pesado, de a uno.
  const workerExportaciones = new Worker<JobExportarVideo>(
    COLA_EXPORTACIONES,
    async (job) => {
      console.log(`[exportar] generando video con subtítulos de ${job.data.videoId}`);
      await exportarVideo(job.data.videoId);
      console.log(`[exportar] ${job.data.videoId} listo`);
    },
    // Recodificar puede tardar minutos con poca CPU: el lock se renueva solo,
    // pero se le da margen para que no se considere atascado.
    { connection: crearConexionRedis(), concurrency: 1, lockDuration: 5 * 60_000 },
  );
  workerExportaciones.on("failed", async (job, err) => {
    if (!job) return;
    const ultimo = err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(`[exportar] ${job.data.videoId} falló${ultimo ? " definitivamente" : ""}: ${err.message}`);
    if (!ultimo) return;
    await actualizarExportacion(job.data.videoId, { estado: "error", error: err.message }).catch((e) =>
      console.error(`[exportar] no se pudo marcar el error de ${job.data.videoId}: ${describirError(e)}`),
    );
  });

  // Resúmenes: una llamada (o unas pocas) al modelo de texto; de a uno para no
  // agotar el límite por minuto del plan gratuito de Groq.
  const workerResumenes = new Worker<JobResumirVideo>(
    COLA_RESUMENES,
    async (job) => {
      console.log(`[resumen] resumiendo ${job.data.videoId} (intento ${job.attemptsMade + 1})`);
      await resumirVideo(job.data.videoId);
      console.log(`[resumen] ${job.data.videoId} listo`);
    },
    { connection: crearConexionRedis(), concurrency: 1, lockDuration: 3 * 60_000 },
  );
  workerResumenes.on("failed", async (job, err) => {
    if (!job) return;
    const ultimo = err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(`[resumen] ${job.data.videoId} falló${ultimo ? " definitivamente" : ""}: ${err.message}`);
    if (!ultimo) return;
    await actualizarResumen(job.data.videoId, { estado: "error", error: err.message }).catch((e) =>
      console.error(`[resumen] no se pudo marcar el error de ${job.data.videoId}: ${describirError(e)}`),
    );
  });

  // Audio de la traducción: sintetizar voz usa bastante CPU y memoria, de a uno.
  const MAX_INTENTOS_AUDIO = 3;
  const workerAudios = new Worker<JobAudioVideo>(
    COLA_AUDIOS,
    async (job) => {
      // Si el proceso murió a mitad (p. ej. sin memoria), el barrido lo vuelve a
      // encolar: tras varios intentos se da por fallido en vez de quedar en bucle.
      const intento = await contarIntentoAudio(job.data.videoId);
      if (intento > MAX_INTENTOS_AUDIO) {
        console.error(`[audio] ${job.data.videoId} se cortó ${intento - 1} veces; se marca como error`);
        await actualizarAudio(job.data.videoId, { estado: "error", error: ERROR_AUDIO_INTERRUMPIDO });
        return;
      }
      console.log(`[audio] generando audio de ${job.data.videoId} (intento ${intento})`);
      await generarAudio(job.data.videoId);
      console.log(`[audio] ${job.data.videoId} listo`);
    },
    { connection: crearConexionRedis(), concurrency: 1, lockDuration: 5 * 60_000 },
  );
  workerAudios.on("failed", async (job, err) => {
    if (!job) return;
    const ultimo = err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(`[audio] ${job.data.videoId} falló${ultimo ? " definitivamente" : ""}: ${err.message}`);
    if (!ultimo) return;
    await actualizarAudio(job.data.videoId, { estado: "error", error: err.message }).catch((e) =>
      console.error(`[audio] no se pudo marcar el error de ${job.data.videoId}: ${describirError(e)}`),
    );
  });

  // Redis caído: los workers reconectan solos; solo se registra (sin inundar los logs).
  workerVideos.on("error", logLimitado("worker videos"));
  workerSegmentos.on("error", logLimitado("worker segmentos"));
  workerExportaciones.on("error", logLimitado("worker exportaciones"));
  workerResumenes.on("error", logLimitado("worker resumenes"));
  workerAudios.on("error", logLimitado("worker audios"));

  // En segundo plano y con reintentos: si la base o Redis aún no responden,
  // el arranque no se bloquea ni se cae.
  void reintentarHastaLograr("recuperar trabajos", recuperarTrabajos);
  // Y luego cada 2 minutos: si Redis se cayó un rato, los videos que no se
  // pudieron encolar (o cuya cola se perdió) se retoman solos.
  const barrido = setInterval(() => {
    recuperarTrabajos().catch(logLimitado("recuperar trabajos"));
    // Miniaturas de videos anteriores a esta función, de a pocas por vuelta
    completarMiniaturas().catch(logLimitado("miniaturas"));
  }, 2 * 60_000);
  void completarMiniaturas().catch(logLimitado("miniaturas"));
  barrido.unref();
  console.log("Worker escuchando colas:", COLA_VIDEOS, COLA_SEGMENTOS, COLA_EXPORTACIONES, COLA_RESUMENES, COLA_AUDIOS);

  return async () => {
    clearInterval(barrido);
    await Promise.all([workerVideos.close(), workerSegmentos.close(), workerExportaciones.close(), workerResumenes.close(), workerAudios.close()]);
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

  // Lo mismo para las exportaciones que quedaron a medias
  const exportaciones = await pool.query<{ id: string }>("SELECT id FROM videos WHERE export_estado = 'procesando'");
  for (const { id } of exportaciones.rows) await encolarExportacion(id);

  // Y los resúmenes
  const resumenes = await pool.query<{ id: string }>("SELECT id FROM videos WHERE resumen_estado = 'procesando'");
  for (const { id } of resumenes.rows) await encolarResumen(id);

  // Y los audios
  const audios = await pool.query<{ id: string }>("SELECT id FROM videos WHERE audio_estado = 'procesando'");
  for (const { id } of audios.rows) await encolarAudio(id);
}
