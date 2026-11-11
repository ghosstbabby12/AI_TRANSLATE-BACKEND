import { ConflictError } from "../../domain/errors.js";
import type { Video } from "../../domain/video.js";
import { describeError } from "../../shared/resilience.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { enqueueOrDefer } from "../shared/enqueue.js";
import { storageKeys } from "../shared/storageKeys.js";

export function makeManageVideo({ videos, segments, storage, jobs }: Deps) {
  /** Renames the video and its other translations (they are the same content). */
  const rename = (video: Video, name: string) => videos.rename(video, name);

  /** Deletes the video, then cleans up storage once nothing else uses the files. */
  async function remove(video: Video): Promise<void> {
    await videos.delete(video.id);
    void cleanUpFiles(video);
  }

  async function cleanUpFiles(video: Video): Promise<void> {
    try {
      if (video.export.key) await storage.delete(video.export.key);
      if (video.audio.key) await storage.delete(video.audio.key);
      if (video.fileKey && (await videos.countFileUsage(video.fileKey)) === 0) {
        const folder = storageKeys.folderOf(video.fileKey);
        const deleted = await storage.deletePrefix(folder);
        console.log(`[delete] ${video.id}: ${deleted} file(s) removed from ${folder}`);
      }
    } catch (err) {
      console.error(`[delete] could not clean up storage for ${video.id}: ${describeError(err)}`);
    }
  }

  /**
   * New language for an already transcribed video: reuses the transcript and
   * only runs the translation step. Returns the existing one if there is one.
   */
  async function translate(video: Video, targetLanguage: string): Promise<{ id: string; existing: boolean }> {
    if (!video.fileKey || video.totalSegments === null) throw new ConflictError(MESSAGES.videos.notReadyToTranslate);
    const translations = await videos.listTranslations(video.userId, video.fileKey);
    const existing = translations.find((t) => t.targetLanguage === targetLanguage);
    if (existing) return { id: existing.id, existing: true };

    const created = await videos.createTranslation(video.id, targetLanguage);
    await enqueueOrDefer(() => jobs.enqueueVideo(created.id), `translate ${created.id}`);
    return { id: created.id, existing: false };
  }

  /**
   * Retries the failed segments or, if the video failed before being split
   * (e.g. the download), the whole video. Results that depend on the
   * subtitles (export, summary, audio) are discarded because they will change.
   */
  async function retry(video: Video): Promise<{ requeued: number; wholeVideo: boolean }> {
    if (video.totalSegments === null) {
      if (video.status !== "failed") throw new ConflictError(MESSAGES.videos.stillPreparing);
      await videos.setStatus(video.id, "pending");
      await jobs.enqueueVideo(video.id);
      return { requeued: 0, wholeVideo: true };
    }
    const ids = await segments.resetFailed(video.id);
    if (ids.length > 0) {
      await videos.setStatus(video.id, "processing");
      if (video.export.status) await videos.setExport(video.id, { status: null });
      if (video.summary.status) await videos.setSummary(video.id, { status: null, text: null });
      if (video.audio.status) await videos.setAudio(video.id, { status: null, key: video.audio.key });
      await Promise.all(ids.map((id) => jobs.enqueueSegmentRetry(id, 0)));
    }
    return { requeued: ids.length, wholeVideo: false };
  }

  return { rename, remove, translate, retry };
}
