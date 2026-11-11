import { z } from "zod";
import { LANGUAGE_CODES } from "../../domain/languages.js";

/** Request validation. Field names follow the public API (Spanish) for compatibility. */
const email = z.email("Email inválido").trim().toLowerCase().max(254);
// Id the browser used before signing in, so its history is not lost
const anonymousId = z.uuid().optional();

export const registerSchema = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre").max(100),
  email,
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  usuario_anonimo: anonymousId,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  usuario_anonimo: anonymousId,
});

// "" or null removes the phone. Accepts +, spaces, dashes and parentheses.
const phone = z
  .union([z.string().trim(), z.null()])
  .transform((t) => (t ? t : null))
  .refine((t) => t === null || /^\+?[\d\s\-()]{7,20}$/.test(t), "Teléfono inválido (7 a 20 dígitos, puede empezar con +)");

export const profileSchema = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre").max(100).optional(),
  email: email.optional(),
  telefono: phone.optional(),
  idioma_interfaz: z.enum(["es", "en"]).optional(),
  // Required only to change the email
  contrasena_actual: z.string().max(200).optional(),
});

export const passwordSchema = z.object({
  actual: z.string().min(1, "Escribe tu contraseña actual").max(200),
  nueva: z.string().min(8, "La contraseña nueva debe tener al menos 8 caracteres").max(200),
});

export const createVideoSchema = z.object({
  idioma_destino: z.enum(LANGUAGE_CODES),
  url: z.url({ protocol: /^https?$/ }).optional(),
  nombre: z.string().trim().min(1).max(200).optional(),
});

export const videoIdSchema = z.object({ id: z.uuid() });

export const translateSchema = z.object({ idioma_destino: z.enum(LANGUAGE_CODES) });

export const renameSchema = z.object({ nombre: z.string().trim().min(1, "Escribe un nombre").max(200) });

export const formatSchema = z.object({
  formato: z.enum(["srt", "vtt", "txt", "json"]).default("json"),
  descargar: z.enum(["0", "1"]).optional(),
});
