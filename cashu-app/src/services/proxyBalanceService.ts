import { fetch } from '@tauri-apps/plugin-http';
import { MOMO_API_BASE_URL } from '../constants.local';
import { ProxyRequestTimeoutError, withDeadline } from './proxyRequest';

export type ProxyBlinkBalanceResult =
  | { status: 'available'; balanceSats: number }
  | { status: 'unavailable'; reason: 'http'; statusCode: number }
  | { status: 'unavailable'; reason: 'timeout' | 'network' | 'invalid-response' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readBalanceSats(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return null;
  const data = payload.data;
  if (!isRecord(data)) return null;
  const me = data.me;
  if (!isRecord(me)) return null;
  const account = me.defaultAccount;
  if (!isRecord(account) || !Array.isArray(account.wallets)) return null;

  const wallets: unknown[] = account.wallets;
  const btcWallet = wallets.find(wallet => isRecord(wallet) && wallet.walletCurrency === 'BTC');
  if (!isRecord(btcWallet)) return null;
  const balance = btcWallet.balance;
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0) return null;
  return balance;
}

/** A read-only liquidity snapshot. Unavailable never means a zero balance. */
export async function fetchProxyBlinkBalance(): Promise<ProxyBlinkBalanceResult> {
  try {
    return await withDeadline<ProxyBlinkBalanceResult>(async signal => {
      const response = await fetch(`${MOMO_API_BASE_URL}/payment/balance`, { signal });
      if (!response.ok) {
        return { status: 'unavailable', reason: 'http', statusCode: response.status };
      }

      const payload: unknown = await response.json();
      const balanceSats = readBalanceSats(payload);
      if (balanceSats === null) return { status: 'unavailable', reason: 'invalid-response' };
      return { status: 'available', balanceSats };
    });
  } catch (error) {
    if (error instanceof ProxyRequestTimeoutError) {
      return { status: 'unavailable', reason: 'timeout' };
    }
    if (error instanceof SyntaxError) {
      return { status: 'unavailable', reason: 'invalid-response' };
    }
    return { status: 'unavailable', reason: 'network' };
  }
}
