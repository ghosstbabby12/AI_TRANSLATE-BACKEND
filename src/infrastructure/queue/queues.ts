import { Queue, type JobsOptions } from "bullmq";
import { MESSAGES } from "../../application/messages.js";
import type { JobQueue } from "../../application/ports/services.js";
import { withTimeout } from "../../shared/resilience.js";
import { createFastConnection } from "./redis.js";

/** Queue names live in Redis: changing them would orphan queued jobs. */
export const QUEUE_NAMES = {
  videos: "videos",
  segments: "segmentos",
  exports: "exportaciones",
  summaries: "resumenes",
  audios: "audios",
} as const;

export interface VideoJob {
  videoId: string;
}

export interface SegmentJob {
  segmentoId: string;
}

const connection = createFastConnection();
const queue = <T>(name: string) => new Queue<T>(name, { connection });

const queues = {
  videos: queue<VideoJob>(QUEUE_NAMES.videos),
  segments: queue<SegmentJob>(QUEUE_NAMES.segments),
  exports: queue<VideoJob>(QUEUE_NAMES.exports),
  summaries: queue<VideoJob>(QUEUE_NAMES.summaries),
  audios: queue<VideoJob>(QUEUE_NAMES.audios),
};

const ENQUEUE_TIMEOUT_MS = 8_000;
const limited = (work: Promise<unknown>) => withTimeout(work, ENQUEUE_TIMEOUT_MS, MESSAGES.videos.queueUnavailable).then(() => {});

/**
 * One job per video and task at a time. BullMQ ignores add() while it still
 * keeps a job with the same id, so a finished one is removed first to allow
 * running it again.
 */
async function addUnique(q: Queue<VideoJob>, name: string, jobId: string, videoId: string, options: JobsOptions, removeCompleted: boolean) {
  const previous = await q.getJob(jobId);
  if (previous && ((await previous.isFailed()) || (removeCompleted && (await previous.isCompleted())))) await previous.remove();
  await q.add(name, { videoId }, { jobId, ...options });
}

const taskOptions = (attempts: number, delay: number): JobsOptions => ({
  attempts,
  backoff: { type: "exponential", delay },
  removeOnComplete: 100,
  removeOnFail: 100,
});

export const bullJobQueue: JobQueue = {
  // Retries infrastructure failures (download, ffmpeg, storage); AI failures are handled per segment.
  enqueueVideo: (videoId) =>
    limited(
      addUnique(queues.videos, "procesar-video", `video-${videoId}`, videoId, {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      }, false),
    ),

  /** Exponential backoff per segment: 5 s, 20 s, 80 s… (10 min max). No fixed id: claiming prevents duplicates. */
  enqueueSegmentRetry: (segmentId, attempts) => {
    const delay = Math.min(5_000 * 4 ** Math.max(0, attempts - 1), 600_000);
    const options = { delay, removeOnComplete: 1000, removeOnFail: 1000 };
    return limited(queues.segments.add("reintentar-segmento", { segmentoId: segmentId }, options));
  },

  enqueueExport: (videoId) =>
    limited(addUnique(queues.exports, "exportar-video", `export-${videoId}`, videoId, taskOptions(2, 30_000), true)),

  enqueueSummary: (videoId) =>
    limited(addUnique(queues.summaries, "resumir-video", `resumen-${videoId}`, videoId, taskOptions(3, 20_000), true)),

  enqueueAudio: (videoId) =>
    limited(addUnique(queues.audios, "generar-audio", `audio-${videoId}`, videoId, taskOptions(2, 30_000), true)),
};

/** Health check of Redis, used by /salud/detalle. */
export const pingRedis = () => withTimeout(connection.ping(), 3_000);
