import { AppPhase } from '../types/momo';
import type { TransactionDetails } from '../types/momo';
import type { Scheduler } from './scheduler';

type StartMomoWork = (transactionId: string, isCurrent: () => boolean) => (() => void) | undefined;

export interface MomoProcessingOperations {
  verifyCashIn: StartMomoWork;
  initiatePayout: StartMomoWork;
  verifyPayout: StartMomoWork;
  payFundingInvoice(): void | Promise<void>;
  refreshWallet(): void | Promise<void>;
}

export const startMomoTransactionProcessing = ({ transactionId, phase, isActive, operations }: {
  transactionId: string;
  phase: AppPhase | undefined;
  isActive: (transactionId: string) => boolean;
  operations: MomoProcessingOperations;
}) => {
  if (!transactionId || !isActive(transactionId)) return;
  let stopped = false;
  let cancelWork: (() => void) | undefined;
  const isCurrent = () => !stopped && isActive(transactionId);

  switch (phase) {
    case AppPhase.PENDING_PAYMENT:
    case AppPhase.VERIFYING_PAYMENT:
      cancelWork = operations.verifyCashIn(transactionId, isCurrent);
      break;
    case AppPhase.INITIATING_PAYOUT:
      cancelWork = operations.initiatePayout(transactionId, isCurrent);
      break;
    case AppPhase.VERIFYING_PAYOUT:
      cancelWork = operations.verifyPayout(transactionId, isCurrent);
      break;
    case AppPhase.AWAITING_INVOICE_PAYMENT:
      void operations.payFundingInvoice();
      break;
    case AppPhase.AWAITING_ASP_BOARDING:
    case AppPhase.READY_TO_CLAIM:
      void operations.refreshWallet();
      break;
  }
  return () => {
    if (stopped) return;
    stopped = true;
    cancelWork?.();
  };
};

const recoverablePhases = new Set([
  AppPhase.RECOVERY_REQUIRED, AppPhase.RETRYABLE_ERROR, AppPhase.PENDING_PAYMENT,
  AppPhase.VERIFYING_PAYMENT, AppPhase.VERIFYING_PAYOUT,
]);

export const startSavedMomoRecovery = ({ getTransactions, recover, scheduler, now, reportError }: {
  getTransactions: () => {
    activeTransaction: Readonly<TransactionDetails> | null;
    history: readonly Readonly<TransactionDetails>[];
  };
  recover: (transactionId: string) => Promise<void>;
  scheduler: Scheduler;
  now: () => number;
  reportError: () => void;
}) => {
  let stopped = false;
  let cancelTimer: (() => void) | undefined;
  const checks = new Map<string, { next: number; attempts: number }>();
  const pollSaved = async () => {
    if (stopped) return;
    const { activeTransaction, history } = getTransactions();
    const currentTime = now();
    const pending = history.filter(transaction =>
      (transaction.direction === 'RWF_TO_SATS' || transaction.direction === 'SATS_TO_RWF')
      && transaction.id !== activeTransaction?.id && transaction.status === 'PENDING'
      && transaction.currentPhase !== undefined && recoverablePhases.has(transaction.currentPhase)
    );
    for (const id of checks.keys()) {
      if (!pending.some(transaction => transaction.id === id)) checks.delete(id);
    }
    const transaction = pending.find(candidate => (checks.get(candidate.id)?.next ?? 0) <= currentTime);
    if (transaction) {
      const attempts = (checks.get(transaction.id)?.attempts ?? 0) + 1;
      checks.set(transaction.id, { attempts, next: currentTime + Math.min(300000, 15000 * 2 ** Math.min(attempts, 5)) });
      try { await recover(transaction.id); }
      catch { reportError(); }
    }
    if (!stopped) cancelTimer = scheduler.schedule(pollSaved, 5000);
  };
  cancelTimer = scheduler.schedule(pollSaved, 5000);
  return () => {
    if (stopped) return;
    stopped = true;
    cancelTimer?.();
  };
};
