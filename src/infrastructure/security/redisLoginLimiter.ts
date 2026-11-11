import type { LoginLimiter } from "../../application/ports/services.js";
import { describeError, withTimeout } from "../../shared/resilience.js";
import { createFastConnection } from "../queue/redis.js";

// Stops brute force: at most MAX_FAILURES per IP + email within WINDOW_SECONDS.
// Kept in Redis so the limit holds across several API instances.
const MAX_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

const redis = createFastConnection();
const keyOf = (ip: string, email: string) => `login-fallido:${ip}:${email}`;

/**
 * If Redis does not answer, the limit is skipped ("fail open"): better to
 * allow logins without a counter for a while than to lock everyone out.
 */
async function safely<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await withTimeout(operation(), 2_000);
  } catch (err) {
    console.warn(`[login] attempt limit skipped, Redis is not answering: ${describeError(err)}`);
    return fallback;
  }
}

export const redisLoginLimiter: LoginLimiter = {
  isBlocked: (ip, email) => safely(async () => Number(await redis.get(keyOf(ip, email))) >= MAX_FAILURES, false),

  recordFailure: (ip, email) =>
    safely(async () => {
      const key = keyOf(ip, email);
      if ((await redis.incr(key)) === 1) await redis.expire(key, WINDOW_SECONDS);
    }, undefined),

  reset: (ip, email) =>
    safely(async () => {
      await redis.del(keyOf(ip, email));
    }, undefined),
};
