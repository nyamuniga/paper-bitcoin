export const EXCHANGE_RATE_API_URL = import.meta.env.VITE_EXCHANGE_RATE_API_URL || 'https://blockchain.info/ticker?cors=true';
export const SATS_PER_BTC = parseInt(import.meta.env.VITE_SATS_PER_BTC) || 100_000_000;
export const SPREAD = parseFloat(import.meta.env.VITE_SPREAD) || 0.021;
export const RWF_USD_PEG = parseInt(import.meta.env.VITE_RWF_USD_PEG) || 1500;
export const POLLING_INTERVAL_MS = parseInt(import.meta.env.VITE_POLLING_INTERVAL_MS) || 5000;
export const POLLING_TIMEOUT_MS = parseInt(import.meta.env.VITE_POLLING_TIMEOUT_MS) || 120000;
export const MOMO_API_BASE_URL = import.meta.env.VITE_MOMO_API_BASE_URL || 'https://payments-proxy.vercel.app/api';
export const LIGHTNING_API_ENDPOINT = (import.meta.env.VITE_MOMO_API_BASE_URL || 'https://payments-proxy.vercel.app/api').replace('/api', '/api/payment/mint');
export const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'JUUUzhUjTa+0yPdqNQVIzzH3bjsMR4QG38DdE2Gnuh8='; // Must be 32 bytes for AES-256
export const TX_FEE_PERCENTAGE = parseFloat(import.meta.env.VITE_TX_FEE_PERCENTAGE) || 0.03;