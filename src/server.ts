import { config } from "./config/index.js";
import { deps, useCases } from "./container.js";
import { pool } from "./infrastructure/db/pool.js";
import { prepareDatabase } from "./infrastructure/db/readiness.js";
import { startWorkers } from "./infrastructure/workers/startWorkers.js";
import { createApp } from "./presentation/http/app.js";
import { describeError } from "./shared/resilience.js";

// An unexpected rejected promise must not bring the whole server down.
process.on("unhandledRejection", (err) => console.error(`[process] unhandled rejection: ${describeError(err)}`));

// 1. Open the port first: /salud answers even if the database or Redis are down.
const server = createApp(useCases, deps.tokens).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

// 2. Migrations in the background, retried until the database answers.
// 3. Render's free plan has no background workers: the API processes jobs too.
let stopWorkers: (() => Promise<void>) | null = null;
void prepareDatabase().then(() => {
  if (config.workers.runInsideApi) stopWorkers = startWorkers(useCases, deps.videos);
});

process.on("SIGTERM", () => {
  server.close(async () => {
    await stopWorkers?.();
    await pool.end();
    process.exit(0);
  });
});
