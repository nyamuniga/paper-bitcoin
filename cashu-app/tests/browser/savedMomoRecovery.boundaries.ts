import { createManualScheduler } from '../helpers/manualScheduler';

/** Keep saved reconciliation independently controllable from the foreground owner. */
export const recoveryClock = createManualScheduler();
export const timeoutScheduler = recoveryClock.scheduler;
