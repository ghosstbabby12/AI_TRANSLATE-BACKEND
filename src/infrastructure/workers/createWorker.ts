import { UnrecoverableError, Worker, type Job, type WorkerOptions } from "bullmq";
import { PermanentError } from "../../domain/errors.js";
import { describeError, throttledLogger } from "../../shared/resilience.js";
import { createWorkerConnection } from "../queue/redis.js";

interface WorkerSetup<T> {
  queue: string;
  label: string;
  handle: (data: T, job: Job<T>) => Promise<void>;
  /** Called once a job has failed for the last time (no retries left). */
  onFinalFailure?: (data: T, message: string) => Promise<void>;
  options?: Omit<WorkerOptions, "connection">;
}

/**
 * A BullMQ worker that understands the domain errors: a PermanentError stops
 * the retries right away, any other error is retried by the queue.
 */
export function createWorker<T>({ queue, label, handle, onFinalFailure, options }: WorkerSetup<T>): Worker<T> {
  const worker = new Worker<T>(
    queue,
    async (job) => {
      try {
        await handle(job.data, job);
      } catch (err) {
        throw err instanceof PermanentError ? new UnrecoverableError(err.message) : err;
      }
    },
    { connection: createWorkerConnection(), ...options },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const isFinal = err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(`[${label}] job ${job.id} failed${isFinal ? " for good" : ""}: ${err.message}`);
    if (!isFinal || !onFinalFailure) return;
    // If the database is down too, this must not become an unhandled rejection.
    await onFinalFailure(job.data, err.message).catch((e) =>
      console.error(`[${label}] could not record the failure of job ${job.id}: ${describeError(e)}`),
    );
  });
  // Redis down: workers reconnect on their own; only log it, without flooding.
  worker.on("error", throttledLogger(`worker ${label}`));
  return worker;
}
