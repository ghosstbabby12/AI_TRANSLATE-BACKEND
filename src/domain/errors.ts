/**
 * Errors with business meaning. The HTTP layer turns them into status codes
 * and the workers decide from them whether a job is worth retrying.
 */
export class NotFoundError extends Error {
  readonly name = "NotFoundError";
}

/** The request is valid but the resource is not in a state that allows it (HTTP 409). */
export class ConflictError extends Error {
  readonly name = "ConflictError";
}

/** The user is authenticated but must confirm something first (HTTP 403). */
export class ForbiddenError extends Error {
  readonly name = "ForbiddenError";
}

export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError";
}

export class TooManyRequestsError extends Error {
  readonly name = "TooManyRequestsError";
}

export class BadRequestError extends Error {
  readonly name = "BadRequestError";
}

/** A failure that retrying will not fix (empty video, refused content, missing model…). */
export class PermanentError extends Error {
  readonly name = "PermanentError";
}

/** A temporary failure (rate limit, network, timeout): retry later. */
export class RetryableError extends Error {
  readonly name = "RetryableError";
}

/** Any unknown failure is assumed to be temporary. */
export const isRetryable = (err: unknown) => !(err instanceof PermanentError);

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
