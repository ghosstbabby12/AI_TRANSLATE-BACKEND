import path from "node:path";
import { describeError } from "../../shared/resilience.js";
import type { Deps } from "../ports/index.js";
import { storageKeys } from "../shared/storageKeys.js";

/** A representative moment: 10 % into the video, between 0.5 and 5 s (skips the black opening). */
const thumbnailSecond = (duration: number | null) => Math.min(5, Math.max(0.5, (duration ?? 10) * 0.1));

export function makeThumbnails({ videos, storage, media, workspace }: Deps) {
  /**
   * Creates the preview image of a file. `localPath` is used when the video is
   * already on disk; otherwise it is read from storage. Never throws: a
   * thumbnail is not critical.
   */
  async function generate(fileKey: string, duration: number | null, localPath?: string): Promise<void> {
    try {
      await workspace.withTempDir("miniatura-", async (dir) => {
        const output = path.join(dir, "miniatura.jpg");
        const input = localPath ?? (await storage.internalUrl(fileKey));
        await media.extractThumbnail(input, output, thumbnailSecond(duration));
        const key = storageKeys.thumbnail(fileKey);
        await storage.upload(key, output, "image/jpeg");
        await videos.setThumbnail(fileKey, key);
      });
    } catch (err) {
      console.warn(`[thumbnail] could not create one for ${fileKey}: ${describeError(err)}`);
    }
  }

  /** Creates the missing thumbnails (videos uploaded before this feature), a few at a time. */
  async function fillMissing(limit = 5): Promise<void> {
    for (const { fileKey, durationSeconds } of await videos.filesWithoutThumbnail(limit)) {
      await generate(fileKey, durationSeconds);
    }
  }

  return { generate, fillMissing };
}
