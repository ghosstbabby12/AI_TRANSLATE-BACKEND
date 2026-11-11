import path from "node:path";
import { PermanentError } from "../../domain/errors.js";
import { buildCues } from "../../domain/subtitles/cues.js";
import { toSrt } from "../../domain/subtitles/formats.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { storageKeys } from "../shared/storageKeys.js";

/** Creates the MP4 with the translated subtitles burned in, using the segments ready right now. */
export function makeExportVideo({ videos, segments, storage, media, workspace }: Deps) {
  return async (videoId: string): Promise<void> => {
    const video = await videos.findById(videoId);
    if (!video?.fileKey) throw new PermanentError(MESSAGES.processing.originalUnavailable);
    const fileKey = video.fileKey;

    const cues = buildCues(await segments.listReady(videoId));
    if (cues.length === 0) throw new PermanentError(MESSAGES.processing.noSubtitlesYet);

    await workspace.withTempDir(`export-${videoId}-`, async (dir) => {
      const original = path.join(dir, `original${path.extname(fileKey)}`);
      const srt = path.join(dir, "subtitulos.srt");
      const output = path.join(dir, "subtitulado.mp4");

      await storage.download(fileKey, original);
      await workspace.writeText(srt, toSrt(cues));
      await media.burnSubtitles(original, srt, output);

      const key = storageKeys.subtitledVideo(videoId);
      await storage.upload(key, output, "video/mp4");
      await videos.setExport(videoId, { status: "ready", key });
    });
  };
}
