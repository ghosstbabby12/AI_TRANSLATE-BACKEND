import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { describirError, esErrorDeConexion } from "../../util/resiliencia.js";

export function manejadorErrores(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // La respuesta ya salió (p. ej. por el tiempo límite): solo queda registrarlo.
  if (res.headersSent) {
    console.error(`[api] error tras responder: ${describirError(err)}`);
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Datos inválidos", detalles: z.flattenError(err).fieldErrors });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
    return;
  }
  // Base de datos o Redis caídos: no es un bug, es una dependencia temporalmente fuera.
  if (esErrorDeConexion(err)) {
    console.error(`[api] dependencia no disponible: ${describirError(err)}`);
    res
      .status(503)
      .set("Retry-After", "10")
      .json({ error: "El servicio no está disponible en este momento. Intenta de nuevo en unos segundos." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno" });
}
