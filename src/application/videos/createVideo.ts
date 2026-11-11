import { randomUUID } from "node:crypto";
import path from "node:path";
import { BadRequestError } from "../../domain/errors.js";
import type { Video } from "../../domain/video.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { enqueueOrDefer } from "../shared/enqueue.js";
import { storageKeys } from "../shared/storageKeys.js";

export interface UploadedFile {
  path: string;
  originalName: string;
  mimeType: string;
}

export interface CreateVideoInput {
  userId: string;
  targetLanguage: string;
  name?: string;
  url?: string;
  file?: UploadedFile;
}

/** Saves a new video (uploaded file or public link) and queues its translation. */
export function makeCreateVideo({ videos, storage, jobs }: Deps) {
  return async ({ userId, targetLanguage, name, url, file }: CreateVideoInput): Promise<Video> => {
    if (!file === !url) throw new BadRequestError(MESSAGES.videos.fileOrUrl);

    const id = randomUUID();
    let fileKey: string | null = null;
    if (file) {
      fileKey = storageKeys.originalVideo(id, path.extname(file.originalName).toLowerCase() || ".mp4");
      await storage.upload(fileKey, file.path, file.mimeType);
    }

    const video = await videos.create({
      id,
      userId,
      name: name ?? file?.originalName ?? url!,
      sourceType: file ? "file" : "url",
      sourceUrl: url ?? null,
      fileKey,
      targetLanguage,
    });
    await enqueueOrDefer(() => jobs.enqueueVideo(video.id), `videos ${video.id}`);
    return video;
  };
}
