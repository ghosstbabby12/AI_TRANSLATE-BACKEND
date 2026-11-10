import { pool } from "../db/pool.js";
import type { EstadoExportacion, EstadoVideo, OrigenTipo, Video } from "../models/types.js";

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

/** Estado del video con subtítulos incrustados (ver pipeline/exportarVideo.ts). */
export async function actualizarExportacion(
  id: string,
  datos: { estado: EstadoExportacion | null; key?: string | null; error?: string | null },
): Promise<void> {
  await pool.query(
    "UPDATE videos SET export_estado = $2, export_key = $3, export_error = $4, actualizado_en = now() WHERE id = $1",
    [id, datos.estado, datos.key ?? null, datos.error?.slice(0, 1000) ?? null],
  );
}

/** Estado del audio de la traducción (ver pipeline/generarAudio.ts). */
export async function actualizarAudio(
  id: string,
  datos: { estado: EstadoExportacion | null; key?: string | null; error?: string | null },
): Promise<void> {
  await pool.query(
    "UPDATE videos SET audio_estado = $2, audio_key = $3, audio_error = $4, actualizado_en = now() WHERE id = $1",
    [id, datos.estado, datos.key ?? null, datos.error?.slice(0, 1000) ?? null],
  );
}

/**
 * Estado del resumen con IA (ver pipeline/resumirVideo.ts). Si no se pasa
 * `texto`, se conserva el que hubiera: al regenerar, o si la regeneración
 * falla, el usuario sigue teniendo el resumen anterior.
 */
export async function actualizarResumen(
  id: string,
  datos: { estado: EstadoExportacion | null; texto?: string | null; error?: string | null },
): Promise<void> {
  await pool.query(
    `UPDATE videos
        SET resumen_estado = $2::text,
            resumen_texto = CASE WHEN $5 THEN $3 ELSE resumen_texto END,
            resumen_error = $4,
            resumen_en = CASE WHEN $2::text = 'listo' THEN now() ELSE resumen_en END,
            actualizado_en = now()
      WHERE id = $1`,
    [id, datos.estado, datos.texto ?? null, datos.error?.slice(0, 1000) ?? null, datos.texto !== undefined],
  );
}

/**
 * Nueva traducción de un video ya transcrito: copia el video (mismo archivo
 * en S3) y sus segmentos con el texto original y los tiempos, pero sin
 * traducción. El pipeline normal solo traducirá: procesarSegmento salta la
 * transcripción cuando texto_original ya existe. Todo en una transacción.
 */
export async function crearTraduccion(origenId: string, idiomaDestino: string): Promise<Video> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Video>(
      `INSERT INTO videos (usuario_id, nombre, origen_tipo, origen_url, storage_key, idioma_destino,
                           idioma_origen, estado, total_segmentos, duracion_seg, miniatura_key)
       SELECT usuario_id, nombre, origen_tipo, origen_url, storage_key, $2,
              idioma_origen, 'procesando', total_segmentos, duracion_seg, miniatura_key
         FROM videos WHERE id = $1
       RETURNING *`,
      [origenId, idiomaDestino],
    );
    const nuevo = rows[0]!;
    await client.query(
      `INSERT INTO segmentos (video_id, indice, tiempo_inicio, tiempo_fin, audio_key, texto_original)
       SELECT $1, indice, tiempo_inicio, tiempo_fin, audio_key, texto_original
         FROM segmentos WHERE video_id = $2`,
      [nuevo.id, origenId],
    );
    await client.query("COMMIT");
    return nuevo;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Todas las traducciones del mismo archivo del usuario (incluida la indicada). */
export async function listarTraducciones(
  usuarioId: string,
  storageKey: string,
): Promise<Pick<Video, "id" | "idioma_destino" | "estado">[]> {
  const { rows } = await pool.query<Pick<Video, "id" | "idioma_destino" | "estado">>(
    `SELECT id, idioma_destino, estado FROM videos
      WHERE usuario_id = $1 AND storage_key = $2
      ORDER BY creado_en`,
    [usuarioId, storageKey],
  );
  return rows;
}

/**
 * Cambia el nombre. Si el video tiene archivo, se aplica a todas sus
 * traducciones (son el mismo video en otros idiomas). Devuelve cuántos cambió.
 */
export async function renombrarVideo(video: Pick<Video, "id" | "usuario_id" | "storage_key">, nombre: string): Promise<number> {
  const { rowCount } = video.storage_key
    ? await pool.query(
        "UPDATE videos SET nombre = $3, actualizado_en = now() WHERE usuario_id = $1 AND storage_key = $2",
        [video.usuario_id, video.storage_key, nombre],
      )
    : await pool.query("UPDATE videos SET nombre = $2, actualizado_en = now() WHERE id = $1", [video.id, nombre]);
  return rowCount ?? 0;
}

/** Borra el video (sus segmentos se borran en cascada). */
export async function eliminarVideo(id: string): Promise<void> {
  await pool.query("DELETE FROM videos WHERE id = $1", [id]);
}

/** Cuántos videos (de cualquier usuario) siguen usando ese archivo en S3. */
export async function contarUsosDeArchivo(storageKey: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM videos WHERE storage_key = $1", [
    storageKey,
  ]);
  return rows[0]?.n ?? 0;
}

/** Guarda la miniatura en todos los videos que comparten el archivo. */
export async function registrarMiniatura(storageKey: string, miniaturaKey: string): Promise<void> {
  await pool.query("UPDATE videos SET miniatura_key = $2 WHERE storage_key = $1", [storageKey, miniaturaKey]);
}

/** Archivos con video pero sin miniatura (p. ej. subidos antes de esta función). */
export async function archivosSinMiniatura(limite: number): Promise<{ storage_key: string; duracion_seg: number | null }[]> {
  const { rows } = await pool.query<{ storage_key: string; duracion_seg: number | null }>(
    `SELECT storage_key, max(duracion_seg) AS duracion_seg FROM videos
      WHERE storage_key IS NOT NULL AND miniatura_key IS NULL AND total_segmentos IS NOT NULL
      GROUP BY storage_key
      LIMIT $1`,
    [limite],
  );
  return rows;
}
