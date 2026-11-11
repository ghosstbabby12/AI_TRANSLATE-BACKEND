import { toFile } from "openai";
import type { Transcriber } from "../../application/ports/ai.js";
import { config } from "../../config/index.js";
import { callProvider } from "./aiErrors.js";
import { groq, openai } from "./clients/clients.js";

// Whisper reports the language name in English ("spanish"); the code is stored.
const LANGUAGE_CODES: Record<string, string> = {
  spanish: "es", english: "en", portuguese: "pt", french: "fr", german: "de", italian: "it",
  japanese: "ja", korean: "ko", chinese: "zh", russian: "ru", arabic: "ar", hindi: "hi",
  dutch: "nl", catalan: "ca", polish: "pl", turkish: "tr", indonesian: "id",
};

const toLanguageCode = (name?: string) => (name ? (LANGUAGE_CODES[name.toLowerCase()] ?? name.toLowerCase()) : undefined);

const HINT_CHARS = 200;

/** Speech to text with Whisper (Groq or OpenAI). */
export const whisperTranscriber: Transcriber = {
  transcribe: (audio, hint) =>
    callProvider(async () => {
      const file = await toFile(audio, "segmento.mp3", { type: "audio/mpeg" });
      const prompt = hint ? hint.slice(-HINT_CHARS) : undefined;
      const useGroq = config.ai.sttProvider === "groq";
      const api = useGroq ? groq() : openai();
      const model = useGroq ? config.ai.groq.sttModel : config.ai.openai.sttModel;

      // whisper-1 and Groq's Whisper accept verbose_json, which includes the language.
      if (useGroq || model === "whisper-1") {
        const result = await api.audio.transcriptions.create({ file, model, response_format: "verbose_json", prompt });
        return { text: result.text.trim(), language: toLanguageCode(result.language) };
      }
      // gpt-4o-transcribe models only return text
      const result = await api.audio.transcriptions.create({ file, model, response_format: "json", prompt });
      return { text: result.text.trim() };
    }),
};
