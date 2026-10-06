import express from "express";
import { config } from "../config.js";
import { IDIOMAS } from "../idiomas.js";
import { manejadorErrores } from "./middleware/errores.js";
import { authRouter } from "./routes/auth.routes.js";
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Disposition",
    });
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "100kb" }));

  app.get("/salud", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/idiomas", (_req, res) => {
    res.json(Object.entries(IDIOMAS).map(([codigo, nombre]) => ({ codigo, nombre })));
  });
  app.use("/auth", authRouter);
  app.use("/videos", videosRouter);

  // Express 5 propaga los errores de handlers async hasta aquí.
  app.use(manejadorErrores);
  return app;
}
