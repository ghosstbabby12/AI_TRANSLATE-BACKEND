import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { PermanentError, RetryableError } from "../../domain/errors.js";

// 408 timeout, 409 conflict, 429 rate limit and 5xx (including 529 overloaded) are worth retrying.
const isRetryableStatus = (status: number | undefined) =>
  status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;

const byStatus = (message: string, status: number | undefined) =>
  isRetryableStatus(status) ? new RetryableError(message) : new PermanentError(message);

/** Turns provider SDK errors into domain errors, so the rest of the app knows nothing about the SDKs. */
export function toDomainError(err: unknown): unknown {
  // Network errors first: they also extend APIError.
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return new RetryableError(`Conexión: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) return byStatus(`Claude ${err.status}: ${err.message}`, err.status);
  // OpenAI and Groq share the SDK
  if (err instanceof OpenAI.APIError) {
    if (err.status === 404) return new PermanentError(`Modelo no encontrado (¿retirado por el proveedor?): ${err.message}`);
    return byStatus(`IA ${err.status}: ${err.message}`, err.status);
  }
  return err;
}

/** Runs a provider call and translates its errors. */
export async function callProvider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw toDomainError(err);
  }
}
