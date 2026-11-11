import type { Summarizer, Transcriber, Translator } from "../../application/ports/ai.js";
import { config } from "../../config/index.js";
import { PermanentError, RetryableError } from "../../domain/errors.js";
import { languageName } from "../../domain/languages.js";
import { sleep } from "../../shared/resilience.js";
import { SAMPLE_PHRASES, sampleSummary } from "./content/simulatedContent.js";

// Stand-ins for the AI when IA_MODO=simulada. They imitate the latency and the
// occasional failures of the real APIs, so live progress, retries and
// subtitles can be tested for free.

const between = (min: number, max: number) => min + Math.random() * (max - min);

async function simulateCall(stage: string, min: number, max: number) {
  await sleep(between(min, max));
  if (Math.random() < config.ai.simulatedFailureRate) throw new RetryableError(`Fallo simulado en ${stage} (429 rate limit)`);
}

let counter = 0;

export const simulatedTranscriber: Transcriber = {
  async transcribe(audio) {
    await simulateCall("transcripción", 600, 1500);
    // Two rotating phrases per segment, plus the audio size as a "fingerprint".
    const i = counter++;
    const text = `${SAMPLE_PHRASES[(2 * i) % SAMPLE_PHRASES.length]} ${SAMPLE_PHRASES[(2 * i + 1) % SAMPLE_PHRASES.length]}`;
    return { text: `${text} (${Math.round(audio.length / 1024)} KB de audio)`, language: "es" };
  },
};

export const simulatedTranslator: Translator = {
  async translate({ text, targetLanguage }) {
    await simulateCall("traducción", 500, 1200);
    return `[${languageName(targetLanguage)}] ${text}`;
  },
};

export const simulatedSummarizer: Summarizer = {
  async summarize({ language, fragments }) {
    const lines = fragments.filter((f) => f.text.trim()).map((f) => `[${f.time}] ${f.text.trim()}`);
    if (lines.length === 0) throw new PermanentError("La transcripción está vacía");
    await simulateCall("resumen", 1500, 3000);
    return sampleSummary(lines, languageName(language));
  },
};
