import type { UseCases } from "../../application/index.js";
import type { VideoRepository } from "../../application/ports/repositories.js";
import { config } from "../../config/index.js";
import { retryUntilSuccess, throttledLogger } from "../../shared/resilience.js";
import { QUEUE_NAMES, type SegmentJob, type VideoJob } from "../queue/queues.js";
import { createWorker } from "./createWorker.js";

const SWEEP_INTERVAL_MS = 2 * 60_000;
const minutes = (n: number) => n * 60_000;

/**
 * Starts the queue consumers. Used by the worker process or, on Render's free
 * plan, by the API itself. Returns a function that stops them gracefully.
 */
export function startWorkers(useCases: UseCases, videos: VideoRepository): () => Promise<void> {
  const { processing } = useCases;

  const workers = [
    createWorker<VideoJob>({
      queue: QUEUE_NAMES.videos,
      label: "videos",
      handle: async ({ videoId }, job) => {
        console.log(`[videos] processing ${videoId} (attempt ${job.attemptsMade + 1})`);
        await processing.processVideo(videoId);
      },
      // A failure here is infrastructure (download, ffmpeg, storage), not a single segment.
      onFinalFailure: ({ videoId }, message) => videos.setStatus(videoId, "failed", message.slice(0, 1000)),
      options: { concurrency: config.workers.videoConcurrency },
    }),
    createWorker<SegmentJob>({
      queue: QUEUE_NAMES.segments,
      label: "segments",
      handle: ({ segmentoId }) => processing.retrySegment(segmentoId),
      options: { concurrency: config.workers.retryConcurrency },
    }),
    // Re-encoding video is heavy: one at a time, with room before the lock is considered stuck.
    createWorker<VideoJob>({
      queue: QUEUE_NAMES.exports,
      label: "export",
      handle: ({ videoId }) => processing.exportVideo(videoId),
      onFinalFailure: ({ videoId }, error) => videos.setExport(videoId, { status: "failed", error }),
      options: { concurrency: 1, lockDuration: minutes(5) },
    }),
    // One at a time so the free Groq plan's per-minute limit is not exhausted.
    createWorker<VideoJob>({
      queue: QUEUE_NAMES.summaries,
      label: "summary",
      handle: ({ videoId }) => processing.summarizeVideo(videoId),
      onFinalFailure: ({ videoId }, error) => videos.setSummary(videoId, { status: "failed", error }),
      options: { concurrency: 1, lockDuration: minutes(3) },
    }),
    // Speech synthesis uses a lot of CPU and memory: one at a time.
    createWorker<VideoJob>({
      queue: QUEUE_NAMES.audios,
      label: "audio",
      handle: async ({ videoId }) => {
        if (await processing.audioAttemptGuard(videoId)) await processing.generateAudio(videoId);
      },
      onFinalFailure: ({ videoId }, error) => videos.setAudio(videoId, { status: "failed", error }),
      options: { concurrency: 1, lockDuration: minutes(5) },
    }),
  ];

  // In the background and with retries: startup is not blocked if the database or Redis are not ready.
  void retryUntilSuccess("recover jobs", processing.recoverJobs);
  void processing.fillMissingThumbnails().catch(throttledLogger("thumbnails"));
  const sweep = setInterval(() => {
    processing.recoverJobs().catch(throttledLogger("recover jobs"));
    processing.fillMissingThumbnails().catch(throttledLogger("thumbnails"));
  }, SWEEP_INTERVAL_MS);
  sweep.unref();
  console.log("Workers listening to queues:", Object.values(QUEUE_NAMES).join(" "));

  return async () => {
    clearInterval(sweep);
    await Promise.all(workers.map((w) => w.close()));
  };
}
