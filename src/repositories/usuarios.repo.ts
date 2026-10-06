import { pool } from "../db/pool.js";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  creado_en: Date;
}

export type UsuarioPublico = Omit<Usuario, "password_hash">;

export const aPublico = ({ password_hash: _, ...u }: Usuario): UsuarioPublico => u;

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
