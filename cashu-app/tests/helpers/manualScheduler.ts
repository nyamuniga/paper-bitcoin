import type { Scheduler } from '../../src/services/scheduler.ts';

/** Runs due callbacks without awaiting their I/O, so deadlines can fire during pending requests. */
export function createManualScheduler() {
  let now = 0;
  const tasks = new Set<{ at: number; callback: () => void }>();
  const scheduler: Scheduler = {
    schedule(callback, delayMs) {
      const task = { at: now + delayMs, callback };
      tasks.add(task);
      return () => { tasks.delete(task); };
    },
  };
  return {
    scheduler,
    advanceBy(milliseconds: number) {
      const target = now + milliseconds;
      for (;;) {
        const next = [...tasks].filter(task => task.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        tasks.delete(next);
        now = next.at;
        next.callback();
      }
      now = target;
    },
    get pendingCount() { return tasks.size; },
    get delays() { return [...tasks].map(task => task.at - now).sort((a, b) => a - b); },
    callbacks: () => [...tasks].map(task => task.callback),
  };
}
