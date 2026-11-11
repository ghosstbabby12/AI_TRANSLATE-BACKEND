import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { config } from "../../config/index.js";

/**
 * One Piper voice per target language (Piper has no Japanese or Korean voices).
 * The lightest ones ("x_low"/"low") are used: a "medium" or "high" voice goes
 * over 400 MB while synthesizing and, together with the API, does not fit in
 * the 512 MB of Render's free plan. More: https://huggingface.co/rhasspy/piper-voices
 */
const VOICES: Record<string, string> = {
  es: "es_ES-carlfm-x_low",
  en: "en_US-lessac-low",
  pt: "pt_BR-edresson-low",
  fr: "fr_FR-siwis-low",
  de: "de_DE-eva_k-x_low",
  it: "it_IT-riccardo-x_low",
  zh: "zh_CN-huayan-x_low",
};

const VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

export const hasVoice = (language: string) => language in VOICES;

/** es_MX-claude-high → es/es_MX/claude/high/es_MX-claude-high */
function remotePath(voice: string): string {
  const [locale, speaker, quality] = voice.split("-") as [string, string, string];
  return `${locale.split("_")[0]}/${locale}/${speaker}/${quality}/${voice}`;
}

const exists = (file: string) => access(file).then(() => true, () => false);

/** Downloads to a temporary file and then renames it: a half-finished download never looks complete. */
async function download(url: string, destination: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar la voz (${res.status}): ${url}`);
  const partial = `${destination}.${process.pid}.parcial`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(partial));
    await rename(partial, destination);
  } finally {
    await rm(partial, { force: true });
  }
}

// One download per voice even if several jobs ask for it at once
const inProgress = new Map<string, Promise<string>>();

/** Local path of the voice model; downloaded the first time it is needed (20-60 MB). */
export function ensureVoice(language: string): Promise<string> {
  const voice = VOICES[language];
  if (!voice) return Promise.reject(new Error(`No hay voz para el idioma ${language}`));
  const running = inProgress.get(voice);
  if (running) return running;

  const task = (async () => {
    await mkdir(config.voicesDir, { recursive: true });
    for (const extension of [".onnx", ".onnx.json"]) {
      const local = path.join(config.voicesDir, `${voice}${extension}`);
      if (await exists(local)) continue;
      console.log(`[voice] downloading ${voice}${extension}`);
      await download(`${VOICES_URL}/${remotePath(voice)}${extension}`, local);
    }
    return path.join(config.voicesDir, `${voice}.onnx`);
  })().finally(() => inProgress.delete(voice));
  inProgress.set(voice, task);
  return task;
}
