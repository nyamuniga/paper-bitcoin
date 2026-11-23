export interface Scheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

/** Keep timer handles inside the adapter; callers own only an idempotent cancellation. */
export const timeoutScheduler: Scheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};
