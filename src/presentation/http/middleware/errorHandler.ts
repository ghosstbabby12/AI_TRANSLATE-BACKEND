import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from "../../../domain/errors.js";
import { describeError, isConnectionError } from "../../../shared/resilience.js";
import { HTTP_MESSAGES } from "../httpMessages.js";

// Domain errors and the HTTP status each one becomes
const STATUS_BY_ERROR: [new (...args: never[]) => Error, number][] = [
  [BadRequestError, 400],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
  [TooManyRequestsError, 429],
];

/** Turns any error into an HTTP answer. Express 5 forwards errors from async handlers here. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // The answer already left (e.g. by the timeout): it can only be logged.
  if (res.headersSent) return console.error(`[api] error after responding: ${describeError(err)}`);

  const match = STATUS_BY_ERROR.find(([type]) => err instanceof type);
  if (match) return res.status(match[1]).json({ error: (err as Error).message });

  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: HTTP_MESSAGES.invalidData, detalles: z.flattenError(err).fieldErrors });
  }
  // Malformed JSON body (detected by express.json): a client error
  if ((err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: HTTP_MESSAGES.invalidJson });
  }
  if (err instanceof multer.MulterError) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
  }
  // Database or Redis down: not a bug, a dependency is temporarily out.
  if (isConnectionError(err)) {
    console.error(`[api] dependency unavailable: ${describeError(err)}`);
    return res.status(503).set("Retry-After", "10").json({ error: HTTP_MESSAGES.unavailable });
  }
  console.error(err);
  res.status(500).json({ error: HTTP_MESSAGES.internal });
}
