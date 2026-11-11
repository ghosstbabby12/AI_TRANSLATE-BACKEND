import type { SegmentRepository } from "../../../application/ports/repositories.js";
import { pool } from "../pool.js";
import { toSegment, type SegmentRow } from "../rows.js";

const many = async (sql: string, params: unknown[]) => (await pool.query<SegmentRow>(sql, params)).rows.map(toSegment);
const one = async (sql: string, params: unknown[]) => (await many(sql, params))[0] ?? null;

export const segmentRepository: SegmentRepository = {
  /** Idempotent: if the video job is retried, segments are not duplicated. */
  async insertMany(videoId, segments) {
    if (segments.length === 0) return;
    const values: unknown[] = [];
    const tuples = segments.map((s, i) => {
      values.push(videoId, s.index, s.startSeconds, s.endSeconds, s.audioKey);
      const b = i * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    });
    await pool.query(
      `INSERT INTO segmentos (video_id, indice, tiempo_inicio, tiempo_fin, audio_key)
       VALUES ${tuples.join(", ")} ON CONFLICT (video_id, indice) DO NOTHING`,
      values,
    );
  },

  list: (videoId) => many("SELECT * FROM segmentos WHERE video_id = $1 ORDER BY indice", [videoId]),

  listReady: (videoId) =>
    many("SELECT * FROM segmentos WHERE video_id = $1 AND estado = 'listo' ORDER BY indice", [videoId]),

  findById: (id) => one("SELECT * FROM segmentos WHERE id = $1", [id]),

  findPrevious: (videoId, index) =>
    one("SELECT * FROM segmentos WHERE video_id = $1 AND indice = $2", [videoId, index - 1]),

  claim: (id) =>
    one(
      `UPDATE segmentos SET estado = 'procesando', actualizado_en = now()
        WHERE id = $1 AND estado = 'pendiente' RETURNING *`,
      [id],
    ),

  /** If a worker died halfway, its segments go back to pending. */
  async releaseStuck(videoId) {
    await pool.query("UPDATE segmentos SET estado = 'pendiente' WHERE video_id = $1 AND estado = 'procesando'", [videoId]);
  },

  async saveTranscript(id, text) {
    await pool.query("UPDATE segmentos SET texto_original = $2, actualizado_en = now() WHERE id = $1", [id, text]);
  },

  async markReady(id, translatedText) {
    await pool.query(
      `UPDATE segmentos SET texto_traducido = $2, estado = 'listo', ultimo_error = NULL, actualizado_en = now()
        WHERE id = $1`,
      [id, translatedText],
    );
  },

  /** Back to pending while attempts remain and the error is temporary; otherwise failed. */
  recordFailure: (id, message, maxAttempts, retryable) =>
    one(
      `UPDATE segmentos
          SET intentos = intentos + 1,
              ultimo_error = $2,
              estado = CASE WHEN $4::boolean AND intentos + 1 < $3 THEN 'pendiente' ELSE 'error' END,
              actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [id, message.slice(0, 1000), maxAttempts, retryable],
    ),

  async progress(videoId) {
    const { rows } = await pool.query<{ estado: string; n: string }>(
      "SELECT estado, count(*) AS n FROM segmentos WHERE video_id = $1 GROUP BY estado",
      [videoId],
    );
    const count = (status: string) => Number(rows.find((r) => r.estado === status)?.n ?? 0);
    const counts = { ready: count("listo"), pending: count("pendiente"), processing: count("procesando"), failed: count("error") };
    return { total: counts.ready + counts.pending + counts.processing + counts.failed, ...counts };
  },

  /** Manual retry from the app: failed segments start over. */
  async resetFailed(videoId) {
    const { rows } = await pool.query<{ id: string }>(
      `UPDATE segmentos SET estado = 'pendiente', intentos = 0, ultimo_error = NULL, actualizado_en = now()
        WHERE video_id = $1 AND estado = 'error' RETURNING id`,
      [videoId],
    );
    return rows.map((r) => r.id);
  },
};
