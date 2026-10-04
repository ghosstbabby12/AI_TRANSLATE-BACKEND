import { config } from "../config.js";
import { nombreIdioma } from "../idiomas.js";
import { ErrorIA } from "./errores.js";
import type { ResultadoTranscripcion } from "./transcripcion.js";

// Sustitutos de STT y LLM para IA_MODO=simulada. Imitan la latencia y los
// fallos ocasionales de las APIs reales para que el progreso en vivo, los
// reintentos y los subtítulos se puedan probar sin gastar nada.

const FRASES = [
  "Hola a todos y bienvenidos a este video.",
  "Hoy vamos a ver cómo funciona este sistema paso a paso.",
  "Primero se extrae el audio y se divide en segmentos cortos.",
  "Cada segmento se transcribe y luego se traduce con contexto.",
  "Así los subtítulos aparecen mientras el resto se sigue procesando.",
  "Si un segmento falla, se reintenta sin detener a los demás.",
  "Al final se pueden descargar los subtítulos en SRT o VTT.",
  "Gracias por mirar, nos vemos en el próximo video.",
];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const azar = (min: number, max: number) => min + Math.random() * (max - min);

function quizasFallar(etapa: string) {
  if (Math.random() < config.IA_SIMULADA_FALLOS) {
    throw new ErrorIA(`Fallo simulado en ${etapa} (429 rate limit)`, true);
  }
}

let contador = 0;

export async function transcribirSimulado(audio: Buffer): Promise<ResultadoTranscripcion> {
  await esperar(azar(600, 1500));
  quizasFallar("transcripción");
  // Dos frases por segmento, rotando, más el tamaño del audio como "huella".
  const i = contador++;
  const texto = `${FRASES[(2 * i) % FRASES.length]} ${FRASES[(2 * i + 1) % FRASES.length]}`;
  return { texto: `${texto} (${Math.round(audio.length / 1024)} KB de audio)`, idioma: "es" };
}

export async function traducirSimulado(texto: string, idiomaDestino: string): Promise<string> {
  await esperar(azar(500, 1200));
  quizasFallar("traducción");
  return `[${nombreIdioma(idiomaDestino)}] ${texto}`;
}
