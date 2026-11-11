import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inTransaction, pool } from "./pool.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

/** Runs, in order, the .sql files of /migrations that have not been applied yet. */
export async function applyMigrations(): Promise<void> {
  await pool.query("CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ DEFAULT now())");
  const { rows } = await pool.query<{ nombre: string }>("SELECT nombre FROM _migraciones");
  const applied = new Set(rows.map((r) => r.nombre));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => !applied.has(f))) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await inTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO _migraciones (nombre) VALUES ($1)", [file]);
    });
    console.log(`Migration applied: ${file}`);
  }
}
