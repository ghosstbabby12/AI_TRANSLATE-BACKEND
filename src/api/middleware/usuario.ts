import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
    }
  }
}

/**
 * Identificación mínima por cabecera `X-Usuario-Id`, suficiente para separar
 * el historial de cada usuario mientras no haya login.
 * TODO: reemplazar por verificación de un JWT (Auth0, Clerk, Cognito...).
 */
export function requiereUsuario(req: Request, res: Response, next: NextFunction) {
  const id = req.header("x-usuario-id");
  if (!id || !/^[\w-]{1,64}$/.test(id)) {
    res.status(401).json({ error: "Falta la cabecera X-Usuario-Id" });
    return;
  }
  req.usuarioId = id;
  next();
}
