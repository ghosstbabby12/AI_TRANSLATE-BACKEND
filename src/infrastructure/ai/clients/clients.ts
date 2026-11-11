import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../../config/index.js";

// Clients are created on first use: without a key (simulated mode or another
// provider) their constructors would fail.
let anthropicClient: Anthropic | undefined;
let groqClient: OpenAI | undefined;
let openaiClient: OpenAI | undefined;

export const anthropic = () =>
  (anthropicClient ??= new Anthropic({ apiKey: config.ai.claude.apiKey, timeout: 60_000, maxRetries: 2 }));

/** Groq exposes an OpenAI-compatible API, so the same SDK is used with its URL. */
export const groq = () =>
  (groqClient ??= new OpenAI({
    apiKey: config.ai.groq.apiKey,
    baseURL: config.ai.groq.baseUrl,
    timeout: 60_000,
    // The free plan limits requests per minute: the SDK retries 429s honoring retry-after.
    maxRetries: 3,
  }));

export const openai = () => (openaiClient ??= new OpenAI({ apiKey: config.ai.openai.apiKey, timeout: 60_000, maxRetries: 2 }));
