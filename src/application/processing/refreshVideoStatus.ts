import { deriveVideoStatus } from "../../domain/videoStatus.js";
import type { Deps } from "../ports/index.js";

/** Recomputes the video status from its segments. Idempotent: safe to run from two workers at once. */
export function makeRefreshVideoStatus({ segments, videos }: Deps) {
  return async (videoId: string): Promise<void> => {
    const next = deriveVideoStatus(await segments.progress(videoId));
    if (next) await videos.setStatus(videoId, next.status, next.error);
  };
}
