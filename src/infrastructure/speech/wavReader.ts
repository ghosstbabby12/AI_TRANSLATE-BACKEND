import { readFile } from "node:fs/promises";
import type { Pcm } from "../../application/ports/media.js";

/** Reads a 16-bit mono PCM WAV file (what Piper produces). */
export async function readWav(file: string): Promise<Pcm> {
  const data = await readFile(file);
  if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid WAV");

  let sampleRate = 0;
  // Walk the RIFF chunks until the audio data
  for (let pos = 12; pos + 8 <= data.length; ) {
    const id = data.toString("ascii", pos, pos + 4);
    const size = data.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      const channels = data.readUInt16LE(pos + 10);
      sampleRate = data.readUInt32LE(pos + 12);
      const bits = data.readUInt16LE(pos + 22);
      if (channels !== 1 || bits !== 16) throw new Error(`Unsupported WAV (${channels} channels, ${bits} bits)`);
    } else if (id === "data") {
      if (!sampleRate) throw new Error("WAV without format");
      return { sampleRate, samples: data.subarray(pos + 8, Math.min(data.length, pos + 8 + size)) };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error("WAV without data");
}
