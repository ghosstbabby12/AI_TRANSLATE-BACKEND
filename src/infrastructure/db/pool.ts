import pg from "pg";
import { config } from "../../config/index.js";
import { throttledLogger } from "../../shared/resilience.js";

// NUMERIC arrives as a string by default; times are needed as numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  // Without this, pg waits for the system timeout (over a minute) when the database does not answer.
  connectionTimeoutMillis: 10_000,
  // No query of the app takes more than milliseconds: a stuck one is cut instead of hanging the request.
  query_timeout: 15_000,
  statement_timeout: 15_000,
  idleTimeoutMillis: 30_000,
});

// An idle client that loses its connection emits 'error'; unhandled, it would crash the process.
pool.on("error", throttledLogger("postgres"));

/** Runs `work` inside a transaction. */
export async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
