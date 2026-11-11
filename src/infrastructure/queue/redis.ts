import { Redis } from "ioredis";
import { config } from "../../config/index.js";
import { throttledLogger } from "../../shared/resilience.js";

/** For workers: BullMQ requires maxRetriesPerRequest null; they wait and reconnect on their own. */
export function createWorkerConnection(): Redis {
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  redis.on("error", throttledLogger("redis"));
  return redis;
}

/** For work inside an HTTP request: fails at once if Redis is down, instead of hanging the request. */
export function createFastConnection(): Redis {
  const redis = new Redis(config.redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 3_000,
  });
  redis.on("error", throttledLogger("redis"));
  return redis;
}
