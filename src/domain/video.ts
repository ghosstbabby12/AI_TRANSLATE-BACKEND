export type VideoStatus = "pending" | "processing" | "completed" | "failed";
export type SourceType = "file" | "url";
/** State of an on-demand task: subtitled export, summary or narrated audio. */
export type TaskStatus = "processing" | "ready" | "failed";

export interface TaskState {
  status: TaskStatus | null;
  error: string | null;
}

export interface Video {
  id: string;
  userId: string;
  name: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  /** Key of the original file in object storage. Translations of the same file share it. */
  fileKey: string | null;
  targetLanguage: string;
  sourceLanguage: string | null;
  status: VideoStatus;
  totalSegments: number | null;
  durationSeconds: number | null;
  error: string | null;
  thumbnailKey: string | null;
  export: TaskState & { key: string | null };
  summary: TaskState & { text: string | null; createdAt: Date | null };
  audio: TaskState & { key: string | null; progress: number | null; attempts: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoProgress {
  total: number;
  ready: number;
  pending: number;
  processing: number;
  failed: number;
}

/** Another language version of the same uploaded file. */
export type VideoTranslation = Pick<Video, "id" | "targetLanguage" | "status">;

/** The translation is still running while the video is pending or processing. */
export const isVideoBusy = (video: Pick<Video, "status">) =>
  video.status === "pending" || video.status === "processing";
