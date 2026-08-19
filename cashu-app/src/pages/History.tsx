import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
    handleCheckTokenSpendStatus,
    handleRetryReceiveEcash
  } = useHistory();

  const momoHistory = useTransactionStore((state) => state.history);

  const mergedTransactions = transactions.map(tx => {
    let status = tx.status;
    let momo_direction: string | undefined = undefined;

    const isMint = 'Mint' in tx.tx_type;
    const isMelt = 'Melt' in tx.tx_type;
    const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : undefined);

    if (tx.status === 'Pending' || quoteId || isMelt) {
      const momoTx = momoHistory.find(t => {
        if (t.id === tx.id) return true;
        if (quoteId && t.mintQuoteId === quoteId) return true;
        
        // Strict timestamp window (2 minutes) to prevent false matches with normal lightning payments
        if (isMelt && t.direction === 'SATS_TO_RWF') {
          const timeDiff = Math.abs((t.timestamp || Date.now()) - tx.timestamp * 1000);
          if (timeDiff < 120000 && Math.abs(t.satsAmount - tx.amount) <= (tx.amount * 0.05 + 100)) {
            return true;
          }
        }
        return false;
      });
      
      if (momoTx) {
        momo_direction = momoTx.direction;
        if (tx.status === 'Pending' && (momoTx.currentPhase === AppPhase.PAYMENT_FAILED || momoTx.currentPhase === AppPhase.PAYOUT_FAILED)) {
          status = 'Failed' as const;
        }
      }
    }
    return { ...tx, status, momo_direction };
  });

  const handleCardClick = (tx: Transaction) => {
    if ('Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      setSelectedTx(tx);
    }
  };

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader 
        title="History" 
        subtitle="Recent and pending activity"
        rightAction={
          <button
            onClick={fetchHistory}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-bright transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        }
      />

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
          onRetryReceiveEcash={
            'ReceiveEcash' in selectedTx.tx_type
              ? () => handleRetryReceiveEcash(selectedTx.id, selectedTx.tx_type.ReceiveEcash.token_string)
              : undefined
          }
        />
      )}
    </main>
  );
}
