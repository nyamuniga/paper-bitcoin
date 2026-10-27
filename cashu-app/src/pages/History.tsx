import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Transaction, TransactionCard } from '../components/history/TransactionCard';
import { TransactionCardSkeleton } from '../components/shared/Skeleton';
import { PageHeader } from '../components/shared/PageHeader';
import { useHistory } from '../hooks/useHistory';
import { TransactionDetailsModal } from '../components/history/TransactionDetailsModal';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { AppPhase } from '../types/momo';


import { useNavigate } from 'react-router-dom';

export default function History() {
  const navigate = useNavigate();
  const markHistorySeen = useWalletStore((s) => s.markHistorySeen);

  useEffect(() => {
    markHistorySeen();
  }, [markHistorySeen]);

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
    setSelectedTx(tx);
  };

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader 
        title="History" 
        subtitle="Recent and pending activity"
        rightAction={
          <button
            onClick={() => {
              fetchHistory();
            }}
            disabled={loading}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all active:scale-95 border cursor-pointer ${
              loading
                ? 'bg-[#12261d] text-[#627d70] border-[#1e3c2e] opacity-50 cursor-not-allowed'
                : 'bg-[#0c1b14] hover:bg-[#12261d] text-[#8b9e94] hover:text-[#f7f4eb] border-[#1e3c2e] shadow-sm'
            }`}
          >
            <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <TransactionCardSkeleton key={i} />
          ))}
        </div>
      ) : mergedTransactions.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface-container-high rounded-xl border border-outline-variant/10">
          No transactions yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mergedTransactions.map((tx) => (
            <TransactionCard 
              key={tx.id} 
              tx={tx} 
              onClick={() => handleCardClick(tx)}
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
          onRetryMint={handleRetryMint}
          onCheckIssue={(txId) => handleCheckIssue(txId, navigate)}
          onDownloadNote={handleDownloadNote}
        />
      )}
    </main>
  );
}
