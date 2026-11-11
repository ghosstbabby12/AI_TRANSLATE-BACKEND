import type { TranslationRequest, Translator } from "../../application/ports/ai.js";
import { config } from "../../config/index.js";
import { languageName } from "../../domain/languages.js";
import { truncateWords } from "../../domain/textSplitting.js";
import { TRANSLATION_SYSTEM_PROMPT, translationUserMessage } from "./prompts/translationPrompt.js";
import { generateText } from "./textModel.js";

const WORDING = {
  refused: (category: string) => `El modelo rechazó traducir el segmento (${category})`,
  cutByClaude: "La traducción se cortó por max_tokens",
  cutByGroq: "La traducción se cortó por el límite de tokens",
  empty: "El modelo devolvió una traducción vacía",
};

// A 20-30 s segment is about 100 words; the cap bounds cost and latency.
const MAX_TOKENS = 2048;

export const aiTranslator: Translator = {
  async translate({ text, targetLanguage, previous }: TranslationRequest) {
    const { maxChars, maxContextChars } = config.segments;
    if (text.length > maxChars) console.warn(`Segment of ${text.length} characters trimmed to ${maxChars} (MAX_CHARS_SEGMENTO)`);

    const user = translationUserMessage({
      languageName: languageName(targetLanguage),
      previousOriginal: previous?.original ? truncateWords(previous.original, maxContextChars, "end") : undefined,
      previousTranslation: previous?.translated ? truncateWords(previous.translated, maxContextChars, "end") : undefined,
      fragment: truncateWords(text, maxChars, "start"),
    });
    return generateText({ system: TRANSLATION_SYSTEM_PROMPT, user, maxTokens: MAX_TOKENS, wording: WORDING });
  },
};
