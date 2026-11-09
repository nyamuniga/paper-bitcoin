// Mainnet USDB identity, from https://sdk-doc-spark.breez.technology/guide/stable_balance.html
export const USDB_TOKEN_ID = 'btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87';
export const USDB_TOKEN_HEX = '3206c93b24a4d18ea19d0a9a213204af2c7e74a6d16c7535cc5d33eca4ad1eca';
export const USD_DECIMALS = 6;
export const SLIPPAGE_BPS = 10;
export const PROTECTION_BPS = 300;
/** Source currency reserve, separate from provider slippage already in its estimate. */
export const protectedCost = (cost: bigint) => (cost * BigInt(10000 + PROTECTION_BPS) + 9999n) / 10000n;
export const conservativeOutput = (amount: bigint) => amount * 10000n / BigInt(10000 + PROTECTION_BPS);
export type StableDirection = 'toUsd' | 'toSats';
export type StableStage = 'quoted' | 'funding' | 'funded' | 'converting' | 'settling' | 'returnQuoted' | 'returning' | 'complete' | 'cancelled' | 'refunded';
export interface StableOperation {
  id: string;
  direction: StableDirection;
  stage: StableStage;
  mint_url: string;
  created_at: number;
  expires_at: number;
  output_amount: string;
  max_debit: string;
  /** Absent/zero for legacy live reviews; 300 freezes the receive floor and spend ceiling. */
  protection_bps?: number;
  funding_invoice: string;
  funding_sats: number;
  mint_quote_id: string;
  quote_json: string;
  payment_id: string | null;
  conversion_request_version: number;
  prior_payment_ids: string[];
  return_quote_id: string;
  return_quote_json: string;
  return_amount: number;
}
export function parseUnits(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new Error('Enter a positive amount using digits and a decimal point.');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('Too many decimal places.');
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is outside the supported range.');
  return amount;
}
export function formatUnits(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return whole.toString() + (fraction ? '.' + fraction : '');
}
export function conversionCost(estimate: {amountIn: bigint; fee: bigint}): bigint {
  if (estimate.amountIn <= 0n || estimate.fee < 0n) throw new Error('Invalid conversion quote.');
  return estimate.amountIn + estimate.fee;
}
export function encodeQuote(value: unknown): string {
  return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? {$bigint: v.toString()} : v);
}
export function decodeQuote<T>(json: string): T {
  return JSON.parse(json, (_, v) => {
    if (v && typeof v === 'object' && '$bigint' in v) {
      if (!/^\d+$/.test(v.$bigint)) throw new Error('Invalid saved quote.');
      return BigInt(v.$bigint);
    }
    return v;
  });
}
