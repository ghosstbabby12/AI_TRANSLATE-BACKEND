import { NotFoundError } from "../../domain/errors.js";
import type { Segment } from "../../domain/segment.js";
import type { Video, VideoProgress, VideoTranslation } from "../../domain/video.js";
import { MESSAGES } from "../messages.js";
import type { Deps } from "../ports/index.js";
import { downloadFileName } from "../shared/naming.js";

export interface VideoDetail {
  video: Video;
  translations: VideoTranslation[];
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  exportUrl: string | null;
  voiceAvailable: boolean;
  audioUrl: string | null;
  audioDownloadUrl: string | null;
}

export interface VideoStatusView {
  video: Video;
  progress: VideoProgress & { percent: number };
  segments: Segment[];
}

export function makeVideoQueries({ videos, segments, storage, speech }: Deps) {
  // Signing a URL is a local computation (no network), so it is cheap.
  const sign = (key: string | null, downloadName?: string) =>
    key ? storage.signedUrl(key, 3600, downloadName) : Promise.resolve(null);

  /** The user's video, or NotFoundError if it does not exist or belongs to someone else. */
  async function findOwned(id: string, userId: string): Promise<Video> {
    const video = await videos.findOwned(id, userId);
    if (!video) throw new NotFoundError(MESSAGES.videos.notFound);
    return video;
  }

  async function list(userId: string) {
    const rows = await videos.listByUser(userId);
    return Promise.all(rows.map(async (video) => ({ video, thumbnailUrl: await sign(video.thumbnailKey) })));
  }

  async function detail(video: Video): Promise<VideoDetail> {
    const audioKey = video.audio.status === "ready" ? video.audio.key : null;
    const exportKey = video.export.status === "ready" ? video.export.key : null;
    return {
      video,
      translations: video.fileKey ? await videos.listTranslations(video.userId, video.fileKey) : [],
      playbackUrl: await sign(video.fileKey),
      thumbnailUrl: await sign(video.thumbnailKey),
      exportUrl: await sign(exportKey, downloadFileName(video, "mp4")),
      voiceAvailable: speech.isVoiceAvailable(video.targetLanguage),
      audioUrl: await sign(audioKey),
      audioDownloadUrl: await sign(audioKey, downloadFileName(video, "mp3", "-audio")),
    };
  }

  /** Polled by the frontend every few seconds while the video is translated. */
  async function status(video: Video): Promise<VideoStatusView> {
    const [progress, all] = await Promise.all([segments.progress(video.id), segments.list(video.id)]);
    const total = video.totalSegments ?? progress.total;
    const percent = total ? Math.round((progress.ready / total) * 100) : 0;
    return { video, progress: { ...progress, total, percent }, segments: all };
  }

  return { findOwned, list, detail, status };
}
