import { spawn } from "node:child_process";
import type { Mp3Encoder } from "../../application/ports/media.js";
import { config } from "../../config/index.js";

const { ffmpeg } = config.binaries;
const rawPcm = (sampleRate: number) => ["-f", "s16le", "-ar", String(sampleRate), "-ac", "1"];

/** Speeds raw 16-bit mono PCM up without changing its pitch (atempo filter). */
export function speedUpPcm(samples: Buffer, sampleRate: number, factor: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      ...rawPcm(sampleRate), "-i", "pipe:0",
      "-filter:a", `atempo=${factor.toFixed(3)}`,
      ...rawPcm(sampleRate), "pipe:1",
    ]);
    const output: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => output.push(d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(`ffmpeg (atempo) exited with code ${code}: ${stderr.slice(-400)}`)),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(samples);
  });
}

/** MP3 encoder fed with raw PCM in pieces: the track is built by streaming, never fully in memory. */
export function createMp3Encoder(sampleRate: number, outputPath: string): Mp3Encoder {
  const args = ["-hide_banner", "-loglevel", "error", "-y", ...rawPcm(sampleRate), "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "64k", outputPath];
  const child = spawn(ffmpeg, args);
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (mp3) exited with code ${code}: ${stderr.slice(-400)}`)),
    );
  });
  finished.catch(() => {}); // awaited in close()

  return {
    /** Respects the process backpressure. */
    write: (samples) =>
      new Promise<void>((resolve, reject) => {
        if (samples.length === 0) return resolve();
        child.stdin.write(samples, (err) => (err ? reject(err) : resolve()));
      }),
    close: async () => {
      child.stdin.end();
      await finished;
    },
  };
}
