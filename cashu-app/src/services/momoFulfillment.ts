import { AppPhase, FulfillmentStep } from '../types/momo';
import type { MomoTransactionAccess, TransactionDetails } from '../types/momo';
import { MOMO_RECOVERY_MESSAGE } from './momoRecovery';

export interface MomoFulfillmentOperations {
  payInvoice(invoice: string): Promise<{ success: boolean; message?: string }>;
  checkMintStatus(quoteId: string): Promise<string>;
  wait(milliseconds: number): Promise<void>;
  now(): number;
}

const fulfillmentChecks = new Set<string>();

export const fulfillMomoTransaction = async ({ transactionId, transactions, operations, onCompleted }: {
  transactionId: string;
  transactions: MomoTransactionAccess;
  operations: MomoFulfillmentOperations;
  onCompleted: (transaction: Readonly<TransactionDetails>) => void;
}) => {
  const transaction = transactions.findById(transactionId);
  if (!transaction || transaction.id !== transactionId || transaction.direction !== 'RWF_TO_SATS'
    || transaction.status !== 'PENDING' || fulfillmentChecks.has(transactionId)) return;
  fulfillmentChecks.add(transactionId);
  let phase = AppPhase.PAYING_INVOICE;
  const target = () => {
    const saved = transactions.findById(transactionId);
    return saved?.id === transactionId && saved.direction === 'RWF_TO_SATS' && saved.status === 'PENDING'
      && saved.invoice === transaction.invoice && saved.mintQuoteId === transaction.mintQuoteId ? saved : undefined;
  };
  const current = () => target()?.currentPhase === phase;

  try {
    transactions.updateById(transactionId, { currentPhase: phase });
    if (!current()) return;
    const { invoice, mintQuoteId } = transaction;
    if (!mintQuoteId) throw new Error('The saved mint quote is missing. Contact support before retrying.');

    // Recovery checks the exact quote before asking the gateway to pay again.
    const existing = await operations.checkMintStatus(mintQuoteId);
    if (!current()) return;
    if (existing !== 'Success') {
      if (!invoice) throw new Error('The saved invoice is missing. Contact support before retrying.');
      const { success, message } = await operations.payInvoice(invoice);
      if (!current()) return;
      if (!success) throw new Error(message || 'Gateway failed to pay the Lightning invoice.');
    }

    transactions.updateById(transactionId, { currentPhase: AppPhase.FULFILLING });
    phase = AppPhase.FULFILLING;
    if (!current()) return;
    let mintSuccess = existing === 'Success';
    let mintErrMessage = '';
    const mintDeadline = operations.now() + 90000;
    for (let attempt = 0; attempt < 20 && !mintSuccess && operations.now() < mintDeadline; attempt++) {
      try {
        await operations.wait(2000);
        if (!current()) return;
        const status = await operations.checkMintStatus(mintQuoteId);
        if (!current()) return;
        if (status === 'Success') {
          mintSuccess = true;
          break;
        }
        mintErrMessage = `Status returned: ${status}`;
      } catch (error) {
        if (!current()) return;
        console.warn(`Mint attempt ${attempt + 1} failed:`, error);
        mintErrMessage = String(error);
      }
    }
    if (!mintSuccess) throw new Error(`Payment succeeded but failed to mint eCash. Please retry from History. Error: ${mintErrMessage}`);
    if (!current()) return;
    transactions.updateById(transactionId, {
      fulfillmentStep: FulfillmentStep.COMPLETED,
      status: 'COMPLETED',
      timestamp: operations.now(),
      currentPhase: AppPhase.READY_TO_CLAIM,
    });
    onCompleted(transaction);
  } catch (error) {
    console.error('Fulfillment error:', error);
    const saved = target();
    if (!saved || (saved.currentPhase !== AppPhase.PAYING_INVOICE && saved.currentPhase !== AppPhase.FULFILLING)) return;
    const message = error instanceof Error ? error.message : undefined;
    transactions.setErrorFor(transactionId, message || 'Failed to fulfill order. Please try again.');
    transactions.updateById(transactionId, { currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage: message || MOMO_RECOVERY_MESSAGE });
  } finally {
    fulfillmentChecks.delete(transactionId);
  }
};
