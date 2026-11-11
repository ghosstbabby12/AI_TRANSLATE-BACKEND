import { deps, useCases } from "./container.js";
import { pool } from "./infrastructure/db/pool.js";
import { startWorkers } from "./infrastructure/workers/startWorkers.js";

// Standalone worker process (docker compose, or a paid plan with a separate worker).
const stopWorkers = startWorkers(useCases, deps.videos);

// Graceful shutdown: running jobs finish before exiting (Render sends SIGTERM).
async function shutdown() {
  console.log("Stopping worker...");
  await stopWorkers();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
