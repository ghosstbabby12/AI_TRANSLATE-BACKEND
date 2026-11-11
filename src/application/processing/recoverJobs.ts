import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";

const MAX_AUDIO_ATTEMPTS = 3;

/**
 * Re-queues everything left unfinished: the queue may have lost it (Render's
 * free Redis does not persist), it may not have been available when the work
 * was requested, or the process may have died halfway. Enqueuing is
 * idempotent, so running this at startup and periodically is safe.
 */
export function makeRecoverJobs({ videos, jobs }: Deps) {
  return async (): Promise<void> => {
    const work = await videos.findUnfinishedWork();
    for (const id of work.videos) await jobs.enqueueVideo(id);
    if (work.videos.length > 0) console.log(`Recovered ${work.videos.length} unfinished video(s)`);
    for (const id of work.exports) await jobs.enqueueExport(id);
    for (const id of work.summaries) await jobs.enqueueSummary(id);
    for (const id of work.audios) await jobs.enqueueAudio(id);
  };
}

/**
 * Counts each audio run. If the process keeps dying halfway (e.g. out of
 * memory), recovery would re-queue it forever: after a few runs it is marked
 * as failed instead. Returns false when the job must not run.
 */
export function makeAudioAttemptGuard({ videos }: Deps) {
  return async (videoId: string): Promise<boolean> => {
    const attempt = await videos.countAudioAttempt(videoId);
    if (attempt <= MAX_AUDIO_ATTEMPTS) {
      console.log(`[audio] generating audio for ${videoId} (attempt ${attempt})`);
      return true;
    }
    console.error(`[audio] ${videoId} was interrupted ${attempt - 1} times; marking it as failed`);
    await videos.setAudio(videoId, { status: "failed", error: MESSAGES.audio.interrupted });
    return false;
  };
}
