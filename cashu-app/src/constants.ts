/** Public defaults only. Configure deployments through an ignored .env file.
 * Frontend environment values are bundled into the app; they are not secrets.
 */
function numberEnv(name: string, fallback: number, minimum = 0): number {
  const raw = import.meta.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

export const EXCHANGE_RATE_API_URL = import.meta.env.VITE_EXCHANGE_RATE_API_URL || 'https://blockchain.info/ticker?cors=true';
export const SATS_PER_BTC = 100_000_000;
export const SPREAD = numberEnv('VITE_SPREAD', 0.021);
export const MOMO_WITHDRAWAL_FIXED_FEE = numberEnv('VITE_MOMO_WITHDRAWAL_FIXED_FEE', 120);
export const ECASH_LIGHTNING_FEE = numberEnv('VITE_ECASH_LIGHTNING_FEE', 10);
export const RWF_USD_PEG = numberEnv('VITE_RWF_USD_PEG', 1500, 1);
export const POLLING_INTERVAL_MS = numberEnv('VITE_POLLING_INTERVAL_MS', 5000, 1);
export const POLLING_TIMEOUT_MS = numberEnv('VITE_POLLING_TIMEOUT_MS', 120000, 1);
export const MOMO_API_BASE_URL = import.meta.env.VITE_MOMO_API_BASE_URL || 'https://payments-proxy.vercel.app/api';
export const LIGHTNING_API_ENDPOINT = import.meta.env.VITE_LIGHTNING_API_ENDPOINT || `${MOMO_API_BASE_URL.replace(/\/$/, '')}/payment/mint`;
export const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || '';
export const TX_FEE_PERCENTAGE = numberEnv('VITE_TX_FEE_PERCENTAGE', 0);
export const NPUB_CASH_API_URL = import.meta.env.VITE_NPUB_CASH_API_URL || 'https://www.28waves.com';
export const NPUB_DOMAIN = import.meta.env.VITE_NPUB_DOMAIN || '28waves.com';
export const NPUB_CASH_BACKEND_URL = import.meta.env.VITE_NPUB_CASH_BACKEND_URL || 'https://npubcash-server.runsite.app';
export const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";
export const BREEZ_API_KEY = import.meta.env.VITE_BREEZ_API_KEY || import.meta.env.BREEZ_API_KEY
  || import.meta.env.VITE_BREEZE_API_KEY || import.meta.env.BREEZE_API_KEY
  || import.meta.env.VITE_BREEZE_KEY || import.meta.env.BREEZE_KEY || '';
