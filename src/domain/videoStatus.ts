import type { VideoProgress, VideoStatus } from "./video.js";

/**
 * The overall status of a video follows from its segments:
 *  - some still pending or processing  → processing
 *  - all finished and at least one ready → completed (failed ones can be retried)
 *  - all finished and none ready         → failed
 * Returns null when the video has no segments yet.
 */
export function deriveVideoStatus(progress: VideoProgress): { status: VideoStatus; error: string | null } | null {
  if (progress.total === 0) return null;
  if (progress.pending + progress.processing > 0) return { status: "processing", error: null };
  if (progress.ready > 0) return { status: "completed", error: null };
  return { status: "failed", error: "Ningún segmento se pudo procesar" };
}
