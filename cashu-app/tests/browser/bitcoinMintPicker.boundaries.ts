// Browser-fixture doubles for wallet/native/provider boundaries, never app imports.
const query = new URLSearchParams(window.location.search);
export const balances = { 'https://mint-1.example.test': 10000, 'https://mint-2.example.test': 20000 };
export const fixture = { activeMint: '', receives: [] as { mode: string; amount: number; mint: string }[], submissions: 0 };

export const useWalletStore = (selector: (state: { mintBalances: typeof balances }) => unknown) => selector({ mintBalances: balances });
export const useHistory = () => ({ transactions: [] });
export const getOnchainSendLimits = async () => ({ min_sats: 2500, max_sats: 100000000 });

const rejectSubmission = () => {
  fixture.submissions++;
  throw new Error('Payment submission is forbidden in this fixture.');
};
export function useBitcoin(mint: string) {
  fixture.activeMint = mint;
  return {
    paying: query.has('paying'), requesting: query.has('requesting'),
    payInvoice: rejectSubmission, executeOnChain: rejectSubmission,
    estimateOnChain: async (_address: string, amount: number) => ({ amount, total_cost: amount + 20, cashu_fee: 10, ark_fee: 10, bridging_invoice: 'fixture-only' }),
    receiveLightning: async (amount: number, mint: string) => {
      fixture.receives.push({ mode: 'lightning', amount, mint });
      return { quoteId: 'fixture-quote', receiveInvoice: 'lnbc1fixture' };
    },
    receiveOnChain: async (amount: number, mint: string) => {
      fixture.receives.push({ mode: 'onchain', amount, mint });
      return { quoteId: 'fixture-quote', boardingAddress: 'bc1qfixture', amountSats: amount, estimatedFeeSats: 0 };
    },
  };
}

const params = { callback: 'https://lnurl.example.test', minSendable: 1000, maxSendable: 100000000 };
export const useLnurlValidation = () => ({ status: 'valid', params, domain: 'example.test', error: null });
export const validateLnurlPay = async () => ({ params, error: null });
// Keeps the view in its real isFetchingLnurl state without contacting a provider.
export const fetchLnurlPayInvoice = () => new Promise(() => {});
