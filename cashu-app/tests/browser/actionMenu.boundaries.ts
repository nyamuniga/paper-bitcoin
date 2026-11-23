const wallet = { balanceView: 'btc', setBalanceView: () => {} };
const currency = {
  preferredCurrency: 'BTC', rates: {}, fetchRates: async () => {},
  convert: () => ({ value: 1000 }), getCurrencyMeta: () => ({ code: 'BTC', decimals: 0, symbol: '₿' }),
};

// Only external state/provider boundaries are synthetic; the card and menu remain real.
export const useWalletStore = (select: (state: typeof wallet) => unknown) => select(wallet);
export const useCurrencyStore = (select: (state: typeof currency) => unknown) => select(currency);
export const useStableBalance = () => ({ balance: 0n, error: null });
export const useMintInfo = () => ({ info: { name: 'Fixture mint' } });
export const invoke = async () => { throw new Error('Native IPC is outside this fixture'); };
