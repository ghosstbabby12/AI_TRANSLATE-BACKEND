import { describeError } from "../../shared/resilience.js";

/**
 * Enqueues without failing the request. The work is already saved as
 * "processing" in the database, so the periodic recovery sweep picks it up
 * once the queue is available again.
 */
export async function enqueueOrDefer(enqueue: () => Promise<void>, label: string): Promise<void> {
  try {
    await enqueue();
  } catch (err) {
    console.warn(`[${label}] not queued yet: ${describeError(err)}`);
  }
}
