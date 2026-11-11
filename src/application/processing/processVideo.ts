import { PermanentError } from "../../domain/errors.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { makePrepareSegments } from "./prepareSegments.js";
import { makeProcessSegment } from "./processSegment.js";
import { makeRefreshVideoStatus } from "./refreshVideoStatus.js";

/**
 * Main job of a video:
 *   1. Prepare the segments (only the first time).
 *   2. Process them IN ORDER, so each one has the previous translation as
 *      context and the user sees the subtitles advance from start to end.
 *   3. Derive the final status.
 * When the job is retried, finished segments are skipped.
 */
export function makeProcessVideo(deps: Deps) {
  const prepareSegments = makePrepareSegments(deps);
  const processSegment = makeProcessSegment(deps);
  const refreshStatus = makeRefreshVideoStatus(deps);

  return async (videoId: string): Promise<void> => {
    const video = await deps.videos.findById(videoId);
    if (!video) throw new PermanentError(MESSAGES.processing.videoMissing(videoId));
    await deps.videos.setStatus(videoId, "processing");

    const existing = await deps.segments.list(videoId);
    if (existing.length === 0) await prepareSegments(video);
    else await deps.segments.releaseStuck(videoId);

    for (const segment of await deps.segments.list(videoId)) {
      if (segment.status === "pending") await processSegment(segment.id, video.targetLanguage);
    }
    await refreshStatus(videoId);
  };
}

/** A retry job for one segment, scheduled with backoff after a temporary failure. */
export function makeRetrySegment(deps: Deps) {
  const processSegment = makeProcessSegment(deps);
  const refreshStatus = makeRefreshVideoStatus(deps);

  return async (segmentId: string): Promise<void> => {
    const segment = await deps.segments.findById(segmentId);
    const video = segment && (await deps.videos.findById(segment.videoId));
    if (!segment || !video) return; // the video was deleted
    const result = await processSegment(segment.id, video.targetLanguage);
    console.log(`[segments] retry of ${segment.videoId}#${segment.index}: ${result}`);
    await refreshStatus(segment.videoId);
  };
}
