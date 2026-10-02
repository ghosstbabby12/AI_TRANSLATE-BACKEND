import { pool } from "../db/pool.js";
import type { EstadoVideo, OrigenTipo, Video } from "../models/types.js";

export interface NuevoVideo {
  id: string;
  usuarioId: string;
  nombre: string;
  origenTipo: OrigenTipo;
  origenUrl?: string | null;
  storageKey?: string | null;
  idiomaDestino: string;
}

export async function crearVideo(v: NuevoVideo): Promise<Video> {
  const { rows } = await pool.query<Video>(
    `INSERT INTO videos (id, usuario_id, nombre, origen_tipo, origen_url, storage_key, idioma_destino)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [v.id, v.usuarioId, v.nombre, v.origenTipo, v.origenUrl ?? null, v.storageKey ?? null, v.idiomaDestino],
  );
  return rows[0]!;
}

export async function obtenerVideo(id: string): Promise<Video | null> {
  const { rows } = await pool.query<Video>("SELECT * FROM videos WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Igual que obtenerVideo pero solo si pertenece al usuario. */
export async function obtenerVideoDeUsuario(id: string, usuarioId: string): Promise<Video | null> {
  const { rows } = await pool.query<Video>(
    "SELECT * FROM videos WHERE id = $1 AND usuario_id = $2",
    [id, usuarioId],
  );
  return rows[0] ?? null;
}

export async function listarVideosDeUsuario(
  usuarioId: string,
  limite = 50,
): Promise<(Video & { segmentos_listos: number })[]> {
  const { rows } = await pool.query<Video & { segmentos_listos: number }>(
    `SELECT v.*,
            (SELECT count(*)::int FROM segmentos s WHERE s.video_id = v.id AND s.estado = 'listo')
              AS segmentos_listos
       FROM videos v
      WHERE v.usuario_id = $1
      ORDER BY v.creado_en DESC
      LIMIT $2`,
    [usuarioId, limite],
  );
  return rows;
}

export async function actualizarEstadoVideo(
  id: string,
  estado: EstadoVideo,
  error: string | null = null,
): Promise<void> {
  await pool.query(
    "UPDATE videos SET estado = $2, error = $3, actualizado_en = now() WHERE id = $1",
    [id, estado, error],
  );
}

export async function registrarDivision(
  id: string,
  datos: { totalSegmentos: number; duracionSeg: number; storageKey?: string },
): Promise<void> {
  await pool.query(
    `UPDATE videos
       SET total_segmentos = $2, duracion_seg = $3,
           storage_key = COALESCE($4, storage_key), actualizado_en = now()
     WHERE id = $1`,
    [id, datos.totalSegmentos, datos.duracionSeg, datos.storageKey ?? null],
  );
}

/** Guarda el idioma detectado por el STT solo la primera vez. */
export async function registrarIdiomaOrigen(id: string, idioma: string): Promise<void> {
  await pool.query(
    "UPDATE videos SET idioma_origen = $2 WHERE id = $1 AND idioma_origen IS NULL",
    [id, idioma],
  );
}
