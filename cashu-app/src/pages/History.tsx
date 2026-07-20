import { useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Transaction, TransactionCard } from '../components/history/TransactionCard';
import { PageHeader } from '../components/shared/PageHeader';
import { useHistory } from '../hooks/useHistory';
import { TransactionDetailsModal } from '../components/history/TransactionDetailsModal';
import { useTransactionStore } from '../store/transactionStore';
import { AppPhase } from '../types/momo';

import { useNavigate } from 'react-router-dom';

export default function History() {
  const navigate = useNavigate();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const {
    transactions,
    loading,
    fetchHistory,
    handleRetryMint,
    handleRecoverPendingTransaction,
    handleCheckIssue,
    handleDownloadNote,
    handleCheckTokenSpendStatus
  } = useHistory();

  const momoHistory = useTransactionStore((state) => state.history);
  const activeTransaction = useTransactionStore((state) => state.activeTransaction);
  const updateTransactionPhase = useTransactionStore((state) => state.updateTransactionPhase);

  const handleRetryOnChain = () => {
    if (activeTransaction?.direction === 'ONCHAIN_SEND') {
      updateTransactionPhase(AppPhase.EXECUTING_ONCHAIN_PAYOUT);
    }
  };

  const mergedTransactions = transactions.map(tx => {
    if (tx.status === 'Pending') {
      const momoTx = momoHistory.find(t => t.id === tx.id);
      if (momoTx && (momoTx.currentPhase === AppPhase.PAYMENT_FAILED || momoTx.currentPhase === AppPhase.PAYOUT_FAILED)) {
        return { ...tx, status: 'Failed' as const };
      }
    }
    return tx;
  });

  const handleCardClick = (tx: Transaction) => {
    if ('Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      setSelectedTx(tx);
    }
  };

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader 
        title="Transaction History" 
        subtitle="Track your past and pending payments."
        rightAction={
          <button
            onClick={fetchHistory}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-bright transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        }
      />

      {activeTransaction?.direction === 'ONCHAIN_SEND' && activeTransaction.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            <div>
              <h4 className="text-body-lg font-semibold text-rose-500">On-Chain Payout Failed</h4>
              <p className="text-body-sm text-on-surface-variant">
                Your Ecash was melted successfully, but the final on-chain payout failed. Click Retry to complete it.
              </p>
            </div>
          </div>
          <button
            onClick={handleRetryOnChain}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 rounded-lg font-label-lg transition-colors"
          >
            Retry Payout
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">Loading...</div>
      ) : mergedTransactions.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface-container-high rounded-xl border border-outline-variant/10">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-card-gap">
          {mergedTransactions.map((tx) => (
            <TransactionCard 
              key={tx.id} 
              tx={tx} 
              onRetryMint={handleRetryMint}
              onCheckMelt={handleRecoverPendingTransaction}
              onCheckIssue={(txId) => handleCheckIssue(txId, navigate)}
              onDownloadNote={handleDownloadNote}
              onClick={'Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type ? () => handleCardClick(tx) : undefined}
            />
          ))}
        </div>
      )}

      {selectedTx && (
        <TransactionDetailsModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onRecover={() => handleRecoverPendingTransaction(selectedTx.id)}
          onCheckClaimed={() => handleCheckTokenSpendStatus(selectedTx.id)}
        />
      )}
    </main>
  );
}
