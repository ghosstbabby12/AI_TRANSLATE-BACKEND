import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** Error de IA con indicación explícita de si vale la pena reintentar. */
export class ErrorIA extends Error {
  constructor(
    message: string,
    readonly recuperable: boolean,
  ) {
    super(message);
    this.name = "ErrorIA";
  }
}

// 408 timeout, 409 conflicto, 429 rate limit, 5xx (incluye 529 overloaded)
const esStatusRecuperable = (status: number | undefined) =>
  status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;

/**
 * Decide si un fallo de un segmento se reintenta más tarde o se da por perdido.
 * Los SDK ya reintentan 2 veces internamente; esto es la capa siguiente,
 * con backoff de minutos y repartida entre workers.
 */
export function clasificarError(err: unknown): { mensaje: string; recuperable: boolean } {
  if (err instanceof ErrorIA) return { mensaje: err.message, recuperable: err.recuperable };

  // Errores de red / timeout (se revisan antes porque también extienden APIError)
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return { mensaje: `Conexión: ${err.message}`, recuperable: true };
  }
  if (err instanceof Anthropic.APIError) {
    return { mensaje: `Claude ${err.status}: ${err.message}`, recuperable: esStatusRecuperable(err.status) };
  }
  if (err instanceof OpenAI.APIError) {
    return { mensaje: `STT ${err.status}: ${err.message}`, recuperable: esStatusRecuperable(err.status) };
  }

  // Cualquier otra cosa (S3 caído, disco, etc.): se asume transitorio.
  return { mensaje: err instanceof Error ? err.message : String(err), recuperable: true };
}
