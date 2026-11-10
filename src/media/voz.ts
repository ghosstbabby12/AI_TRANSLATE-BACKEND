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
 */
const VOCES: Record<string, string> = {
  es: "es_MX-claude-high",
  en: "en_US-lessac-medium",
  pt: "pt_BR-faber-medium",
  fr: "fr_FR-siwis-medium",
  de: "de_DE-thorsten-medium",
  it: "it_IT-paola-medium",
  zh: "zh_CN-huayan-medium",
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

/**
 * Sintetiza varios textos con un solo proceso de Piper (el modelo se carga una
 * vez): con --json-input cada línea indica su texto y su archivo de salida.
 * Devuelve las rutas de los WAV, en el mismo orden.
 */
export async function sintetizar(textos: string[], idioma: string, dir: string): Promise<string[]> {
  const modelo = await asegurarVoz(idioma);
  const salidas = textos.map((_, i) => path.join(dir, `voz-${String(i).padStart(5, "0")}.wav`));
  const entrada = textos.map((text, i) => JSON.stringify({ text, output_file: salidas[i] })).join("\n") + "\n";

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(config.PIPER_PATH, ["--model", modelo, "--json-input", "--sentence_silence", "0.15"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    proc.on("error", reject);
    proc.on("close", (code, senal) =>
      code === 0
        ? resolve()
        : reject(new Error(`piper terminó ${code === null ? `por la señal ${senal}` : `con código ${code}`}: ${stderr.trim().slice(-600)}`)),
    );
    proc.stdin.on("error", () => {}); // si piper muere, el error llega por "close"
    proc.stdin.end(entrada);
  });

  for (const s of salidas) if (!(await existe(s))) throw new Error(`piper no generó ${path.basename(s)}`);
  return salidas;
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
