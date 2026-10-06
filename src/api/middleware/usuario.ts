import type { NextFunction, Request, Response } from "express";
import { verificarToken } from "../../auth/tokens.js";

declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
    }
  }
}

/** Exige `Authorization: Bearer <token>` válido (lo emite /auth/login). */
export async function requiereUsuario(req: Request, res: Response, next: NextFunction) {
  const [tipo, token] = (req.header("authorization") ?? "").split(" ");
  const usuarioId = tipo === "Bearer" && token ? await verificarToken(token) : null;
  if (!usuarioId) {
    res.status(401).json({ error: "Inicia sesión para continuar" });
    return;
  }
  req.usuarioId = usuarioId;
  next();
}
