import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { config } from "../config.js";

/**
 * Voz sintética con Piper (https://github.com/rhasspy/piper): libre, sin
 * clave ni costo, corre en la CPU del servidor. Una voz por idioma destino;
 * Piper no tiene voces en japonés ni coreano.
 *
 * Se usan las voces más livianas ("x_low"/"low"): una "medium" o "high" pasa
 * de 400 MB al sintetizar y, junto con la API, no cabe en los 512 MB del plan
 * gratuito de Render (el proceso muere por falta de memoria). Con más memoria
 * se pueden cambiar por otras de https://huggingface.co/rhasspy/piper-voices.
 */
const VOCES: Record<string, string> = {
  es: "es_ES-carlfm-x_low",
  en: "en_US-lessac-low",
  pt: "pt_BR-edresson-low",
  fr: "fr_FR-siwis-low",
  de: "de_DE-eva_k-x_low",
  it: "it_IT-riccardo-x_low",
  zh: "zh_CN-huayan-x_low",
};

export const vozDisponible = (idioma: string) => idioma in VOCES;

const URL_VOCES = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";

/** es_MX-claude-high → es/es_MX/claude/high/es_MX-claude-high */
function rutaRemota(nombre: string): string {
  const [locale, hablante, calidad] = nombre.split("-") as [string, string, string];
  return `${locale.split("_")[0]}/${locale}/${hablante}/${calidad}/${nombre}`;
}

async function existe(ruta: string) {
  return access(ruta).then(
    () => true,
    () => false,
  );
}

async function descargar(url: string, destino: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar la voz (${res.status}): ${url}`);
  // A un archivo temporal y luego rename: un fallo a medias no deja una voz corrupta en la caché
  const temporal = `${destino}.${process.pid}.parcial`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(temporal));
    await rename(temporal, destino);
  } finally {
    await rm(temporal, { force: true });
  }
}

// Una sola descarga por voz aunque lleguen varios trabajos a la vez
const enCurso = new Map<string, Promise<string>>();

/** Ruta local del modelo .onnx de la voz; lo descarga la primera vez (~60 MB). */
function asegurarVoz(idioma: string): Promise<string> {
  const nombre = VOCES[idioma];
  if (!nombre) return Promise.reject(new Error(`No hay voz para el idioma ${idioma}`));
  const previa = enCurso.get(nombre);
  if (previa) return previa;

  const tarea = (async () => {
    await mkdir(config.VOCES_DIR, { recursive: true });
    const modelo = path.join(config.VOCES_DIR, `${nombre}.onnx`);
    for (const ext of [".onnx", ".onnx.json"]) {
      const local = path.join(config.VOCES_DIR, `${nombre}${ext}`);
      if (!(await existe(local))) {
        console.log(`[voz] descargando ${nombre}${ext}`);
        await descargar(`${URL_VOCES}/${rutaRemota(nombre)}${ext}`, local);
      }
    }
    return modelo;
  })().finally(() => enCurso.delete(nombre));
  enCurso.set(nombre, tarea);
  return tarea;
}

// La memoria de Piper crece con el largo de cada frase y con las que lleva
// sintetizadas: frases cortas y un proceso nuevo cada pocas frases la mantienen baja.
const LARGO_FRASE = 160;
const FRASES_POR_PROCESO = 8;
// Un lote de 8 frases tarda segundos; si pasa de esto, Piper se colgó.
const TIEMPO_MAXIMO_LOTE_MS = 10 * 60_000;

/** Parte un texto en frases de hasta LARGO_FRASE caracteres (por puntuación y, si no alcanza, por palabras). */
export function fragmentar(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const piezas: string[] = [];
  for (const oracion of limpio.split(/(?<=[.!?…。！？;；])\s*/)) {
    let resto = oracion.trim();
    while (resto.length > LARGO_FRASE) {
      const ventana = resto.slice(0, LARGO_FRASE);
      // Mejor en una coma; si no, en el último espacio; si no hay (chino), donde toque
      let corte = Math.max(ventana.lastIndexOf(", "), ventana.lastIndexOf("，"), ventana.lastIndexOf("、"));
      if (corte < LARGO_FRASE / 3) corte = ventana.lastIndexOf(" ");
      if (corte < LARGO_FRASE / 3) corte = LARGO_FRASE - 1;
      piezas.push(resto.slice(0, corte + 1).trim());
      resto = resto.slice(corte + 1).trim();
    }
    if (resto) piezas.push(resto);
  }
  return piezas;
}

/** Corre un proceso de Piper que sintetiza un lote de frases; avisa cada frase terminada. */
function correrPiper(modelo: string, lote: { text: string; output_file: string }[], alTerminarFrase: () => void) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(config.PIPER_PATH, ["--model", modelo, "--json-input", "--sentence_silence", "0.15"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const limite = setTimeout(() => proc.kill("SIGKILL"), TIEMPO_MAXIMO_LOTE_MS);
    let stderr = "";
    let pendiente = "";
    proc.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    // Piper escribe en stdout la ruta de cada WAV al terminarlo
    proc.stdout.on("data", (d) => {
      const lineas = (pendiente + d).split("\n");
      pendiente = lineas.pop() ?? "";
      for (const l of lineas) if (l.trim()) alTerminarFrase();
    });
    proc.on("error", (e) => {
      clearTimeout(limite);
      reject(e);
    });
    proc.on("close", (code, senal) => {
      clearTimeout(limite);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `piper terminó ${code === null ? `por la señal ${senal}` : `con código ${code}`}: ${stderr.trim().slice(-600)}`,
          ),
        );
    });
    proc.stdin.on("error", () => {}); // si piper muere, el error llega por "close"
    proc.stdin.end(lote.map((l) => JSON.stringify(l)).join("\n") + "\n");
  });
}

/**
 * Sintetiza varios textos. Cada uno se parte en frases cortas que se
 * sintetizan en lotes (un proceso de Piper por lote). Devuelve, por cada
 * texto, las rutas de los WAV de sus frases en orden (vacío si no tenía texto).
 * `alAvanzar` recibe la fracción terminada (0 a 1).
 */
export async function sintetizar(
  textos: string[],
  idioma: string,
  dir: string,
  alAvanzar?: (fraccion: number) => void,
): Promise<string[][]> {
  const modelo = await asegurarVoz(idioma);
  const porTexto: string[][] = textos.map(() => []);
  const frases: { text: string; output_file: string }[] = [];
  textos.forEach((texto, i) => {
    for (const text of fragmentar(texto)) {
      const output_file = path.join(dir, `voz-${String(frases.length).padStart(6, "0")}.wav`);
      frases.push({ text, output_file });
      porTexto[i]!.push(output_file);
    }
  });

  let hechas = 0;
  for (let i = 0; i < frases.length; i += FRASES_POR_PROCESO) {
    await correrPiper(modelo, frases.slice(i, i + FRASES_POR_PROCESO), () => alAvanzar?.(++hechas / frases.length));
  }

  for (const f of frases) if (!(await existe(f.output_file))) throw new Error(`piper no generó ${path.basename(f.output_file)}`);
  return porTexto;
}

export interface Pcm {
  frecuencia: number;
  /** Muestras de 16 bits, mono, little-endian. */
  datos: Buffer;
}

/** Lee un WAV PCM de 16 bits mono (lo que produce Piper). */
export async function leerWav(ruta: string): Promise<Pcm> {
  const b = await readFile(ruta);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("WAV inválido");
  let frecuencia = 0;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const tam = b.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      const canales = b.readUInt16LE(pos + 10);
      frecuencia = b.readUInt32LE(pos + 12);
      const bits = b.readUInt16LE(pos + 22);
      if (canales !== 1 || bits !== 16) throw new Error(`WAV no soportado (${canales} canales, ${bits} bits)`);
    } else if (id === "data") {
      if (!frecuencia) throw new Error("WAV sin formato");
      return { frecuencia, datos: b.subarray(pos + 8, Math.min(b.length, pos + 8 + tam)) };
    }
    pos += 8 + tam + (tam % 2);
  }
  throw new Error("WAV sin datos");
}
