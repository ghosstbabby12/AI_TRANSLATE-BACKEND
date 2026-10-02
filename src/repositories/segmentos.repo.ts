import { pool } from "../db/pool.js";
import type { ProgresoVideo, Segmento } from "../models/types.js";

export interface NuevoSegmento {
  indice: number;
  tiempoInicio: number;
  tiempoFin: number;
  audioKey: string;
}

/** Idempotente: si el job de video se reintenta, no duplica segmentos. */
export async function insertarSegmentos(videoId: string, segmentos: NuevoSegmento[]): Promise<void> {
  if (segmentos.length === 0) return;
  const valores: unknown[] = [];
  const filas = segmentos.map((s, i) => {
    const b = i * 5;
    valores.push(videoId, s.indice, s.tiempoInicio, s.tiempoFin, s.audioKey);
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
  });
  await pool.query(
    `INSERT INTO segmentos (video_id, indice, tiempo_inicio, tiempo_fin, audio_key)
     VALUES ${filas.join(", ")}
     ON CONFLICT (video_id, indice) DO NOTHING`,
    valores,
  );
}

export async function listarSegmentos(videoId: string): Promise<Segmento[]> {
  const { rows } = await pool.query<Segmento>(
    "SELECT * FROM segmentos WHERE video_id = $1 ORDER BY indice",
    [videoId],
  );
  return rows;
}

export async function listarSegmentosListos(videoId: string): Promise<Segmento[]> {
  const { rows } = await pool.query<Segmento>(
    "SELECT * FROM segmentos WHERE video_id = $1 AND estado = 'listo' ORDER BY indice",
    [videoId],
  );
  return rows;
}

export async function obtenerSegmento(id: string): Promise<Segmento | null> {
  const { rows } = await pool.query<Segmento>("SELECT * FROM segmentos WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function obtenerSegmentoAnterior(videoId: string, indice: number): Promise<Segmento | null> {
  const { rows } = await pool.query<Segmento>(
    "SELECT * FROM segmentos WHERE video_id = $1 AND indice = $2",
    [videoId, indice - 1],
  );
  return rows[0] ?? null;
}

/**
 * Reclama un segmento de forma atómica (pendiente -> procesando).
 * Devuelve null si otro worker ya lo tomó o ya está terminado.
 */
export async function reclamarSegmento(id: string): Promise<Segmento | null> {
  const { rows } = await pool.query<Segmento>(
    `UPDATE segmentos SET estado = 'procesando', actualizado_en = now()
     WHERE id = $1 AND estado = 'pendiente'
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Si un worker murió a mitad de camino, devuelve sus segmentos a la cola. */
export async function liberarSegmentosColgados(videoId: string): Promise<void> {
  await pool.query(
    "UPDATE segmentos SET estado = 'pendiente' WHERE video_id = $1 AND estado = 'procesando'",
    [videoId],
  );
}

/** Se guarda la transcripción en cuanto existe, así un reintento no la repite. */
export async function guardarTranscripcion(id: string, texto: string): Promise<void> {
  await pool.query(
    "UPDATE segmentos SET texto_original = $2, actualizado_en = now() WHERE id = $1",
    [id, texto],
  );
}

export async function marcarSegmentoListo(id: string, textoTraducido: string): Promise<void> {
  await pool.query(
    `UPDATE segmentos
       SET texto_traducido = $2, estado = 'listo', ultimo_error = NULL, actualizado_en = now()
     WHERE id = $1`,
    [id, textoTraducido],
  );
}

/**
 * Registra un fallo. Vuelve a 'pendiente' (para reintento) mientras queden
 * intentos; al agotarlos, o si el error no es recuperable, queda en 'error'.
 */
export async function registrarFalloSegmento(
  id: string,
  mensaje: string,
  maxIntentos: number,
  recuperable: boolean,
): Promise<Segmento> {
  const { rows } = await pool.query<Segmento>(
    `UPDATE segmentos
       SET intentos = intentos + 1,
           ultimo_error = $2,
           estado = CASE WHEN $4::boolean AND intentos + 1 < $3 THEN 'pendiente' ELSE 'error' END,
           actualizado_en = now()
     WHERE id = $1
     RETURNING *`,
    [id, mensaje.slice(0, 1000), maxIntentos, recuperable],
  );
  return rows[0]!;
}

export async function progresoVideo(videoId: string): Promise<ProgresoVideo> {
  const { rows } = await pool.query<{ estado: string; n: string }>(
    "SELECT estado, count(*) AS n FROM segmentos WHERE video_id = $1 GROUP BY estado",
    [videoId],
  );
  const cuenta = (e: string) => Number(rows.find((r) => r.estado === e)?.n ?? 0);
  const p = {
    listos: cuenta("listo"),
    pendientes: cuenta("pendiente"),
    procesando: cuenta("procesando"),
    errores: cuenta("error"),
  };
  return { total: p.listos + p.pendientes + p.procesando + p.errores, ...p };
}

/** Reintento manual desde la UI: los segmentos en error vuelven a empezar. */
export async function reiniciarSegmentosConError(videoId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE segmentos SET estado = 'pendiente', intentos = 0, ultimo_error = NULL, actualizado_en = now()
     WHERE video_id = $1 AND estado = 'error'
     RETURNING id`,
    [videoId],
  );
  return rows.map((r) => r.id);
}
