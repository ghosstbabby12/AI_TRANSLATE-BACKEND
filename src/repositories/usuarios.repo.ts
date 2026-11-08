import { pool } from "../db/pool.js";
import { urlFirmada } from "../storage/s3.js";

export type IdiomaInterfaz = "es" | "en";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  telefono: string | null;
  foto_key: string | null;
  idioma_interfaz: IdiomaInterfaz;
  creado_en: Date;
  actualizado_en: Date;
}

/** Lo que ve el cliente: sin el hash y con la foto como URL temporal. */
export type UsuarioPublico = Omit<Usuario, "password_hash" | "foto_key"> & { url_foto: string | null };

export async function aPublico({ password_hash: _, foto_key, ...u }: Usuario): Promise<UsuarioPublico> {
  return { ...u, url_foto: foto_key ? await urlFirmada(foto_key, 24 * 3600) : null };
}

/** Devuelve null si el email ya está registrado. */
export async function crearUsuario(datos: {
  nombre: string;
  email: string;
  passwordHash: string;
}): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>(
    `INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [datos.nombre, datos.email, datos.passwordHash],
  );
  return rows[0] ?? null;
}

export async function obtenerUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>("SELECT * FROM usuarios WHERE email = $1", [email]);
  return rows[0] ?? null;
}

export async function obtenerUsuario(id: string): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>("SELECT * FROM usuarios WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Pasa a la cuenta los videos creados antes del login con el id anónimo del
 * navegador. Solo toma ids que no sean de otra cuenta registrada.
 */
export async function reclamarVideosAnonimos(anonimoId: string, usuarioId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE videos SET usuario_id = $2
     WHERE usuario_id = $1
       AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id::text = $1)`,
    [anonimoId, usuarioId],
  );
  return rowCount ?? 0;
}

export interface CambiosPerfil {
  nombre?: string;
  email?: string;
  telefono?: string | null;
  idioma_interfaz?: IdiomaInterfaz;
}

// Lista blanca: solo estas columnas se pueden actualizar desde el perfil
const COLUMNAS_PERFIL = ["nombre", "email", "telefono", "idioma_interfaz"] as const;

/**
 * Actualiza solo los campos enviados. Devuelve null si el email nuevo ya
 * pertenece a otra cuenta (violación del índice único).
 */
export async function actualizarPerfil(id: string, cambios: CambiosPerfil): Promise<Usuario | null> {
  const campos = COLUMNAS_PERFIL.filter((c) => cambios[c] !== undefined);
  if (campos.length === 0) return obtenerUsuario(id);
  const asignaciones = campos.map((c, i) => `${c} = $${i + 2}`).join(", ");
  try {
    const { rows } = await pool.query<Usuario>(
      `UPDATE usuarios SET ${asignaciones}, actualizado_en = now() WHERE id = $1 RETURNING *`,
      [id, ...campos.map((c) => cambios[c])],
    );
    return rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return null; // email repetido
    throw err;
  }
}

export async function actualizarContrasena(id: string, passwordHash: string): Promise<void> {
  await pool.query("UPDATE usuarios SET password_hash = $2, actualizado_en = now() WHERE id = $1", [id, passwordHash]);
}

/** Cambia (o quita, con null) la foto. Devuelve la clave anterior para borrarla de S3. */
export async function actualizarFoto(id: string, fotoKey: string | null): Promise<string | null> {
  const { rows } = await pool.query<{ anterior: string | null }>(
    `UPDATE usuarios u SET foto_key = $2, actualizado_en = now()
       FROM (SELECT foto_key AS anterior FROM usuarios WHERE id = $1) previo
      WHERE u.id = $1
      RETURNING previo.anterior`,
    [id, fotoKey],
  );
  return rows[0]?.anterior ?? null;
}
