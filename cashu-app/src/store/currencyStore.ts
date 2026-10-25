import { create } from 'zustand';
import {
  getStoredPreferredCurrency,
  setStoredPreferredCurrency,
  getCachedRates,
  fetchAllTickerRates,
  convertSatsToFiat,
  CURRENCIES,
  CurrencyMeta,
} from '../services/currencyService';

interface CurrencyState {
  preferredCurrency: string;
  rates: Record<string, number>;
  isLoading: boolean;
  setPreferredCurrency: (code: string) => void;
  fetchRates: () => Promise<void>;
  convert: (sats: number) => { value: number; formatted: string; code: string; symbol: string };
  getCurrencyMeta: (code?: string) => CurrencyMeta;
}

export const useCurrencyStore = create<CurrencyState>()((set, get) => ({
  preferredCurrency: getStoredPreferredCurrency(),
  rates: getCachedRates(),
  isLoading: Object.keys(getCachedRates()).length === 0,

  setPreferredCurrency: (code: string) => {
    setStoredPreferredCurrency(code);
    set({ preferredCurrency: code });
  },

  fetchRates: async () => {
    try {
      const rates = await fetchAllTickerRates();
      set({ rates, isLoading: false });
    } catch (e) {
      console.error('Failed to fetch ticker rates', e);
      set({ isLoading: false });
    }
  },

  convert: (sats: number) => {
    const { preferredCurrency, rates } = get();
    return convertSatsToFiat(sats, preferredCurrency, rates);
  },

  getCurrencyMeta: (code?: string) => {
    const targetCode = code || get().preferredCurrency;
    return (
      CURRENCIES[targetCode] || {
        code: targetCode,
        name: targetCode,
        symbol: targetCode,
        decimals: 2,
      }
    );
  },
}));
