import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { transcribirSimulado } from "./simulada.js";

// Se crea al primer uso: en modo simulado no hay clave y el constructor fallaría.
let cliente: OpenAI | undefined;
const openai = () =>
  (cliente ??= new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 60_000, maxRetries: 2 }));

export interface ResultadoTranscripcion {
  texto: string;
  /** Idioma detectado (solo lo devuelve whisper-1 con verbose_json). */
  idioma?: string;
}

/**
 * Transcribe un trozo de audio (~20 s, < 100 KB). `pista` es el final del
 * segmento anterior: Whisper lo usa como contexto para no cortar palabras ni
 * cambiar la ortografía de nombres propios entre segmentos.
 */
export async function transcribir(audio: Buffer, pista?: string | null): Promise<ResultadoTranscripcion> {
  if (config.IA_MODO === "simulada") return transcribirSimulado(audio);

  const file = await toFile(audio, "segmento.mp3", { type: "audio/mpeg" });
  const prompt = pista ? pista.slice(-200) : undefined;

  if (config.STT_MODEL === "whisper-1") {
    const r = await openai().audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      prompt,
    });
    return { texto: r.text.trim(), idioma: r.language };
  }

  // gpt-4o-transcribe / gpt-4o-mini-transcribe solo devuelven texto
  const r = await openai().audio.transcriptions.create({
    file,
    model: config.STT_MODEL,
    response_format: "json",
    prompt,
  });
  return { texto: r.text.trim() };
}
