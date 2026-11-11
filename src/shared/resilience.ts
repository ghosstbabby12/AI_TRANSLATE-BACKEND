/** A dependency (database, Redis) is not answering: the API replies 503. */
export class ServiceUnavailableError extends Error {
  constructor(message = "El servicio no está disponible en este momento. Intenta de nuevo en unos segundos.") {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rejects if the promise does not settle within `ms` (the original work keeps running). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ServiceUnavailableError(message)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** Retries a startup task with backoff (2 s, 4 s, 8 s… up to 60 s) until it succeeds. */
export async function retryUntilSuccess<T>(name: string, task: () => Promise<T>, onError?: (err: unknown) => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await task();
      if (attempt > 1) console.log(`[startup] ${name}: ready after ${attempt} attempts`);
      return result;
    } catch (err) {
      onError?.(err);
      const wait = Math.min(2_000 * 2 ** (attempt - 1), 60_000);
      console.error(`[startup] ${name} failed (attempt ${attempt}), retrying in ${wait / 1000}s: ${describeError(err)}`);
      await sleep(wait);
    }
  }
}

const CONNECTION_CODES = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "57P01", "57P03", "53300"];

/** Network errors from pg, ioredis or Node: a dependency is down, not a bug. */
export function isConnectionError(err: unknown): boolean {
  if (err instanceof ServiceUnavailableError) return true;
  const e = err as { code?: string; message?: string } | null;
  if (e?.code && CONNECTION_CODES.includes(e.code)) return true;
  return /timeout|terminated|Connection is closed|Stream isn't writeable|getaddrinfo/i.test(e?.message ?? "");
}

/** Short description without sensitive data (URLs are masked). */
export function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const text = (e?.message ?? String(err)).replace(/\b\w+:\/\/\S+/g, "<url>");
  return e?.code ? `${e.code}: ${text}` : text;
}

/** Logs at most one error per minute, so a dependency outage does not flood the logs. */
export function throttledLogger(label: string) {
  let last = 0;
  return (err: unknown) => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    console.error(`[${label}] ${describeError(err)}`);
  };
}
