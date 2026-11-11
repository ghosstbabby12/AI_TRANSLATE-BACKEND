import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { SpeechSynthesizer } from "../../application/ports/media.js";
import { config } from "../../config/index.js";
import { splitIntoPhrases } from "../../domain/textSplitting.js";
import { ensureVoice, hasVoice } from "./voiceCatalog.js";
import { readWav } from "./wavReader.js";

// Piper's memory grows with each phrase's length and with the phrases it has
// done: short phrases and a new process every few phrases keep it low.
const MAX_PHRASE_CHARS = 160;
const PHRASES_PER_PROCESS = 8;
// A batch of 8 phrases takes seconds; past this, Piper is stuck.
const BATCH_TIMEOUT_MS = 10 * 60_000;

interface PiperLine {
  text: string;
  output_file: string;
}

/** One Piper process for a batch of phrases; `onPhraseDone` fires as each WAV is written. */
function runPiper(model: string, batch: PiperLine[], onPhraseDone: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.binaries.piper, ["--model", model, "--json-input", "--sentence_silence", "0.15"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), BATCH_TIMEOUT_MS);
    let stderr = "";
    let pending = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    // Piper prints the path of each finished WAV on stdout
    child.stdout.on("data", (d) => {
      const lines = (pending + d).split("\n");
      pending = lines.pop() ?? "";
      lines.filter((l) => l.trim()).forEach(onPhraseDone);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const reason = code === null ? `por la señal ${signal}` : `con código ${code}`;
      reject(new Error(`piper terminó ${reason}: ${stderr.trim().slice(-600)}`));
    });
    child.stdin.on("error", () => {}); // if Piper dies, the error arrives through "close"
    child.stdin.end(batch.map((line) => JSON.stringify(line)).join("\n") + "\n");
  });
}

const exists = (file: string) => access(file).then(() => true, () => false);

/** Free synthetic voice that runs on the server's CPU (https://github.com/rhasspy/piper). */
export const piperSynthesizer: SpeechSynthesizer = {
  isVoiceAvailable: hasVoice,
  readWav,

  async synthesize(texts, language, dir, onProgress) {
    const model = await ensureVoice(language);
    const perText: string[][] = texts.map(() => []);
    const lines: PiperLine[] = [];
    texts.forEach((text, i) => {
      for (const phrase of splitIntoPhrases(text, MAX_PHRASE_CHARS)) {
        const file = path.join(dir, `voz-${String(lines.length).padStart(6, "0")}.wav`);
        lines.push({ text: phrase, output_file: file });
        perText[i]!.push(file);
      }
    });

    let done = 0;
    for (let i = 0; i < lines.length; i += PHRASES_PER_PROCESS) {
      await runPiper(model, lines.slice(i, i + PHRASES_PER_PROCESS), () => onProgress?.(++done / lines.length));
    }
    for (const line of lines) {
      if (!(await exists(line.output_file))) throw new Error(`piper no generó ${path.basename(line.output_file)}`);
    }
    return perText;
  },
};
