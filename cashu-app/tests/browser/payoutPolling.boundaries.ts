import { createManualScheduler } from '../helpers/manualScheduler';
import type { MomoPaymentStatusResult, MomoPayoutSubmissionResult } from '../../src/types/momo';

export const clock = createManualScheduler();
export const timeoutScheduler = clock.scheduler;
export const payoutFixture = {
  requests: [] as { id: string; resolve: (status: MomoPaymentStatusResult['status']) => void; reject: () => void }[],
  submissions: [] as { id: string; persistedIntent: {id: string; momoSubmission: string; invoicePaid: boolean}; resolve: (result: MomoPayoutSubmissionResult) => void }[],
  native: [] as string[], contacts: [] as unknown[][], refreshes: 0, subscriptions: 0, unsubscriptions: 0,
};
export const checkMomoPayoutStatus = (id: string) => new Promise<MomoPaymentStatusResult>((resolve,reject) => {
  payoutFixture.requests.push({id,resolve:status=>resolve({status}),reject:()=>reject(new Error('Synthetic status failure'))});
});
export const initiateMomoPayout = (id: string) => new Promise<MomoPayoutSubmissionResult>(resolve => {
  const stored=JSON.parse(localStorage.getItem('cashu-transaction-storage') ?? '{}').state?.activeTransaction;
  const persistedIntent={id:stored?.id,momoSubmission:stored?.momoSubmission,invoicePaid:stored?.invoicePaid};
  payoutFixture.submissions.push({id,persistedIntent,resolve});
});
const forbidden = async () => { throw new Error('Funding and cash-in are outside this fixture'); };
export const initiateMomoPaymentRequest = forbidden;
export const checkMomoPaymentStatus = forbidden;
export const payLightningInvoice = forbidden;
export const createLightningInvoice = forbidden;
export const fetch = forbidden;
export const invoke = async (command: string) => {
  payoutFixture.native.push(command);
  if (command === 'get_transactions') return [];
  throw new Error('Native payment is outside this fixture');
};
const wallet = { refreshWallet: async () => { payoutFixture.refreshes++; } };
export const useWalletStore = Object.assign((select: (value: typeof wallet) => unknown) => select(wallet), {getState:()=>wallet});
export const useAddressBookStore = {getState:()=>({recordSuccessfulUse:(...args:unknown[])=>payoutFixture.contacts.push(args)})};
export const syncAndSweepSpark = async () => false;
export const subscribeToSparkEvents = () => {
  payoutFixture.subscriptions++;
  return () => { payoutFixture.unsubscriptions++; };
};
export const EXCHANGE_RATE_API_URL='https://rate.example.test';
export const SATS_PER_BTC=100000000, SPREAD=0.021, MOMO_WITHDRAWAL_FIXED_FEE=120, ECASH_LIGHTNING_FEE=10, RWF_USD_PEG=1400;
export const POLLING_INTERVAL_MS=5000, POLLING_TIMEOUT_MS=120000;
