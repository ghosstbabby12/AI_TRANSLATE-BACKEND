export type SegmentStatus = "pending" | "processing" | "ready" | "failed";

/** A slice of the video's audio (about 20 s) that is transcribed and translated on its own. */
export interface Segment {
  id: string;
  videoId: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  audioKey: string;
  originalText: string | null;
  translatedText: string | null;
  status: SegmentStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: Date;
}

export interface NewSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  audioKey: string;
}
