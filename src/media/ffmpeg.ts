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

/**
 * Extrae un fotograma como JPEG de 640 px de ancho para la vista previa.
 * `entrada` puede ser un archivo local o una URL (S3 firmada): con -ss antes
 * de -i, ffmpeg salta al instante pedido y solo descarga lo necesario.
 */
export async function extraerMiniatura(entrada: string, salida: string, segundo: number): Promise<void> {
  await ejecutar(config.FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", segundo.toFixed(2),
    "-i", entrada,
    "-frames:v", "1",
    "-vf", "scale=640:-2",
    "-q:v", "4",
    salida,
  ]);
}

/**
 * Foto de perfil: recorte cuadrado centrado y 256×256 en JPEG. Normaliza
 * cualquier formato que ffmpeg entienda (JPEG, PNG, WebP, HEIC no) y quita
 * metadatos como la ubicación GPS de la cámara.
 */
export async function procesarFotoPerfil(entrada: string, salida: string): Promise<void> {
  await ejecutar(config.FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", entrada,
    "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=256:256",
    "-frames:v", "1",
    "-map_metadata", "-1",
    "-q:v", "3",
    salida,
  ]);
}

/**
 * Acelera un audio (sin cambiar el tono) para que quepa en su tramo del video.
 * Entrada y salida: PCM 16 bits mono crudo a la misma frecuencia.
 */
export function acelerarPcm(datos: Buffer, frecuencia: number, factor: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const formato = ["-f", "s16le", "-ar", String(frecuencia), "-ac", "1"];
    const proc = spawn(config.FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "error",
      ...formato, "-i", "pipe:0",
      "-filter:a", `atempo=${factor.toFixed(3)}`,
      ...formato, "pipe:1",
    ]);
    const trozos: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => trozos.push(d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(trozos)) : reject(new Error(`ffmpeg (atempo) terminó con código ${code}: ${stderr.slice(-400)}`)),
    );
    proc.stdin.on("error", () => {});
    proc.stdin.end(datos);
  });
}

/**
 * Codificador de MP3 que recibe PCM crudo por partes: la pista se arma por
 * streaming, sin tener una hora de audio completa en memoria.
 */
export function codificadorMp3(frecuencia: number, salida: string) {
  const proc = spawn(config.FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "s16le", "-ar", String(frecuencia), "-ac", "1", "-i", "pipe:0",
    "-c:a", "libmp3lame", "-b:a", "64k",
    salida,
  ]);
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  const terminado = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (mp3) terminó con código ${code}: ${stderr.slice(-400)}`)),
    );
  });
  terminado.catch(() => {}); // se espera en cerrar()
  return {
    /** Escribe respetando la contrapresión del proceso. */
    escribir: (datos: Buffer) =>
      new Promise<void>((resolve, reject) => {
        if (datos.length === 0) return resolve();
        proc.stdin.write(datos, (err) => (err ? reject(err) : resolve()));
      }),
    cerrar: async () => {
      proc.stdin.end();
      await terminado;
    },
  };
}
