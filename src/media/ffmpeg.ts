import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export interface TrozoAudio {
  indice: number;
  ruta: string;
  inicio: number;
  fin: number;
}

/** Ejecuta un binario sin shell (los argumentos no se interpretan). */
export function ejecutar(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code, senal) => {
      if (code === 0) resolve(stdout);
      else {
        const motivo = code === null ? `por la señal ${senal}` : `con código ${code}`;
        reject(new Error(`${path.basename(bin)} terminó ${motivo}: ${stderr.trim().slice(-800)}`));
      }
    });
  });
}

export async function duracionSegundos(ruta: string): Promise<number> {
  const out = await ejecutar(config.FFPROBE_PATH, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    ruta,
  ]);
  const d = Number.parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`No se pudo leer la duración de ${ruta}`);
  return d;
}

export async function tienePistaDeAudio(ruta: string): Promise<boolean> {
  const out = await ejecutar(config.FFPROBE_PATH, [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    ruta,
  ]);
  return out.trim().length > 0;
}

/**
 * Pasos (a) y (b) en una sola pasada de ffmpeg: descarta el video, convierte el
 * audio a mono 16 kHz MP3 de 32 kbps (lo que necesita el STT, ~80 KB cada 20 s)
 * y lo corta en trozos de `segundos`. Los tiempos reales de cada trozo se leen
 * con ffprobe, porque el muxer corta en límites de paquete, no al milisegundo.
 */
export async function extraerYDividirAudio(
  rutaVideo: string,
  dirSalida: string,
  segundos: number,
): Promise<TrozoAudio[]> {
  const patron = path.join(dirSalida, "trozo_%05d.mp3");
  await ejecutar(config.FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error",
    "-i", rutaVideo,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libmp3lame",
    "-b:a", "32k",
    "-f", "segment",
    "-segment_time", String(segundos),
    "-reset_timestamps", "1",
    patron,
  ]);

  const archivos = (await readdir(dirSalida)).filter((f) => /^trozo_\d{5}\.mp3$/.test(f)).sort();

  const trozos: TrozoAudio[] = [];
  let inicio = 0;
  for (const [indice, archivo] of archivos.entries()) {
    const ruta = path.join(dirSalida, archivo);
    const duracion = await duracionSegundos(ruta);
    // Trozos residuales de menos de 0,3 s no aportan texto: se descartan.
    if (duracion < 0.3) continue;
    trozos.push({ indice, ruta, inicio: redondear(inicio), fin: redondear(inicio + duracion) });
    inicio += duracion;
  }
  return trozos;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Genera un MP4 con los subtítulos incrustados ("quemados"): se ven en
 * cualquier reproductor, sin archivos aparte. Hay que recodificar el video,
 * así que se limita a 720p y se usa un preset rápido: en el plan gratuito de
 * Render (CPU muy limitada) aun así puede tardar varios minutos.
 */
export async function quemarSubtitulos(rutaVideo: string, rutaSrt: string, salida: string): Promise<void> {
  // Mismo estilo que el reproductor: texto blanco sobre una caja oscura translúcida.
  const estilo = [
    "FontName=DejaVu Sans",
    "FontSize=18",
    "PrimaryColour=&H00FFFFFF",
    "BackColour=&H80000000",
    "BorderStyle=3",
    "Outline=1",
    "Shadow=0",
    "MarginV=28",
  ].join(",");
  await ejecutar(config.FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", rutaVideo,
    // Ancho máximo 1280 y dimensiones pares (libx264 las exige)
    "-vf", `scale='trunc(min(1280,iw)/2)*2':-2,subtitles=filename=${rutaSrt}:force_style='${estilo}'`,
    "-c:v", "libx264", "-preset", "superfast", "-crf", "26",
    "-c:a", "aac", "-b:a", "128k",
    // Permite empezar a reproducir antes de descargar el archivo completo
    "-movflags", "+faststart",
    salida,
  ]);
}
