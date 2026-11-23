import type { WalletTransactionSummary } from '../types/wallet.ts';
import type { Scheduler } from './scheduler.ts';

export interface ReconciliationTransaction {
  id: string;
  status: WalletTransactionSummary['status'];
  mint_url?: string;
  tx_type: Readonly<Record<string, unknown>>;
}

type ReadStatus = (transactionId: string) => Promise<WalletTransactionSummary['status']>;
/** Automatic/manual checks and remounts share only outstanding reads, never cached results. */
export function createTransactionStatusReader(readStatus: ReadStatus): ReadStatus {
  const inFlight = new Map<string, ReturnType<ReadStatus>>();
  return id => {
    let request = inFlight.get(id);
    if (!request) {
      request = Promise.resolve().then(() => readStatus(id)).finally(() => { inFlight.delete(id); });
      inFlight.set(id, request);
    }
    return request;
  };
}

const polledTypes = ['ReceiveLightning', 'ReceiveOnchain', 'Melt', 'Send', 'SendOnchain'];

export function pendingOnchainMint(transactions: readonly ReconciliationTransaction[], activeQuote?: string | null) {
  return transactions.find(transaction => transaction.status === 'Pending' && transaction.id !== activeQuote
    && 'ReceiveOnchain' in transaction.tx_type && transaction.mint_url)?.mint_url;
}

/** One slow native status request must not hold up other receipts or the next scan. */
export function startCashuReconciliation({ getTransactions, activeQuoteId, checkTransaction, requestSpark, scheduler, refreshWallet, reportError }: {
  getTransactions: () => Promise<readonly ReconciliationTransaction[]>;
  activeQuoteId: () => string | null | undefined;
  checkTransaction: (transaction: ReconciliationTransaction, isCurrent: () => boolean) => ReturnType<ReadStatus>;
  requestSpark: (mint: string) => void;
  scheduler: Scheduler;
  refreshWallet: () => Promise<void>;
  reportError: (error: unknown, transactionId?: string) => void;
}) {
  let stopped = false;
  let cancelTimer: (() => void) | undefined;
  const inFlight = new Set<string>();
  const check = async (transaction: ReconciliationTransaction) => {
    const { id } = transaction;
    if (stopped || inFlight.has(id)) return;
    inFlight.add(id);
    try {
      const status = await checkTransaction(transaction, () => !stopped);
      if (status !== 'Pending' && !stopped) await refreshWallet();
    } catch (error) {
      if (!stopped) reportError(error, id);
    } finally {
      inFlight.delete(id);
    }
  };
  const scan = async () => {
    if (stopped) return;
    try {
      const transactions = await getTransactions();
      if (stopped) return;
      const ownedQuote = activeQuoteId();
      const pending = transactions.filter(transaction => transaction.status === 'Pending' && transaction.id !== ownedQuote);
      const mint = pendingOnchainMint(pending);
      if (mint) requestSpark(mint);
      for (const transaction of pending) {
        if (polledTypes.some(type => type in transaction.tx_type)) void check(transaction);
      }
    } catch (error) {
      if (!stopped) reportError(error);
    } finally {
      if (!stopped) cancelTimer = scheduler.schedule(scan, 2000);
    }
  };
  void scan();
  return () => {
    if (stopped) return;
    stopped = true;
    cancelTimer?.();
  };
}

/** Only on-chain history actions need Spark reconciliation before the native check. */
export async function checkWalletTransaction(transaction: ReconciliationTransaction, operations: {
  checkStatus: ReadStatus;
  reconcileSpark: (mint?: string) => Promise<boolean>;
  isCurrent?: () => boolean;
}) {
  const ensureCurrent = () => {
    if (operations.isCurrent?.() === false) throw new Error('Transaction status check was cancelled.');
  };
  ensureCurrent();
  if ('ReceiveOnchain' in transaction.tx_type || 'SendOnchain' in transaction.tx_type) {
    await operations.reconcileSpark(transaction.mint_url).catch(() => false);
  }
  ensureCurrent();
  return operations.checkStatus(transaction.id);
}
