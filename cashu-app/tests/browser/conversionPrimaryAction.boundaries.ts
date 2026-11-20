import { encodeQuote } from '../../src/services/stableBalanceModel';
import type { StableOperation, StableStage } from '../../src/services/stableBalanceModel';

const query = new URLSearchParams(location.search);
const direction = query.has('to-sats') ? 'toSats' : 'toUsd';
const operation = (stage: StableStage): StableOperation => ({
  id: 'fixture-conversion', direction, stage, mint_url: 'https://mint.example.test',
  created_at: Date.now() / 1000, expires_at: Date.now() / 1000 + (query.has('expired') ? -1 : 60),
  output_amount: direction === 'toUsd' ? '1000000' : '1000', max_debit: direction === 'toUsd' ? '2000' : '2000000',
  protection_bps: query.has('live-review') ? 0 : 300,
  funding_invoice: '', funding_sats: 0, mint_quote_id: '', payment_id: null,
  conversion_request_version: 0, prior_payment_ids: [],
  quote_json: encodeQuote({ paymentMethod: { type: 'bolt11Invoice', lightningFeeSats: 2 },
    conversionEstimate: { amountIn: 2000n, amountOut: 1000000n, fee: 1n } }),
  return_quote_id: stage === 'returnQuoted' ? 'fixture-return' : '',
  return_quote_json: encodeQuote({ paymentMethod: { type: 'bolt11Invoice', lightningFeeSats: 2 } }),
  return_amount: 1998,
});
let active = query.has('stage') ? operation(query.get('stage') as StableStage) : null;
let release: ((value: StableOperation) => void) | undefined;
export const fixture = {
  calls: [] as string[], changes: 0, dones: 0, closes: 0,
  finish(stage: StableStage) { active = operation(stage);release?.(active);release = undefined; },
};
const pending = (name: string): Promise<StableOperation> => {
  fixture.calls.push(name);
  return new Promise(resolve => {release = resolve;});
};
export const getActiveConversion = async () => active;
export const quoteStableConversion = () => query.has('rate-limit')
  ? (fixture.calls.push('quote'), Promise.reject(new Error('429 retry after 30 seconds')))
  : pending('quote');
export const executeStableConversion = () => pending('execute');
export const executeFundingReturn = () => pending('return');
export const checkStableConversion = () => pending('check');
export const quoteFundingReturn = () => pending('quote-return');
export const recoverPendingConversion = () => pending('recover');
export const cancelConversion = async () => {fixture.calls.push('cancel');active = null;};
export const getStableTransferLimits = async () => ({minSource: query.has('below-minimum') ? 1000000000n : 1n});
export const useReviewQuoteRefresh = () => ({refreshing: query.has('refreshing'), error: query.has('refresh-error') ? 'Fixture connection unavailable' : '', retryAt: 0, retry: () => fixture.calls.push('refresh')});
const currency = {rates: {USD: query.has('no-rate') ? 0 : 50000}, fetchRates: async () => {}};
export const useCurrencyStore = (select: (state: typeof currency) => unknown) => select(currency);
export const useWalletStore = {getState: () => ({refreshWallet: async () => {}})};
export const SovereignStampOverlay = () => null;
