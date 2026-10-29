import OpenAI from "openai";
import { config } from "../config.js";

// Groq expone una API compatible con la de OpenAI, así que se usa el mismo SDK
// apuntando a su URL. Se crea al primer uso (sin clave, el constructor fallaría).
let cliente: OpenAI | undefined;

export const groq = () =>
  (cliente ??= new OpenAI({
    apiKey: config.GROQ_API_KEY,
    baseURL: config.GROQ_BASE_URL,
    timeout: 60_000,
    // El plan gratuito limita peticiones por minuto: el SDK reintenta los 429
    // respetando retry-after, y si aun así falla, el segmento se reintenta luego.
    maxRetries: 3,
  }));
