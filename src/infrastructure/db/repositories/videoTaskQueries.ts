import type { TaskUpdate, VideoRepository } from "../../../application/ports/repositories.js";
import { taskStatusCode } from "../../../shared/legacyCodes.js";
import { pool } from "../pool.js";

const clip = (error?: string | null) => error?.slice(0, 1000) ?? null;
const ids = async (sql: string) => (await pool.query<{ id: string }>(sql)).rows.map((r) => r.id);

/** State of the on-demand tasks (export, summary, audio), thumbnails and recovery queries. */
export const videoTaskQueries: Pick<
  VideoRepository,
  | "setExport"
  | "setAudio"
  | "setAudioProgress"
  | "countAudioAttempt"
  | "setSummary"
  | "setThumbnail"
  | "filesWithoutThumbnail"
  | "findUnfinishedWork"
> = {
  async setExport(id, update: TaskUpdate) {
    await pool.query("UPDATE videos SET export_estado = $2, export_key = $3, export_error = $4, actualizado_en = now() WHERE id = $1", [
      id,
      taskStatusCode.encodeNullable(update.status),
      update.key ?? null,
      clip(update.error),
    ]);
  },

  /** Requesting it again ("processing") resets the progress and the attempt counter. */
  async setAudio(id, update: TaskUpdate) {
    await pool.query(
      `UPDATE videos SET audio_estado = $2, audio_key = $3, audio_error = $4,
              audio_progreso = CASE WHEN $2 = 'procesando' THEN 0 END,
              audio_intentos = CASE WHEN $2 = 'procesando' THEN 0 ELSE audio_intentos END,
              actualizado_en = now()
        WHERE id = $1`,
      [id, taskStatusCode.encodeNullable(update.status), update.key ?? null, clip(update.error)],
    );
  },

  async setAudioProgress(id, percent) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    await pool.query("UPDATE videos SET audio_progreso = $2 WHERE id = $1 AND audio_estado = 'procesando'", [id, value]);
  },

  async countAudioAttempt(id) {
    const { rows } = await pool.query<{ audio_intentos: number }>(
      "UPDATE videos SET audio_intentos = audio_intentos + 1 WHERE id = $1 RETURNING audio_intentos",
      [id],
    );
    return rows[0]?.audio_intentos ?? 0;
  },

  /** Without `text`, the previous summary is kept (it survives a failed regeneration). */
  async setSummary(id, update) {
    await pool.query(
      `UPDATE videos
          SET resumen_estado = $2::text,
              resumen_texto = CASE WHEN $5 THEN $3 ELSE resumen_texto END,
              resumen_error = $4,
              resumen_en = CASE WHEN $2::text = 'listo' THEN now() ELSE resumen_en END,
              actualizado_en = now()
        WHERE id = $1`,
      [id, taskStatusCode.encodeNullable(update.status), update.text ?? null, clip(update.error), update.text !== undefined],
    );
  },

  /** Every video sharing the file gets the thumbnail. */
  async setThumbnail(fileKey, thumbnailKey) {
    await pool.query("UPDATE videos SET miniatura_key = $2 WHERE storage_key = $1", [fileKey, thumbnailKey]);
  },

  async filesWithoutThumbnail(limit) {
    const { rows } = await pool.query<{ storage_key: string; duracion_seg: number | null }>(
      `SELECT storage_key, max(duracion_seg) AS duracion_seg FROM videos
        WHERE storage_key IS NOT NULL AND miniatura_key IS NULL AND total_segmentos IS NOT NULL
        GROUP BY storage_key LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ fileKey: r.storage_key, durationSeconds: r.duracion_seg }));
  },

  async findUnfinishedWork() {
    return {
      videos: await ids("SELECT id FROM videos WHERE estado IN ('pendiente', 'procesando')"),
      exports: await ids("SELECT id FROM videos WHERE export_estado = 'procesando'"),
      summaries: await ids("SELECT id FROM videos WHERE resumen_estado = 'procesando'"),
      audios: await ids("SELECT id FROM videos WHERE audio_estado = 'procesando'"),
    };
  },
};
