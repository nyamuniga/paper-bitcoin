import type { StableOperation } from './stableBalanceModel';

export type TransferErrorContext = 'quote' | 'review' | 'pending';

/** Native quote failures preserve the mint's retry delay; unknown throttles wait 30s. */
export function transferRetrySeconds(message: string): number | null {
  if (!/rate[\s_-]*limits?|too many requests|\b429\b/i.test(message)) return null;
  const seconds = Number(/retry after\s+(\d+)\s+seconds?/i.exec(message)?.[1] ?? 30);
  return Number.isFinite(seconds) ? Math.max(1, seconds) : 30;
}

/** SDK failures may be plain objects; String(error) would hide them as [object Object]. */
export function transferErrorDetails(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return typeof record.type === 'string' ? `${record.type}: ${record.message}` : record.message;
    try { return JSON.stringify(error, (_, value) => typeof value === 'bigint' ? value.toString() : value); } catch { /* Fall back for non-serializable failures. */ }
  }
  return String(error);
}

export function transferErrorMessage(message: string, context: TransferErrorContext): string {
  if (message.startsWith('Enter at least ')) return message;
  const retry = transferRetrySeconds(message);
  if (retry !== null && context !== 'pending') return `The mint is busy. Try again in ${retry} seconds. No money was moved.`;
  if (/insufficient|not enough|cannot cover/i.test(message)) return 'There isn’t enough in this balance to cover the amount and fees. Try a smaller amount.';
  if (/within this amount/i.test(message)) return 'We couldn’t get a quote for this amount. Try a smaller amount or check again later.';
  if (/minimum|too small|below/i.test(message)) return 'This amount is too small to transfer. Try a larger amount.';
  if (/expired/i.test(message)) return 'This quote has expired. Go back and review the transfer again.';
  if (/price increased|quote changed/i.test(message)) return 'The rate changed. Review the amount again, or return your Bitcoin to your balance.';
  if (/updated wallet backend/i.test(message)) return 'Restart the app to finish updating before you transfer.';
  if (context === 'pending') return 'Your transfer is saved. Check progress to see whether it completed before taking another action.';
  if (/current Bitcoin operation/i.test(message)) return 'Another Bitcoin operation is running. Wait for it to finish, then check again.';
  if (/saved conversion first/i.test(message)) return 'You have an unfinished transfer. Reopen Convert to view its progress.';
  if (/wallet.*changed|amount or balance changed/i.test(message)) return 'Your wallet, amount, or balance changed. Check the amount again.';
  if (/timeout|timed out|deadline/i.test(message)) return 'The transfer quote request timed out. Check again to request a new quote.';
  if (/network|fetch|unavailable|verify|sync|connection/i.test(message)) return 'We couldn’t reach the payment service to get a quote. Check your connection and try again.';
  return context === 'quote' ? 'We couldn’t get a transfer quote. Check the details below, then try again.' : 'We couldn’t prepare the transfer for review. Check the details below, then try again.';
}

/** A submitted payment has an unconfirmed outcome. Status checks may resolve it; never resend it. */
export class TransferPendingError extends Error {
  operation?: StableOperation;
  constructor(message: string, operation?: StableOperation) {
    super(message);
    this.operation = operation;
  }
}
/** The provider or mint explicitly reported a failure that needs user attention. */
export class TransferFailedError extends Error {}
