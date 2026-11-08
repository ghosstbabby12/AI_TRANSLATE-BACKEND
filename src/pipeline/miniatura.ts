import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extraerMiniatura } from "../media/ffmpeg.js";
import { archivosSinMiniatura, registrarMiniatura } from "../repositories/videos.repo.js";
import { claves, subirArchivo, urlFirmadaInterna } from "../storage/s3.js";
import { describirError } from "../util/resiliencia.js";

/** Un instante representativo: el 10 % del video, entre 0,5 y 5 s (evita el negro inicial). */
const instante = (duracion: number | null) => Math.min(5, Math.max(0.5, (duracion ?? 10) * 0.1));

/**
 * Genera la miniatura de un archivo y la guarda en S3 y en la base.
 * `entrada` es la ruta local si el video ya está descargado; si no, se lee
 * desde S3 con una URL firmada. Nunca lanza: una miniatura no es crítica.
 */
export async function generarMiniatura(storageKey: string, duracion: number | null, entrada?: string): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "miniatura-"));
  try {
    const salida = path.join(dir, "miniatura.jpg");
    await extraerMiniatura(entrada ?? (await urlFirmadaInterna(storageKey)), salida, instante(duracion));
    const key = claves.miniatura(storageKey);
    await subirArchivo(key, salida, "image/jpeg");
    await registrarMiniatura(storageKey, key);
  } catch (err) {
    console.warn(`[miniatura] no se pudo generar para ${storageKey}: ${describirError(err)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Genera las miniaturas que falten (videos anteriores a esta función), de a pocas. */
export async function completarMiniaturas(limite = 5): Promise<void> {
  for (const { storage_key, duracion_seg } of await archivosSinMiniatura(limite)) {
    await generarMiniatura(storage_key, duracion_seg);
  }
}
