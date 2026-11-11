export interface FileStorage {
  upload(key: string, localPath: string, contentType: string): Promise<void>;
  download(key: string, localPath: string): Promise<void>;
  downloadBuffer(key: string): Promise<Buffer>;
  /** Temporary URL for the browser; with `downloadName` it downloads instead of opening. */
  signedUrl(key: string, seconds?: number, downloadName?: string): Promise<string>;
  /** Temporary URL for tools running on the server (internal endpoint). */
  internalUrl(key: string, seconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

export interface JobQueue {
  enqueueVideo(videoId: string): Promise<void>;
  enqueueSegmentRetry(segmentId: string, attempts: number): Promise<void>;
  enqueueExport(videoId: string): Promise<void>;
  enqueueSummary(videoId: string): Promise<void>;
  enqueueAudio(videoId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
  /** A hash to verify against when the email does not exist, so both cases take the same time. */
  readonly dummyHash: string;
}

export interface TokenService {
  sign(userId: string): Promise<string>;
  /** The user id, or null if the token is invalid or expired. */
  verify(token: string): Promise<string | null>;
}

export interface LoginLimiter {
  isBlocked(ip: string, email: string): Promise<boolean>;
  recordFailure(ip: string, email: string): Promise<void>;
  reset(ip: string, email: string): Promise<void>;
}

export interface Workspace {
  /** Runs `work` inside a new temporary folder that is always deleted afterwards. */
  withTempDir<T>(prefix: string, work: (dir: string) => Promise<T>): Promise<T>;
  writeText(path: string, text: string): Promise<void>;
}
