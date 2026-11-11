export interface AudioChunk {
  index: number;
  path: string;
  start: number;
  end: number;
}

/** Raw 16-bit mono PCM audio. */
export interface Pcm {
  sampleRate: number;
  samples: Buffer;
}

export interface Mp3Encoder {
  write(samples: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface MediaToolkit {
  hasAudioTrack(path: string): Promise<boolean>;
  /** Extracts the audio and cuts it into chunks of `seconds` (mono, 16 kHz MP3). */
  splitAudio(videoPath: string, outputDir: string, seconds: number): Promise<AudioChunk[]>;
  burnSubtitles(videoPath: string, srtPath: string, outputPath: string): Promise<void>;
  extractThumbnail(input: string, outputPath: string, atSecond: number): Promise<void>;
  /** Square 256×256 JPEG without metadata. */
  makeAvatar(input: string, outputPath: string): Promise<void>;
  /** Speeds audio up without changing its pitch. */
  speedUpPcm(samples: Buffer, sampleRate: number, factor: number): Promise<Buffer>;
  createMp3Encoder(sampleRate: number, outputPath: string): Mp3Encoder;
}

export interface VideoDownloader {
  /** Downloads a public video (YouTube, Vimeo, direct links…) and returns its local path. */
  download(url: string, outputDir: string): Promise<string>;
}

export interface SpeechSynthesizer {
  isVoiceAvailable(language: string): boolean;
  /**
   * Synthesizes each text and returns, per text, the WAV files of its phrases
   * in order. `onProgress` receives the finished fraction (0 to 1).
   */
  synthesize(texts: string[], language: string, dir: string, onProgress?: (fraction: number) => void): Promise<string[][]>;
  readWav(path: string): Promise<Pcm>;
}
