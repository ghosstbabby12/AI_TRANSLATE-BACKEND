import type { NextFunction, Request, Response } from "express";
import { config } from "../../../config/index.js";
import { databaseReadiness } from "../../../infrastructure/db/readiness.js";
import { HTTP_MESSAGES } from "../httpMessages.js";

const REQUEST_TIMEOUT_MS = 30_000;

export function cors(req: Request, res: Response, next: NextFunction) {
  res.set({
    "Access-Control-Allow-Origin": config.corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Disposition",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

/** No request hangs longer than 30 s. Uploads are excluded: a big file on a slow connection takes longer. */
export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  if (req.is("multipart/form-data")) return next();
  const timer = setTimeout(() => {
    if (!res.headersSent) res.status(503).json({ error: HTTP_MESSAGES.tooSlow });
  }, REQUEST_TIMEOUT_MS);
  res.on("close", () => clearTimeout(timer));
  next();
}

/** While migrations are running, routes that use the database answer 503. */
export function requireDatabase(_req: Request, res: Response, next: NextFunction) {
  if (databaseReadiness.migrations === "ok") return next();
  res.status(503).set("Retry-After", "10").json({ error: HTTP_MESSAGES.starting });
}
