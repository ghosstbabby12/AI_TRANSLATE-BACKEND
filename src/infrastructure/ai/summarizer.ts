import type { Summarizer, SummaryRequest } from "../../application/ports/ai.js";
import { config } from "../../config/index.js";
import { PermanentError } from "../../domain/errors.js";
import { languageName } from "../../domain/languages.js";
import { NOTES_SYSTEM_PROMPT, notesUserMessage, SUMMARY_SYSTEM_PROMPT, summaryUserMessage } from "./prompts/summaryPrompt.js";
import { generateText } from "./textModel.js";

const WORDING = {
  refused: (category: string) => `El modelo rechazó resumir el video (${category})`,
  cutByClaude: "El resumen se cortó por max_tokens",
  cutByGroq: "El resumen se cortó por el límite de tokens",
  empty: "El modelo devolvió un resumen vacío",
};
const MAX_TOKENS = 4096;

const ask = (system: string, user: string) => generateText({ system, user, maxTokens: MAX_TOKENS, wording: WORDING });

/** Groups lines into parts of at most `max` characters. */
function splitIntoParts(lines: string[], max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const raw of lines) {
    const line = raw.slice(0, max);
    if (current && current.length + line.length + 1 > max) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Short transcripts are summarized in one call. Long ones (the free Groq plan
 * limits tokens per minute) are first turned into notes part by part, and the
 * summary is written from the notes.
 */
export const aiSummarizer: Summarizer = {
  async summarize({ title, language, fragments }: SummaryRequest) {
    const lines = fragments.filter((f) => f.text.trim()).map((f) => `[${f.time}] ${f.text.trim()}`);
    if (lines.length === 0) throw new PermanentError("La transcripción está vacía");
    const name = languageName(language);
    const parts = splitIntoParts(lines, config.maxSummaryChars);

    if (parts.length === 1) return ask(SUMMARY_SYSTEM_PROMPT, summaryUserMessage(name, title, "transcripcion", parts[0]!));

    // Sequential on purpose: in parallel the per-minute limit would run out
    const notes: string[] = [];
    for (const [i, part] of parts.entries()) {
      notes.push(await ask(NOTES_SYSTEM_PROMPT, notesUserMessage(name, i + 1, parts.length, part)));
    }
    return ask(SUMMARY_SYSTEM_PROMPT, summaryUserMessage(name, title, "notas", notes.join("\n")));
  },
};
