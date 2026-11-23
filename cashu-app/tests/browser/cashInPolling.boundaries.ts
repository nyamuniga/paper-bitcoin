import { createManualScheduler } from '../helpers/manualScheduler';
export const clock = createManualScheduler();
export const timeoutScheduler = clock.scheduler;
type Status = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'UNKNOWN';
export const pollingFixture = {
  requests: [] as { id: string; resolve: (status: Status) => void; reject: () => void }[],
  native: [] as { command: string; args: unknown }[], refreshes: 0, subscriptions: 0, unsubscriptions: 0,
};
export const checkMomoPaymentStatus = (id: string) => new Promise<{status:Status}>((resolve,reject) => {
  pollingFixture.requests.push({id,resolve:status=>resolve({status}),reject:()=>reject(new Error('Synthetic status failure'))});
});
const forbidden = async () => { throw new Error('Payment submission is outside this fixture'); };
export const initiateMomoPaymentRequest = forbidden;
export const initiateMomoPayout = forbidden;
export const checkMomoPayoutStatus = forbidden;
export const payLightningInvoice = forbidden;
export const createLightningInvoice = forbidden;
export const fetch = forbidden;
export const invoke = async (command: string, args?: unknown) => {
  pollingFixture.native.push({command,args});
  if (command === 'get_transactions') return [];
  if (command === 'check_transaction_status') return 'Success';
  throw new Error('Native payment submission is outside this fixture');
};
const wallet = { refreshWallet: async () => { pollingFixture.refreshes++; } };
export const useWalletStore = Object.assign((select: (value: typeof wallet) => unknown) => select(wallet), { getState: () => wallet });
export const syncAndSweepSpark = async () => false;
export const subscribeToSparkEvents = () => {
  pollingFixture.subscriptions++;
  return () => { pollingFixture.unsubscriptions++; };
};
export const EXCHANGE_RATE_API_URL='https://rate.example.test';
export const SATS_PER_BTC=100000000, SPREAD=0.021, MOMO_WITHDRAWAL_FIXED_FEE=120, ECASH_LIGHTNING_FEE=10, RWF_USD_PEG=1400;
export const POLLING_INTERVAL_MS=5000, POLLING_TIMEOUT_MS=120000;
