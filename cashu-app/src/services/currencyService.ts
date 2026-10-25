import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  EXCHANGE_RATE_API_URL,
  SATS_PER_BTC,
  SPREAD,
  RWF_USD_PEG,
} from '../constants.local';

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  RWF: { code: 'RWF', name: 'Rwandan Franc', symbol: 'RWF', decimals: 0 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  GHS: { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimals: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  MXN: { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', decimals: 2 },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  PLN: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2 },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  CZK: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2 },
  DKK: { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  HUF: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 0 },
  CLP: { code: 'CLP', name: 'Chilean Peso', symbol: 'CLP$', decimals: 0 },
  ARS: { code: 'ARS', name: 'Argentine Peso', symbol: 'ARS$', decimals: 2 },
  PEN: { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  RON: { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2 },
  HRK: { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', decimals: 2 },
  ISK: { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', decimals: 0 },
  TWD: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
  GTQ: { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q', decimals: 2 },
};

// Top prioritized currencies for quick access
export const POPULAR_CURRENCIES = ['RWF', 'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'CAD', 'AUD'];

const STORAGE_KEY_PREFERRED_CURRENCY = 'bitnotes_preferred_currency';
const STORAGE_KEY_RATES = 'bitnotes_cached_all_rates';

export function getStoredPreferredCurrency(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY_PREFERRED_CURRENCY);
    if (val && (CURRENCIES[val] || val.length === 3)) return val;
  } catch { }
  return 'RWF';
}

export function setStoredPreferredCurrency(currencyCode: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFERRED_CURRENCY, currencyCode);
  } catch { }
}

export function getCachedRates(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RATES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch { }
  return {};
}

export async function fetchAllTickerRates(): Promise<Record<string, number>> {
  const fetchFn = typeof tauriFetch === 'function' ? tauriFetch : fetch;
  const res = await fetchFn(EXCHANGE_RATE_API_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch exchange rates: ${res.statusText}`);
  }
  const data = await res.json();
  const rates: Record<string, number> = {};

  for (const [code, item] of Object.entries(data)) {
    if (item && typeof item === 'object' && 'last' in item) {
      const last = Number((item as any).last);
      if (!isNaN(last) && last > 0) {
        rates[code] = last;
      }
    }
  }

  // Derive RWF from USD rate via peg
  if (rates['USD']) {
    rates['RWF'] = rates['USD'] * RWF_USD_PEG;
  }

  try {
    localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(rates));
  } catch { }

  return rates;
}

export function convertSatsToFiat(
  sats: number,
  currencyCode: string,
  rates: Record<string, number>,
  spread: number = SPREAD
): { value: number; formatted: string; code: string; symbol: string } {
  const meta = CURRENCIES[currencyCode] || {
    code: currencyCode,
    name: currencyCode,
    symbol: currencyCode,
    decimals: 2,
  };

  const btcPrice = rates[currencyCode];
  if (!btcPrice || btcPrice <= 0) {
    return {
      value: 0,
      formatted: `••• ${meta.code}`,
      code: meta.code,
      symbol: meta.symbol,
    };
  }

  let value: number;
  if (currencyCode === 'RWF') {
    // When RWF is selected, calculate with spread added
    const rate = SATS_PER_BTC / btcPrice;
    value = Math.round(sats / (rate * (1 - spread)));
  } else {
    // Pure spot rate without spread for all other currencies
    value = (sats / SATS_PER_BTC) * btcPrice;
  }

  if (isNaN(value) || value < 0) value = 0;

  let formattedNumber: string;
  if (meta.decimals === 0) {
    formattedNumber = Math.round(value).toLocaleString();
  } else {
    formattedNumber = value.toLocaleString(undefined, {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    });
  }

  const formatted = meta.symbol !== meta.code
    ? `${meta.symbol}${formattedNumber} ${meta.code}`
    : `${formattedNumber} ${meta.code}`;

  return {
    value,
    formatted,
    code: meta.code,
    symbol: meta.symbol,
  };
}
