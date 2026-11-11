import { readdir } from "node:fs/promises";
import path from "node:path";
import type { AudioChunk } from "../../application/ports/media.js";
import { config } from "../../config/index.js";
import { runProcess } from "./runProcess.js";

const { ffmpeg, ffprobe } = config.binaries;
const round = (n: number) => Math.round(n * 1000) / 1000;
// Leftover chunks shorter than this hold no speech.
const MIN_CHUNK_SECONDS = 0.3;

export async function durationSeconds(file: string): Promise<number> {
  const out = await runProcess(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const duration = Number.parseFloat(out.trim());
  if (!Number.isFinite(duration)) throw new Error(`No se pudo leer la duración de ${file}`);
  return duration;
}

export async function hasAudioTrack(file: string): Promise<boolean> {
  const out = await runProcess(ffprobe, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
  return out.trim().length > 0;
}

/**
 * One ffmpeg pass: drops the picture, converts the audio to what speech-to-text
 * needs (mono, 16 kHz, 32 kbps MP3, ~80 KB every 20 s) and cuts it into chunks.
 * Real chunk times are read with ffprobe: the muxer cuts at packet boundaries.
 */
export async function splitAudio(videoPath: string, outputDir: string, seconds: number): Promise<AudioChunk[]> {
  await runProcess(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-i", videoPath,
    "-vn", "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(seconds), "-reset_timestamps", "1",
    path.join(outputDir, "trozo_%05d.mp3"),
  ]);

  const files = (await readdir(outputDir)).filter((f) => /^trozo_\d{5}\.mp3$/.test(f)).sort();
  const chunks: AudioChunk[] = [];
  let start = 0;
  for (const [index, file] of files.entries()) {
    const chunkPath = path.join(outputDir, file);
    const duration = await durationSeconds(chunkPath);
    if (duration < MIN_CHUNK_SECONDS) continue;
    chunks.push({ index, path: chunkPath, start: round(start), end: round(start + duration) });
    start += duration;
  }
  return chunks;
}
