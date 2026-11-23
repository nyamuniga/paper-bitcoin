import { invoke } from '@tauri-apps/api/core';
import { useTransactionStore } from '../store/transactionStore';
import type { WalletTransactionSummary } from '../types/wallet';
import { subscribeToSparkEvents, syncAndSweepSpark } from './sparkService';
import { timeoutScheduler } from './scheduler';
import { createSparkReconciler, startSparkReconciliation } from './sparkReconciliation';
import { createTransactionStatusReader, checkWalletTransaction, pendingOnchainMint, startCashuReconciliation } from './walletReconciliation';
import type { ReconciliationTransaction } from './walletReconciliation';

const getTransactions = () => invoke<ReconciliationTransaction[]>('get_transactions');
const checkStatus = createTransactionStatusReader(id =>
  invoke<WalletTransactionSummary['status']>('check_transaction_status', { txId: id })
);
const activeQuoteId = () => useTransactionStore.getState().activeTransaction?.mintQuoteId;
const reconcileSpark = createSparkReconciler(async preferredMint => {
  const mint = preferredMint ?? pendingOnchainMint(await getTransactions(), activeQuoteId());
  return syncAndSweepSpark(mint);
});

export function startWalletReconciliation(refreshWallet: () => Promise<void>) {
  const spark = startSparkReconciliation({
    reconcile: reconcileSpark,
    subscribe: subscribeToSparkEvents,
    scheduler: timeoutScheduler,
    refreshWallet,
    reportError: error => console.error('Failed to reconcile Spark deposits', error),
  });
  const stopCashu = startCashuReconciliation({
    getTransactions,
    activeQuoteId,
    checkTransaction: (transaction, isCurrent) => checkWalletTransaction(transaction, { checkStatus, reconcileSpark, isCurrent }),
    requestSpark: spark.request,
    scheduler: timeoutScheduler,
    refreshWallet,
    reportError: (error, id) => console.error(id ? `Error polling backend tx ${id}` : 'Failed to fetch transactions for polling', error),
  });
  return () => { stopCashu(); spark.stop(); };
}

export async function checkHistoryTransactionStatus(id: string, transaction?: ReconciliationTransaction) {
  const selected = transaction?.id === id ? transaction : (await getTransactions()).find(candidate => candidate.id === id);
  if (!selected) return checkStatus(id);
  return checkWalletTransaction(selected, { checkStatus, reconcileSpark });
}
