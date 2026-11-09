import type { StableDirection } from './stableBalanceModel';

/** A display estimate only. The payment provider supplies the reviewed quote. */
export function estimateTransferOutput(direction: StableDirection, source: bigint, usdPerBitcoin: number): bigint | null {
  if (!Number.isFinite(usdPerBitcoin) || usdPerBitcoin <= 0 || !Number.isSafeInteger(Math.round(usdPerBitcoin * 1e6))) return null;
  const price = BigInt(Math.round(usdPerBitcoin * 1e6));
  if (price === 0n) return null;
  return direction === 'toUsd' ? source * price / 100000000n : source * 100000000n / price;
}
export function percentageAmount(balance: bigint, percent: number): bigint {
  return balance * BigInt(percent) / 100n;
}
export function resizeTransferOutput(output: bigint, budget: bigint, quotedDebit: bigint, principal = quotedDebit): bigint {
  if (output <= 0n || budget <= 0n || principal <= 0n) return 0n;
  const overshoot = quotedDebit - budget;
  if (overshoot <= 0n) return output;
  // Convert the source-currency overshoot into output units using the live
  // provider quote. Round up, with one output unit of safety for fee rounding.
  const correction = (output * overshoot + principal - 1n) / principal + 1n;
  return correction >= output ? 0n : output - correction;
}
export function dollarAmount(units: bigint): string {
  if (units > 0n && units < 10000n) return '<$0.01';
  const cents = units / 10000n;
  return '$' + (cents / 100n).toLocaleString('en-US') + '.' + (cents % 100n).toString().padStart(2, '0');
}

export class TransferMinimumError extends Error {
  minimum: bigint;
  includesFees: boolean;
  constructor(minimum: bigint, includesFees = false) {
    super('The amount does not cover the minimum transfer' + (includesFees ? ' and fees.' : '.'));
    this.name = 'TransferMinimumError';
    this.minimum = minimum;
    this.includesFees = includesFees;
  }
}
export function providerMinimum(error: unknown): {attempted: bigint; minimum: bigint} | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /Amount in (\d+) is less than minimum required (\d+)\b/i.exec(message);
  if (!match) return null;
  const attempted = BigInt(match[1]), minimum = BigInt(match[2]);
  return attempted > 0n && minimum > attempted && minimum <= BigInt(Number.MAX_SAFE_INTEGER) ? {attempted, minimum} : null;
}

/** Nominal Dollar holdings expressed at the selected currency's spot cross-rate. */
export function dollarFiatValue(units: bigint, currency: string, rates: Record<string, number>): number | null {
  const dollars = Number(units) / 1000000;
  if (currency === 'USD') return dollars;
  const usd = rates.USD, target = currency === 'BTC' ? 1 : rates[currency];
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(target) || target <= 0) return null;
  const value = currency === 'BTC' ? dollars / usd : dollars * (target / usd);
  return Number.isFinite(value) ? value : null;
}
