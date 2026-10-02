import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";

export function manejadorErrores(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Datos inválidos", detalles: z.flattenError(err).fieldErrors });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno" });
}
