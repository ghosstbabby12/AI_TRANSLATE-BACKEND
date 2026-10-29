import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { groq } from "./groq.js";
import { transcribirSimulado } from "./simulada.js";

// Se crea al primer uso: en modo simulado no hay clave y el constructor fallaría.
let cliente: OpenAI | undefined;
const openai = () =>
  (cliente ??= new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 60_000, maxRetries: 2 }));

export interface ResultadoTranscripcion {
  texto: string;
  /** Código ISO del idioma detectado (whisper-1 y los Whisper de Groq lo devuelven). */
  idioma?: string;
}

// Whisper devuelve el nombre del idioma en inglés ("spanish"); se guarda el código.
const CODIGOS: Record<string, string> = {
  spanish: "es", english: "en", portuguese: "pt", french: "fr", german: "de", italian: "it",
  japanese: "ja", korean: "ko", chinese: "zh", russian: "ru", arabic: "ar", hindi: "hi",
  dutch: "nl", catalan: "ca", polish: "pl", turkish: "tr", indonesian: "id",
};
const codigoIdioma = (nombre?: string) => (nombre ? (CODIGOS[nombre.toLowerCase()] ?? nombre.toLowerCase()) : undefined);

/**
 * Transcribe un trozo de audio (~20 s, < 100 KB). `pista` es el final del
 * segmento anterior: Whisper lo usa como contexto para no cortar palabras ni
 * cambiar la ortografía de nombres propios entre segmentos.
 */
export async function transcribir(audio: Buffer, pista?: string | null): Promise<ResultadoTranscripcion> {
  if (config.IA_MODO === "simulada") return transcribirSimulado(audio);

  const file = await toFile(audio, "segmento.mp3", { type: "audio/mpeg" });
  const prompt = pista ? pista.slice(-200) : undefined;

  // whisper-1 y los Whisper de Groq aceptan verbose_json, que trae el idioma.
  const conIdioma = config.STT_PROVEEDOR === "groq" || config.STT_MODEL === "whisper-1";
  const [api, modelo] =
    config.STT_PROVEEDOR === "groq" ? [groq(), config.GROQ_STT_MODEL] : [openai(), config.STT_MODEL];

  if (conIdioma) {
    const r = await api.audio.transcriptions.create({ file, model: modelo, response_format: "verbose_json", prompt });
    return { texto: r.text.trim(), idioma: codigoIdioma(r.language) };
  }

  // gpt-4o-transcribe / gpt-4o-mini-transcribe solo devuelven texto
  const r = await api.audio.transcriptions.create({ file, model: modelo, response_format: "json", prompt });
  return { texto: r.text.trim() };
}
