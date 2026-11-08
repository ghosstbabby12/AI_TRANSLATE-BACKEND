import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { UnrecoverableError } from "bullmq";
import { quemarSubtitulos } from "../media/ffmpeg.js";
import { listarSegmentosListos } from "../repositories/segmentos.repo.js";
import { actualizarExportacion, obtenerVideo } from "../repositories/videos.repo.js";
import { claves, descargarArchivo, subirArchivo } from "../storage/s3.js";
import { aSrt, generarCues } from "../subtitulos/formatos.js";

/**
 * Genera el MP4 con los subtítulos traducidos incrustados y lo guarda en S3/R2.
 * Usa los segmentos listos en este momento (los mismos que muestra la app).
 */
export async function exportarVideo(videoId: string): Promise<void> {
  const video = await obtenerVideo(videoId);
  if (!video?.storage_key) throw new UnrecoverableError("El video original no está disponible");

  const segmentos = await listarSegmentosListos(videoId);
  const cues = generarCues(segmentos);
  if (cues.length === 0) throw new UnrecoverableError("El video todavía no tiene subtítulos");

  const dir = await mkdtemp(path.join(tmpdir(), `export-${videoId}-`));
  try {
    const original = path.join(dir, `original${path.extname(video.storage_key)}`);
    const srt = path.join(dir, "subtitulos.srt");
    const salida = path.join(dir, "subtitulado.mp4");

    await descargarArchivo(video.storage_key, original);
    await writeFile(srt, aSrt(cues), "utf8");
    await quemarSubtitulos(original, srt, salida);

    const key = claves.videoSubtitulado(videoId);
    await subirArchivo(key, salida, "video/mp4");
    await actualizarExportacion(videoId, { estado: "listo", key });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
