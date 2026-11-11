import type { Summarizer, Transcriber, Translator } from "./ai.js";
import type { MediaToolkit, SpeechSynthesizer, VideoDownloader } from "./media.js";
import type { SegmentRepository, UserRepository, VideoRepository } from "./repositories.js";
import type { FileStorage, JobQueue, LoginLimiter, PasswordHasher, TokenService, Workspace } from "./services.js";

/** Everything the use cases need from the outside world, wired in container.ts. */
export interface Deps {
  videos: VideoRepository;
  segments: SegmentRepository;
  users: UserRepository;
  storage: FileStorage;
  jobs: JobQueue;
  transcriber: Transcriber;
  translator: Translator;
  summarizer: Summarizer;
  media: MediaToolkit;
  downloader: VideoDownloader;
  speech: SpeechSynthesizer;
  passwords: PasswordHasher;
  tokens: TokenService;
  loginLimiter: LoginLimiter;
  workspace: Workspace;
  settings: {
    segmentSeconds: number;
    maxSegmentAttempts: number;
  };
}
