import { Router } from "express";
import { config } from "../../../config/index.js";
import { LANGUAGES } from "../../../domain/languages.js";
import { pool } from "../../../infrastructure/db/pool.js";
import { databaseReadiness } from "../../../infrastructure/db/readiness.js";
import { pingRedis } from "../../../infrastructure/queue/queues.js";
import { describeError, withTimeout } from "../../../shared/resilience.js";

const check = (probe: Promise<unknown>) =>
  withTimeout(probe, 3_000).then(
    () => "ok",
    (err) => `error (${describeError(err).slice(0, 120)})`,
  );

/** Health checks and the language list. They do not need the database to be ready. */
export function healthRoutes() {
  const router = Router();

  // Liveness: always answers at once (Render uses it as the health check).
  router.get("/salud", (_req, res) => {
    res.json({ ok: true });
  });

  // Diagnostics: state of each dependency, without sensitive data.
  router.get("/salud/detalle", async (_req, res) => {
    const [database, redis] = await Promise.all([check(pool.query("SELECT 1")), check(pingRedis())]);
    const { ai } = config;
    res.set("Cache-Control", "no-store").json({
      api: "ok",
      baseDeDatos: database,
      redis,
      migraciones: databaseReadiness.migrations === "ok" ? "ok" : "pendiente",
      ultimoErrorArranque: databaseReadiness.lastError,
      ia: ai.simulated ? "simulada" : `real (${ai.sttProvider} + ${ai.textProvider})`,
    });
  });

  router.get("/idiomas", (_req, res) => {
    res.json(Object.entries(LANGUAGES).map(([codigo, nombre]) => ({ codigo, nombre })));
  });

  return router;
}
