import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ejecutar } from "./ffmpeg.js";

/**
 * Descarga un video público con yt-dlp (YouTube, Vimeo, enlaces directos .mp4, ...).
 * Solo se aceptan URLs http(s); la validación previa ocurre en la API.
 */
export async function descargarDesdeUrl(url: string, dirSalida: string): Promise<string> {
  await ejecutar(config.YTDLP_PATH, [
    "--no-playlist",
    "--no-progress",
    "--max-filesize", `${config.MAX_UPLOAD_MB}M`,
    "-f", "b[ext=mp4]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "-o", path.join(dirSalida, "original.%(ext)s"),
    // "--" evita que una URL que empiece con "-" se interprete como opción
    "--",
    url,
  ]);
  const archivo = (await readdir(dirSalida)).find((f) => f.startsWith("original."));
  if (!archivo) throw new Error("yt-dlp no produjo ningún archivo");
  return path.join(dirSalida, archivo);
}
