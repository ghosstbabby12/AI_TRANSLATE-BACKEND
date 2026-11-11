import { config } from "../../config/index.js";
import { PermanentError, RetryableError } from "../../domain/errors.js";
import { callProvider } from "./aiErrors.js";
import { anthropic, groq } from "./clients/clients.js";

/** Error texts per task, saved in the database when a call fails. */
export interface TaskWording {
  refused: (category: string) => string;
  cutByClaude: string;
  cutByGroq: string;
  empty: string;
}

export interface TextRequest {
  system: string;
  user: string;
  maxTokens: number;
  wording: TaskWording;
}

const { claude } = config.ai;
const isHaiku = claude.model.startsWith("claude-haiku");
// Groq's gpt-oss models reason before answering; "low" is enough here.
const isGptOss = config.ai.groq.textModel.startsWith("openai/gpt-oss");

/**
 * Claude options. Haiku does not accept `effort` nor server fallbacks. With
 * fallbacks, if the safety classifier refuses a text (a false positive), the
 * server retries it on the recommended backup model in the same call.
 */
const claudeOptions = () =>
  isHaiku
    ? {}
    : { output_config: { effort: claude.effort }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

async function withClaude({ system, user, maxTokens, wording }: TextRequest): Promise<string> {
  const response = await anthropic().beta.messages.create({
    model: claude.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...claudeOptions(),
  });
  if (response.stop_reason === "refusal") throw new PermanentError(wording.refused(response.stop_details?.category ?? "sin categoría"));
  if (response.stop_reason === "max_tokens") throw new RetryableError(wording.cutByClaude);
  return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

async function withGroq({ system, user, maxTokens, wording }: TextRequest): Promise<string> {
  const response = await groq().chat.completions.create({
    model: config.ai.groq.textModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // Low: a translation must be faithful, not creative
    temperature: 0.3,
    // Includes the model's reasoning besides the answer
    max_completion_tokens: maxTokens,
    ...(isGptOss ? { reasoning_effort: "low" as const } : {}),
  });
  const choice = response.choices[0];
  if (choice?.finish_reason === "length") throw new RetryableError(wording.cutByGroq);
  // Some open models include their reasoning between <think>…</think>
  return (choice?.message.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** One call to the configured text model (Claude or Groq). */
export async function generateText(request: TextRequest): Promise<string> {
  const run = config.ai.textProvider === "groq" ? withGroq : withClaude;
  const text = await callProvider(() => run(request));
  if (!text) throw new RetryableError(request.wording.empty);
  return text;
}
