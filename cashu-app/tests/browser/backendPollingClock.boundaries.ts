import { createManualScheduler } from '../helpers/manualScheduler';

export const backendClock = createManualScheduler();
export const timeoutScheduler = backendClock.scheduler;
