import type { Scheduler } from './scheduler.ts';

/** Timer, SDK-event and manual callers join the same dispatched reconciliation. */
export function createSparkReconciler(syncAndSweep: (mint?: string) => Promise<boolean>) {
  let inFlight: Promise<boolean> | undefined;
  return (mint?: string): Promise<boolean> => {
    inFlight ??= Promise.resolve().then(() => syncAndSweep(mint)).finally(() => { inFlight = undefined; });
    return inFlight;
  };
}

const relevantEvents = new Set(['claimedDeposits', 'unclaimedDeposits', 'newDeposits', 'paymentSucceeded']);

export function startSparkReconciliation({ reconcile, subscribe, scheduler, refreshWallet, reportError }: {
  reconcile: (mint?: string) => Promise<boolean>;
  subscribe: (listener: (event: { type: string }) => void) => () => void;
  scheduler: Scheduler;
  refreshWallet: () => Promise<void>;
  reportError: (error: unknown) => void;
}) {
  let stopped = false;
  let busy = false;
  let cancelTimer: (() => void) | undefined;
  const request = (mint?: string) => {
    if (stopped || busy) return;
    busy = true;
    void (async () => {
      try {
        const swept = await reconcile(mint);
        if (swept && !stopped) await refreshWallet();
      } catch (error) {
        if (!stopped) reportError(error);
      } finally {
        busy = false;
      }
    })();
  };
  const tick = () => {
    if (stopped) return;
    request();
    cancelTimer = scheduler.schedule(tick, 15000);
  };
  tick();
  const unsubscribe = subscribe(event => {
    if (relevantEvents.has(event.type)) request();
  });
  return {
    request,
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelTimer?.();
      unsubscribe();
    },
  };
}
