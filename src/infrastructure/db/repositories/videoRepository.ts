import type { NewVideo, VideoRepository } from "../../../application/ports/repositories.js";
import type { VideoStatus } from "../../../domain/video.js";
import { sourceTypeCode, videoStatusCode } from "../../../shared/legacyCodes.js";
import { inTransaction, pool } from "../pool.js";
import { toVideo, type VideoRow } from "../rows.js";
import { videoTaskQueries } from "./videoTaskQueries.js";

const one = async (sql: string, params: unknown[]) => {
  const { rows } = await pool.query<VideoRow>(sql, params);
  return rows[0] ? toVideo(rows[0]) : null;
};

export const videoRepository: VideoRepository = {
  ...videoTaskQueries,

  async create(v: NewVideo) {
    return (await one(
      `INSERT INTO videos (id, usuario_id, nombre, origen_tipo, origen_url, storage_key, idioma_destino)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [v.id, v.userId, v.name, sourceTypeCode.encode(v.sourceType), v.sourceUrl, v.fileKey, v.targetLanguage],
    ))!;
  },

  findById: (id) => one("SELECT * FROM videos WHERE id = $1", [id]),

  findOwned: (id, userId) => one("SELECT * FROM videos WHERE id = $1 AND usuario_id = $2", [id, userId]),

  async listByUser(userId, limit = 50) {
    const { rows } = await pool.query<VideoRow & { segmentos_listos: number }>(
      `SELECT v.*,
              (SELECT count(*)::int FROM segmentos s WHERE s.video_id = v.id AND s.estado = 'listo') AS segmentos_listos
         FROM videos v WHERE v.usuario_id = $1
        ORDER BY v.creado_en DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({ ...toVideo(r), readySegments: r.segmentos_listos }));
  },

  async setStatus(id: string, status: VideoStatus, error: string | null = null) {
    await pool.query("UPDATE videos SET estado = $2, error = $3, actualizado_en = now() WHERE id = $1", [
      id,
      videoStatusCode.encode(status),
      error,
    ]);
  },

  async recordSplit(id, split) {
    await pool.query(
      `UPDATE videos SET total_segmentos = $2, duracion_seg = $3,
              storage_key = COALESCE($4, storage_key), actualizado_en = now()
        WHERE id = $1`,
      [id, split.totalSegments, split.durationSeconds, split.fileKey ?? null],
    );
  },

  /** Saved only the first time the speech-to-text reports it. */
  async setSourceLanguage(id, language) {
    await pool.query("UPDATE videos SET idioma_origen = $2 WHERE id = $1 AND idioma_origen IS NULL", [id, language]);
  },

  /** Copies the video (same file) and its transcribed segments, without translation, in one transaction. */
  createTranslation: (sourceId, targetLanguage) =>
    inTransaction(async (client) => {
      const { rows } = await client.query<VideoRow>(
        `INSERT INTO videos (usuario_id, nombre, origen_tipo, origen_url, storage_key, idioma_destino,
                             idioma_origen, estado, total_segmentos, duracion_seg, miniatura_key)
         SELECT usuario_id, nombre, origen_tipo, origen_url, storage_key, $2,
                idioma_origen, 'procesando', total_segmentos, duracion_seg, miniatura_key
           FROM videos WHERE id = $1
         RETURNING *`,
        [sourceId, targetLanguage],
      );
      const created = toVideo(rows[0]!);
      await client.query(
        `INSERT INTO segmentos (video_id, indice, tiempo_inicio, tiempo_fin, audio_key, texto_original)
         SELECT $1, indice, tiempo_inicio, tiempo_fin, audio_key, texto_original FROM segmentos WHERE video_id = $2`,
        [created.id, sourceId],
      );
      return created;
    }),

  async listTranslations(userId, fileKey) {
    const { rows } = await pool.query<{ id: string; idioma_destino: string; estado: string }>(
      "SELECT id, idioma_destino, estado FROM videos WHERE usuario_id = $1 AND storage_key = $2 ORDER BY creado_en",
      [userId, fileKey],
    );
    return rows.map((r) => ({ id: r.id, targetLanguage: r.idioma_destino, status: videoStatusCode.decode(r.estado) }));
  },

  /** With a file, every translation of it is renamed (same content in other languages). */
  async rename(video, name) {
    const { rowCount } = video.fileKey
      ? await pool.query("UPDATE videos SET nombre = $3, actualizado_en = now() WHERE usuario_id = $1 AND storage_key = $2", [
          video.userId,
          video.fileKey,
          name,
        ])
      : await pool.query("UPDATE videos SET nombre = $2, actualizado_en = now() WHERE id = $1", [video.id, name]);
    return rowCount ?? 0;
  },

  /** Its segments are deleted in cascade. */
  async delete(id) {
    await pool.query("DELETE FROM videos WHERE id = $1", [id]);
  },

  async countFileUsage(fileKey) {
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM videos WHERE storage_key = $1", [fileKey]);
    return rows[0]?.n ?? 0;
  },

  /** Only takes videos whose owner id is not a registered account. */
  async transferAnonymousVideos(anonymousId, userId) {
    const { rowCount } = await pool.query(
      `UPDATE videos SET usuario_id = $2
        WHERE usuario_id = $1 AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id::text = $1)`,
      [anonymousId, userId],
    );
    return rowCount ?? 0;
  },
};
