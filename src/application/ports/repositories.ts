import type { NewSegment, Segment } from "../../domain/segment.js";
import type { ProfileChanges, User } from "../../domain/user.js";
import type { SourceType, TaskStatus, Video, VideoProgress, VideoStatus, VideoTranslation } from "../../domain/video.js";

export interface NewVideo {
  id: string;
  userId: string;
  name: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  fileKey: string | null;
  targetLanguage: string;
}

export interface TaskUpdate {
  status: TaskStatus | null;
  key?: string | null;
  error?: string | null;
}

export interface UnfinishedWork {
  videos: string[];
  exports: string[];
  summaries: string[];
  audios: string[];
}

export interface VideoRepository {
  create(video: NewVideo): Promise<Video>;
  findById(id: string): Promise<Video | null>;
  findOwned(id: string, userId: string): Promise<Video | null>;
  listByUser(userId: string, limit?: number): Promise<(Video & { readySegments: number })[]>;
  setStatus(id: string, status: VideoStatus, error?: string | null): Promise<void>;
  recordSplit(id: string, split: { totalSegments: number; durationSeconds: number; fileKey?: string }): Promise<void>;
  setSourceLanguage(id: string, language: string): Promise<void>;
  setExport(id: string, update: TaskUpdate): Promise<void>;
  setAudio(id: string, update: TaskUpdate): Promise<void>;
  setAudioProgress(id: string, percent: number): Promise<void>;
  countAudioAttempt(id: string): Promise<number>;
  /** When `text` is undefined the previous summary is kept. */
  setSummary(id: string, update: { status: TaskStatus | null; text?: string | null; error?: string | null }): Promise<void>;
  createTranslation(sourceId: string, targetLanguage: string): Promise<Video>;
  listTranslations(userId: string, fileKey: string): Promise<VideoTranslation[]>;
  rename(video: Pick<Video, "id" | "userId" | "fileKey">, name: string): Promise<number>;
  delete(id: string): Promise<void>;
  countFileUsage(fileKey: string): Promise<number>;
  setThumbnail(fileKey: string, thumbnailKey: string): Promise<void>;
  filesWithoutThumbnail(limit: number): Promise<{ fileKey: string; durationSeconds: number | null }[]>;
  transferAnonymousVideos(anonymousId: string, userId: string): Promise<number>;
  findUnfinishedWork(): Promise<UnfinishedWork>;
}

export interface SegmentRepository {
  insertMany(videoId: string, segments: NewSegment[]): Promise<void>;
  list(videoId: string): Promise<Segment[]>;
  listReady(videoId: string): Promise<Segment[]>;
  findById(id: string): Promise<Segment | null>;
  findPrevious(videoId: string, index: number): Promise<Segment | null>;
  /** Atomically moves a segment from pending to processing; null if someone else took it. */
  claim(id: string): Promise<Segment | null>;
  releaseStuck(videoId: string): Promise<void>;
  saveTranscript(id: string, text: string): Promise<void>;
  markReady(id: string, translatedText: string): Promise<void>;
  recordFailure(id: string, message: string, maxAttempts: number, retryable: boolean): Promise<Segment | null>;
  progress(videoId: string): Promise<VideoProgress>;
  resetFailed(videoId: string): Promise<string[]>;
}

export interface UserRepository {
  /** Returns null if the email is already registered. */
  create(user: { name: string; email: string; passwordHash: string }): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Returns null if the new email belongs to another account. */
  updateProfile(id: string, changes: ProfileChanges): Promise<User | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  /** Returns the previous photo key so it can be deleted. */
  setPhoto(id: string, photoKey: string | null): Promise<string | null>;
}
