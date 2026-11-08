import express, { type NextFunction, type Request, type Response } from "express";
import { estadoArranque } from "../arranque.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { pingRedis } from "../queue/colas.js";
import { conTiempoLimite, describirError } from "../util/resiliencia.js";
import { IDIOMAS } from "../idiomas.js";
import { manejadorErrores } from "./middleware/errores.js";
import { authRouter } from "./routes/auth.routes.js";
import { perfilRouter } from "./routes/perfil.routes.js";
import { requiereUsuario } from "./middleware/usuario.js";
import { videosRouter } from "./routes/videos.routes.js";

export function crearApp() {
  const app = express();
  // Detrás del proxy de Render/AWS: req.ip debe ser la IP real del cliente
  // (la usa el límite de intentos de login).
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "Access-Control-Allow-Origin": config.CORS_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Disposition",
    });
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "100kb" }));
  app.use(tiempoLimitePeticion);

  // Liveness: responde siempre y al instante (Render lo usa como health check).
  app.get("/salud", (_req, res) => {
    res.json({ ok: true });
  });

  // Diagnóstico: estado de cada dependencia, sin datos sensibles.
  app.get("/salud/detalle", async (_req, res) => {
    const comprobar = (p: Promise<unknown>) =>
      conTiempoLimite(p, 3_000).then(
        () => "ok",
        (err) => `error (${describirError(err).slice(0, 120)})`,
      );
    const [baseDeDatos, redis] = await Promise.all([comprobar(pool.query("SELECT 1")), comprobar(pingRedis())]);
    res.set("Cache-Control", "no-store").json({
      api: "ok",
      baseDeDatos,
      redis,
      migraciones: estadoArranque.migraciones,
      ultimoErrorArranque: estadoArranque.ultimoError,
      ia: config.IA_MODO === "real" ? `real (${config.STT_PROVEEDOR} + ${config.TRADUCCION_PROVEEDOR})` : "simulada",
    });
  });
  app.get("/idiomas", (_req, res) => {
    res.json(Object.entries(IDIOMAS).map(([codigo, nombre]) => ({ codigo, nombre })));
  });
  app.use("/auth", requiereBaseLista, authRouter);
  app.use("/perfil", requiereBaseLista, requiereUsuario, perfilRouter);
  app.use("/videos", requiereBaseLista, videosRouter);

  // Express 5 propaga los errores de handlers async hasta aquí.
  app.use(manejadorErrores);
  return app;
}

/** Mientras las migraciones no terminen, las rutas con base de datos responden 503. */
function requiereBaseLista(_req: Request, res: Response, next: NextFunction) {
  if (estadoArranque.migraciones === "ok") return next();
  res
    .status(503)
    .set("Retry-After", "10")
    .json({ error: "El servidor está iniciando. Intenta de nuevo en unos segundos." });
}

/**
 * Ninguna petición queda colgada más de 30 s. Las subidas de video quedan
 * fuera: un archivo grande con una conexión lenta puede tardar más.
 */
function tiempoLimitePeticion(req: Request, res: Response, next: NextFunction) {
  if (req.is("multipart/form-data")) return next();
  const temporizador = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: "El servidor tardó demasiado en responder. Intenta de nuevo." });
    }
  }, 30_000);
  res.on("close", () => clearTimeout(temporizador));
  next();
}
