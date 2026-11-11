import { describeError, retryUntilSuccess } from "../../shared/resilience.js";
import { applyMigrations } from "./migrations.js";

/**
 * The API opens its port right away (so /salud always answers) and applies the
 * migrations in the background; until they finish, routes that use the
 * database answer 503 instead of hanging.
 */
export const databaseReadiness = {
  migrations: "pending" as "pending" | "ok",
  lastError: null as string | null,
};

export async function prepareDatabase(): Promise<void> {
  await retryUntilSuccess("database", applyMigrations, (err) => {
    databaseReadiness.lastError = describeError(err);
  });
  databaseReadiness.migrations = "ok";
  databaseReadiness.lastError = null;
  console.log("Database ready");
}
