import type { Mp3Encoder } from "../ports/media.js";

// A translation is usually longer than the original. A phrase that does not
// fit its slot is sped up, but never beyond this (faster is hard to follow).
const MAX_SPEED_UP = 1.35;

export interface TrackClip {
  startSeconds: number;
  endSeconds: number;
  samples: Buffer;
}

/**
 * Writes clips onto one continuous track: each starts at its timestamp (or
 * right after the previous one if that ran long), with silence in between.
 */
export class AudioTrackWriter {
  private cursor = 0; // in samples
  private readonly second: Buffer;

  constructor(
    private readonly encoder: Mp3Encoder,
    private readonly sampleRate: number,
    private readonly speedUp: (samples: Buffer, factor: number) => Promise<Buffer>,
  ) {
    this.second = Buffer.alloc(sampleRate * 2); // 1 s of silence (16 bits per sample)
  }

  async add(clip: TrackClip): Promise<void> {
    const rate = this.sampleRate;
    const start = Math.max(Math.round(clip.startSeconds * rate), this.cursor);
    const available = Math.round(clip.endSeconds * rate) - start;
    let samples = clip.samples;
    const length = samples.length / 2;
    if (available > rate * 0.3 && length > available * 1.03) {
      samples = await this.speedUp(samples, Math.min(length / available, MAX_SPEED_UP));
    }
    await this.silence(start - this.cursor);
    await this.encoder.write(samples);
    this.cursor = start + samples.length / 2;
  }

  /** Pads with silence up to the video's length, so track and video last the same. */
  async padTo(seconds: number): Promise<void> {
    await this.silence(Math.round(seconds * this.sampleRate) - this.cursor);
  }

  private async silence(count: number): Promise<void> {
    for (let left = count; left > 0; left -= this.sampleRate) {
      await this.encoder.write(this.second.subarray(0, Math.min(left, this.sampleRate) * 2));
    }
  }
}
