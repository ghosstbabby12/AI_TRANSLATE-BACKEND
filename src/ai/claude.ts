import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

// Se crea al primer uso: sin clave (modo simulado o Groq) el constructor fallaría.
let cliente: Anthropic | undefined;

export const anthropic = () =>
  (cliente ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 }));

const esHaiku = config.CLAUDE_MODEL.startsWith("claude-haiku");

/**
 * Opciones comunes de las llamadas a Claude. Haiku 4.5 no acepta `effort` ni
 * fallbacks del servidor. Con los fallbacks, si el clasificador de seguridad
 * rechaza un texto (falso positivo con, p. ej., un documental de
 * ciberseguridad), el servidor lo reintenta en el modelo de respaldo
 * recomendado en la misma llamada.
 */
export const opcionesClaude = () =>
  esHaiku
    ? {}
    : {
        output_config: { effort: config.CLAUDE_EFFORT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      };
