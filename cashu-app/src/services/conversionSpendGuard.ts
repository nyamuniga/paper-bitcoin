import type { ProvisionalPayment } from '@breeztech/breez-sdk-spark/web';
import { USDB_TOKEN_ID, USDB_TOKEN_HEX } from './stableBalanceModel.ts';
import type { StableOperation } from './stableBalanceModel.ts';

interface SpendingGuard {
  direction: StableOperation['direction'];
  ceiling: bigint;
  feeReserve: bigint;
  debits: Map<string, bigint>;
  rejected: boolean;
}
let active: SpendingGuard | undefined;
/** Proof exists only in this live invocation: observer rejected before approving any source debit. */
export class UnsubmittedConversionError extends Error {}

/** Installed on the SDK builder: runs after its internal repricing, before broadcast. */
export async function guardConversionPayments(payments: ProvisionalPayment[]): Promise<void> {
  const guard = active;
  if (!guard) return;
  const proposed = new Map(guard.debits);
  for (const payment of payments) {
    const token = payment.details.type === 'token';
    const usdb = payment.details.type === 'token' && (payment.details.tokenId === USDB_TOKEN_ID || payment.details.tokenId === USDB_TOKEN_HEX);
    const source = guard.direction === 'toUsd' ? !token : usdb;
    if (!source) continue; // Converted output's subsequent destination leg is in the other asset.
    if (payment.amount < 0n) throw new Error('Invalid conversion debit.');
    const previous = proposed.get(payment.paymentId);
    if (previous !== undefined && previous !== payment.amount) throw new Error('Conversion debit changed during submission.');
    proposed.set(payment.paymentId, payment.amount);
  }
  const total = [...proposed.values()].reduce((sum, value) => sum + value, guard.feeReserve);
  if (total > guard.ceiling) {
    guard.rejected = true;
    throw new Error('The conversion price increased beyond your approved maximum. No additional source payment was approved.');
  }
  guard.debits = proposed;
}

/** Balance-changing calls are serialized by withSparkBalanceLock. Never retry a rejected send here. */
export async function withConversionSpendGuard<T>(op: StableOperation, feeReserve: bigint, send: () => Promise<T>): Promise<T> {
  if (!op.protection_bps) return send();
  if (active) throw new Error('A conversion spending guard is already active.');
  active = {
    direction: op.direction,
    ceiling: op.direction === 'toUsd' ? BigInt(op.funding_sats) : BigInt(op.max_debit),
    feeReserve,
    debits: new Map(),
    rejected: false,
  };
  const guard = active;
  try {return await send();}
  catch (failure) {
    // A rejected callback is pre-broadcast. Any earlier approval makes the
    // overall outcome ambiguous, even when a later callback was blocked.
    if (guard.rejected && guard.debits.size === 0) throw new UnsubmittedConversionError('The conversion price increased beyond your approved maximum. No conversion payment was approved.');
    throw failure;
  } finally {active = undefined;}
}
