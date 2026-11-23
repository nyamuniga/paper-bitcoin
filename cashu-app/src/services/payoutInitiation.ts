import { AppPhase } from '../types/momo';
import type { MomoPayoutSubmissionResult, MomoTransactionAccess } from '../types/momo';
import { MOMO_RECOVERY_MESSAGE } from './momoRecovery';

/** Persist intent before dispatch; ambiguous or interrupted intent is never resubmitted. */
export const startPayoutInitiation = ({ transactionId, transactions, submitPayout, isCurrent = () => true }: {
  transactionId: string;
  transactions: MomoTransactionAccess;
  submitPayout: (transactionId: string, rwfAmount: number, satsAmount: number, phone: string) => Promise<MomoPayoutSubmissionResult>;
  isCurrent?: () => boolean;
}) => {
  const transaction = transactions.findById(transactionId);
  if (!transactionId || !transaction || transaction.id !== transactionId || !isCurrent()
    || transaction.direction !== 'SATS_TO_RWF' || transaction.status !== 'PENDING'
    || transaction.currentPhase !== AppPhase.INITIATING_PAYOUT) return;

  let stopped = false;
  const stop = () => { stopped = true; };
  const current = () => {
    const target = transactions.findById(transactionId);
    return !stopped && isCurrent() && target?.id === transactionId
      && target.direction === 'SATS_TO_RWF' && target.status === 'PENDING'
      && target.currentPhase === AppPhase.INITIATING_PAYOUT;
  };
  const recover = (recoveryMessage: string, error?: string) => {
    if (!current()) return;
    stop();
    transactions.updateById(transactionId, { currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage });
    if (error !== undefined) transactions.setErrorFor(transactionId, error);
  };
  const start = async () => {
    try {
      if (transaction.payoutReferenceId) {
        transactions.updateById(transactionId, { currentPhase: AppPhase.VERIFYING_PAYOUT });
        return;
      }
      if (!transaction.invoicePaid) {
        recover('The funding payment has not been confirmed. Contact support before retrying this cashout.');
        return;
      }
      if (transaction.momoSubmission !== 'not_started') {
        recover(MOMO_RECOVERY_MESSAGE);
        return;
      }
      // This synchronous write must persist successfully before any provider call.
      transactions.updateById(transactionId, { momoSubmission: 'submitting' });
      if (!current()) return;
      const result = await submitPayout(transactionId, transaction.rwfAmount, transaction.satsAmount, transaction.momoPhoneNumber);
      if (!current()) return;
      if (!result.success || !result.referenceId) {
        if (!result.success && result.submission === 'rejected') transactions.updateById(transactionId, { momoSubmission: 'rejected' });
        throw new Error(result.message || 'Failed to initiate MoMo payout.');
      }
      transactions.updateById(transactionId, {
        payoutReferenceId: result.referenceId,
        momoSubmission: 'accepted',
        currentPhase: AppPhase.VERIFYING_PAYOUT,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      recover(message || MOMO_RECOVERY_MESSAGE, message || 'Failed to initiate MoMo payout.');
    }
  };
  void start().catch(error => {
    console.error('Could not persist payout recovery state:', error);
  });
  return stop;
};
