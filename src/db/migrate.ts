import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

// Ejecuta en orden los .sql de /migrations que aún no se aplicaron.
const dir = path.resolve(process.cwd(), "migrations");

async function main() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ DEFAULT now())",
  );
  const { rows } = await pool.query<{ nombre: string }>("SELECT nombre FROM _migraciones");
  const aplicadas = new Set(rows.map((r) => r.nombre));

  const archivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await readFile(path.join(dir, archivo), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migraciones (nombre) VALUES ($1)", [archivo]);
      await client.query("COMMIT");
      console.log(`Migración aplicada: ${archivo}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
