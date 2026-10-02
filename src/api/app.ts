import express from "express";
import { config } from "../config.js";
import { manejadorErrores } from "./middleware/errores.js";
import { videosRouter } from "./routes/videos.routes.js";

export function crearApp() {
  const app = express();

  app.use((req, res, next) => {
    res.set({
      "Access-Control-Allow-Origin": config.CORS_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, X-Usuario-Id",
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
  app.use("/videos", videosRouter);

  // Express 5 propaga los errores de handlers async hasta aquí.
  app.use(manejadorErrores);
  return app;
}
