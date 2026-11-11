import type { NextFunction, Request, Response } from "express";
import { MESSAGES } from "../../../application/messages.js";
import type { TokenService } from "../../../application/ports/services.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Requires a valid `Authorization: Bearer <token>` (issued by /auth/login). */
export function requireUser(tokens: TokenService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const [scheme, token] = (req.header("authorization") ?? "").split(" ");
    const userId = scheme === "Bearer" && token ? await tokens.verify(token) : null;
    if (!userId) return res.status(401).json({ error: MESSAGES.auth.loginRequired });
    req.userId = userId;
    next();
  };
}

/** The id of the signed-in user (only valid after requireUser). */
export const currentUserId = (req: Request) => req.userId!;
