import type { WalletTransactionSummary } from '../types/wallet.ts';
import type { Scheduler } from './scheduler.ts';

export interface ReconciliationTransaction {
  id: string;
  status: WalletTransactionSummary['status'];
  mint_url?: string;
  timestamp?: number;
  tx_type: Readonly<Record<string, unknown>>;
}

const INACTIVE_MOMO_PHASES = new Set([
  'IDLE',
  'PAYMENT_FAILED',
  'PAYOUT_COMPLETE',
  'PAYOUT_FAILED',
  'SATS_SENT',
  'EXPIRED',
  'RECOVERY_REQUIRED',
  'RETRYABLE_ERROR',
]);

/** Only suppress Cashu polling while a foreground MoMo transfer is actively in flight. */
export function activeInFlightQuoteId(
  activeTransaction?: { mintQuoteId?: string | null; currentPhase?: string } | null,
): string | null {
  const quoteId = activeTransaction?.mintQuoteId;
  if (!quoteId) return null;
  if (activeTransaction.currentPhase && INACTIVE_MOMO_PHASES.has(activeTransaction.currentPhase)) {
    return null;
  }
  return quoteId;
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

const polledTypes = ['ReceiveLightning', 'ReceiveOnchain', 'Mint', 'Melt', 'Send', 'SendOnchain'];
const SCAN_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 60000;

function basePollIntervalMs(transaction: ReconciliationTransaction, nowMs: number): number {
  if (typeof transaction.timestamp !== 'number' || transaction.timestamp <= 0) {
    return SCAN_INTERVAL_MS;
  }
  const ageSec = Math.max(0, Math.floor(nowMs / 1000) - transaction.timestamp);
  if (ageSec < 120) return SCAN_INTERVAL_MS;
  if (ageSec < 900) return 10000;
  return 30000;
}

function nextPollDelayMs(
  transaction: ReconciliationTransaction,
  nowMs: number,
  consecutiveFailures: number,
): number {
  const base = basePollIntervalMs(transaction, nowMs);
  if (consecutiveFailures <= 1) return base;
  const multiplier = 2 ** Math.min(consecutiveFailures - 1, 5);
  return Math.min(MAX_BACKOFF_MS, base * multiplier);
}

export function pendingOnchainMint(transactions: readonly ReconciliationTransaction[], activeQuote?: string | null) {
  return transactions.find(transaction => transaction.status === 'Pending' && transaction.id !== activeQuote
    && 'ReceiveOnchain' in transaction.tx_type && transaction.mint_url)?.mint_url;
}

/** One slow native status request must not hold up other receipts or the next scan. */
export function startCashuReconciliation({ getTransactions, activeQuoteId, checkTransaction, requestSpark, scheduler, refreshWallet, reportError, now = Date.now }: {
  getTransactions: () => Promise<readonly ReconciliationTransaction[]>;
  activeQuoteId: () => string | null | undefined;
  checkTransaction: (transaction: ReconciliationTransaction, isCurrent: () => boolean) => ReturnType<ReadStatus>;
  requestSpark: (mint: string) => void;
  scheduler: Scheduler;
  refreshWallet: () => Promise<void>;
  reportError: (error: unknown, transactionId?: string) => void;
  now?: () => number;
}) {
  let stopped = false;
  let cancelTimer: (() => void) | undefined;
  let elapsedMs = 0;
  const inFlight = new Set<string>();
  const nextCheckAt = new Map<string, number>();
  const failures = new Map<string, number>();
  const check = async (transaction: ReconciliationTransaction) => {
    const { id } = transaction;
    if (stopped || inFlight.has(id)) return;
    inFlight.add(id);
    try {
      const status = await checkTransaction(transaction, () => !stopped);
      failures.delete(id);
      if (status !== 'Pending') {
        nextCheckAt.delete(id);
        if (!stopped) await refreshWallet();
      } else {
        nextCheckAt.set(id, elapsedMs + nextPollDelayMs(transaction, now(), 0));
      }
    } catch (error) {
      const count = (failures.get(id) ?? 0) + 1;
      failures.set(id, count);
      nextCheckAt.set(id, elapsedMs + nextPollDelayMs(transaction, now(), count));
      if (!stopped) reportError(error, id);
    } finally {
      inFlight.delete(id);
    }
  };
  const scan = async (isScheduledTick = false) => {
    if (stopped) return;
    if (isScheduledTick) elapsedMs += SCAN_INTERVAL_MS;
    try {
      const transactions = await getTransactions();
      if (stopped) return;
      const ownedQuote = activeQuoteId();
      const pending = transactions.filter(transaction => transaction.status === 'Pending' && transaction.id !== ownedQuote);
      const pendingIds = new Set(pending.map(transaction => transaction.id));
      for (const id of nextCheckAt.keys()) {
        if (!pendingIds.has(id)) {
          nextCheckAt.delete(id);
          failures.delete(id);
        }
      }
      const mint = pendingOnchainMint(pending);
      if (mint) requestSpark(mint);
      for (const transaction of pending) {
        if (!polledTypes.some(type => type in transaction.tx_type)) continue;
        const dueAt = nextCheckAt.get(transaction.id) ?? 0;
        if (elapsedMs >= dueAt) void check(transaction);
      }
    } catch (error) {
      if (!stopped) reportError(error);
    } finally {
      if (!stopped) cancelTimer = scheduler.schedule(() => { void scan(true); }, SCAN_INTERVAL_MS);
    }
  };
  void scan(false);
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
