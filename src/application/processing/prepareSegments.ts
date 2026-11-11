import path from "node:path";
import { PermanentError } from "../../domain/errors.js";
import type { Video } from "../../domain/video.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import type { AudioChunk } from "../ports/media.js";
import { storageKeys } from "../shared/storageKeys.js";
import { makeThumbnails } from "./thumbnails.js";

// The browser decides whether it can play the video from its Content-Type.
const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
};

const PARALLEL_UPLOADS = 5;

/** Gets the video file, cuts its audio into chunks and creates the pending segments. */
export function makePrepareSegments(deps: Deps) {
  const { videos, segments, storage, media, downloader, workspace, settings } = deps;
  const thumbnails = makeThumbnails(deps);

  /** Local copy of the video; a linked video is also saved to storage so the app can play it. */
  async function fetchVideo(video: Video, dir: string): Promise<{ localPath: string; fileKey: string }> {
    if (video.sourceType === "url") {
      const localPath = await downloader.download(video.sourceUrl!, dir);
      const extension = path.extname(localPath).toLowerCase();
      const fileKey = storageKeys.originalVideo(video.id, extension);
      await storage.upload(fileKey, localPath, VIDEO_TYPES[extension] ?? "application/octet-stream");
      return { localPath, fileKey };
    }
    const localPath = path.join(dir, `original${path.extname(video.fileKey!)}`);
    await storage.download(video.fileKey!, localPath);
    return { localPath, fileKey: video.fileKey! };
  }

  async function uploadChunks(videoId: string, chunks: AudioChunk[]): Promise<void> {
    for (let i = 0; i < chunks.length; i += PARALLEL_UPLOADS) {
      const batch = chunks.slice(i, i + PARALLEL_UPLOADS);
      await Promise.all(batch.map((c) => storage.upload(storageKeys.segmentAudio(videoId, c.index), c.path, "audio/mpeg")));
    }
  }

  return (video: Video) =>
    workspace.withTempDir(`video-${video.id}-`, async (dir) => {
      const { localPath, fileKey } = await fetchVideo(video, dir);
      if (!(await media.hasAudioTrack(localPath))) throw new PermanentError(MESSAGES.processing.noAudioTrack);

      const chunks = await media.splitAudio(localPath, dir, settings.segmentSeconds);
      if (chunks.length === 0) throw new PermanentError(MESSAGES.processing.noAudioExtracted);
      const duration = chunks.at(-1)!.end;

      // The split is recorded BEFORE the segments: if the process restarts in
      // between, the retry sees no segments and prepares them again.
      await uploadChunks(video.id, chunks);
      await videos.recordSplit(video.id, {
        totalSegments: chunks.length,
        durationSeconds: duration,
        fileKey: video.sourceType === "url" ? fileKey : undefined,
      });
      await thumbnails.generate(fileKey, duration, localPath);
      await segments.insertMany(
        video.id,
        chunks.map((c) => ({
          index: c.index,
          startSeconds: c.start,
          endSeconds: c.end,
          audioKey: storageKeys.segmentAudio(video.id, c.index),
        })),
      );
    });
}
