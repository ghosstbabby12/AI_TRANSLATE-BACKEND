import type { UserRepository } from "../../../application/ports/repositories.js";
import type { ProfileChanges } from "../../../domain/user.js";
import { pool } from "../pool.js";
import { toUser, type UserRow } from "../rows.js";

const one = async (sql: string, params: unknown[]) => {
  const { rows } = await pool.query<UserRow>(sql, params);
  return rows[0] ? toUser(rows[0]) : null;
};

// Allow list: the only columns the profile can change
const PROFILE_COLUMNS: Record<keyof ProfileChanges, string> = {
  name: "nombre",
  email: "email",
  phone: "telefono",
  interfaceLanguage: "idioma_interfaz",
};

const UNIQUE_VIOLATION = "23505";

export const userRepository: UserRepository = {
  create: (u) =>
    one(
      `INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [u.name, u.email, u.passwordHash],
    ),

  findById: (id) => one("SELECT * FROM usuarios WHERE id = $1", [id]),

  findByEmail: (email) => one("SELECT * FROM usuarios WHERE email = $1", [email]),

  /** Updates only the fields sent. */
  async updateProfile(id, changes) {
    const fields = (Object.keys(PROFILE_COLUMNS) as (keyof ProfileChanges)[]).filter((f) => changes[f] !== undefined);
    if (fields.length === 0) return this.findById(id);
    const assignments = fields.map((f, i) => `${PROFILE_COLUMNS[f]} = $${i + 2}`).join(", ");
    try {
      return await one(`UPDATE usuarios SET ${assignments}, actualizado_en = now() WHERE id = $1 RETURNING *`, [
        id,
        ...fields.map((f) => changes[f]),
      ]);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null; // email already taken
      throw err;
    }
  },

  async updatePassword(id, passwordHash) {
    await pool.query("UPDATE usuarios SET password_hash = $2, actualizado_en = now() WHERE id = $1", [id, passwordHash]);
  },

  async setPhoto(id, photoKey) {
    const { rows } = await pool.query<{ anterior: string | null }>(
      `UPDATE usuarios u SET foto_key = $2, actualizado_en = now()
         FROM (SELECT foto_key AS anterior FROM usuarios WHERE id = $1) previo
        WHERE u.id = $1
        RETURNING previo.anterior`,
      [id, photoKey],
    );
    return rows[0]?.anterior ?? null;
  },
};
