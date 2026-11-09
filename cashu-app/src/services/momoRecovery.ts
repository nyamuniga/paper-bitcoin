import { AppPhase } from '../types/momo';
import type { TransactionDetails } from '../types/momo';

export const MOMO_RECOVERY_MESSAGE = 'This transfer was interrupted. Its status is not confirmed yet. Your transaction details have been saved.';

// Detach only settled UI states or read-only provider waits. A live funding or
// submission promise still writes through the foreground transaction slot.
export function canSaveMomoTransaction(tx: TransactionDetails | null): boolean {
  return !tx || [AppPhase.IDLE, AppPhase.PENDING_PAYMENT, AppPhase.VERIFYING_PAYMENT,
    AppPhase.VERIFYING_PAYOUT, AppPhase.RECOVERY_REQUIRED, AppPhase.RETRYABLE_ERROR,
    AppPhase.READY_TO_CLAIM, AppPhase.PAYOUT_COMPLETE, AppPhase.PAYMENT_FAILED,
    AppPhase.PAYOUT_FAILED, AppPhase.EXPIRED].includes(tx.currentPhase!);
}

// Run only when restoring storage, never while a live request is advancing.
export function recoverInterruptedMomo(tx: TransactionDetails | null): TransactionDetails | null {
  if (!tx || !['RWF_TO_SATS', 'SATS_TO_RWF'].includes(tx.direction) ||
      tx.status === 'COMPLETED' ||
      [AppPhase.READY_TO_CLAIM, AppPhase.PAYOUT_COMPLETE, AppPhase.RECOVERY_REQUIRED].includes(tx.currentPhase!)) return tx;
  const fundedCashout = tx.direction === 'SATS_TO_RWF' && tx.invoicePaid;
  if (['FAILED', 'EXPIRED'].includes(tx.status ?? '') && !fundedCashout) return tx;
  if (tx.currentPhase === AppPhase.IDLE && !tx.mintQuoteId && !tx.invoice && !fundedCashout) return tx;

  const beforePayment = !fundedCashout && ([AppPhase.FETCHING_RATE, AppPhase.GENERATING_INVOICE].includes(tx.currentPhase!) ||
    (tx.direction === 'RWF_TO_SATS' && tx.momoSubmission === 'rejected') ||
    (tx.currentPhase === AppPhase.INITIATING_PAYMENT && !tx.mintQuoteId));
  if (beforePayment) return {...tx, status:'FAILED', currentPhase:AppPhase.PAYMENT_FAILED,
    recoveryMessage:'The transfer stopped before a payment was started. You can close this screen and try again.'};

  // Legacy records lack submission markers. A missing provider reference does
  // not prove that the provider never accepted the request.
  return {...tx, status:'PENDING', currentPhase:AppPhase.RECOVERY_REQUIRED,
    recoveryMessage:tx.recoveryMessage || MOMO_RECOVERY_MESSAGE};
}
