import { useState } from 'react';
import { RefreshCw, AlertCircle, ArrowDown } from 'lucide-react';
import { Transaction, TransactionCard } from '../components/history/TransactionCard';
import { PageHeader } from '../components/shared/PageHeader';
import { useHistory } from '../hooks/useHistory';
import { TransactionDetailsModal } from '../components/history/TransactionDetailsModal';
import { useTransactionStore } from '../store/transactionStore';
import { AppPhase } from '../types/momo';

import { useNavigate } from 'react-router-dom';
import { checkOnChainDepositStatus } from '../services/lightningService';
import { toast } from 'react-hot-toast';

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

  const [checkingDepositIds, setCheckingDepositIds] = useState<Record<string, boolean>>({});

  const handleCheckDeposit = async (txId: string, address: string) => {
    if (checkingDepositIds[txId]) return;
    setCheckingDepositIds(prev => ({ ...prev, [txId]: true }));
    try {
      const { settled, amountSats } = await checkOnChainDepositStatus(address);
      if (settled && amountSats) {
        const store = useTransactionStore.getState();
        if (store.activeTransaction?.id === txId) {
          store.updateTransaction({ satsAmount: amountSats });
          store.updateTransactionPhase(AppPhase.DEPOSIT_CONFIRMED);
        } else {
          store.updateHistoryTransaction(txId, { satsAmount: amountSats, currentPhase: AppPhase.DEPOSIT_CONFIRMED });
        }
        toast.success("Deposit confirmed! Minting eCash...");
        // Auto trigger fulfillment since it's confirmed
        import('../services/flowServices').then(({ executeOnChainReceiveFulfillment }) => {
          executeOnChainReceiveFulfillment(txId);
        });
      } else {
        toast.error("Deposit not yet confirmed by network.");
      }
    } catch (e) {
      toast.error("Error checking deposit status");
    } finally {
      setCheckingDepositIds(prev => ({ ...prev, [txId]: false }));
    }
  };

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
        if (isMelt && (t.direction === 'SATS_TO_RWF' || t.direction === 'ONCHAIN_SEND')) {
          const timeDiff = Math.abs((t.timestamp || Date.now()) - tx.timestamp * 1000);
          if (timeDiff < 120000 && Math.abs(t.satsAmount - tx.amount) <= (tx.amount * 0.05 + 100)) {
            return true;
          }
        }
        return false;
      });
      
      if (momoTx) {
        momo_direction = momoTx.direction;
        if (tx.status === 'Pending' && (momoTx.currentPhase === AppPhase.PAYMENT_FAILED || momoTx.currentPhase === AppPhase.PAYOUT_FAILED || momoTx.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED)) {
          status = 'Failed' as const;
        }
      }
    }
    return { ...tx, status, momo_direction };
  });

  const pendingOnchainReceives = [
    ...(activeTransaction ? [activeTransaction] : []),
    ...momoHistory
  ].filter(
    (tx) =>
      tx.direction === 'ONCHAIN_RECEIVE' &&
      (tx.currentPhase === AppPhase.AWAITING_ONCHAIN_DEPOSIT || tx.currentPhase === AppPhase.PAYMENT_FAILED) &&
      tx.onchainAddress
  );

  const uniquePendingReceives = Array.from(new Map(pendingOnchainReceives.map(tx => [tx.id, tx])).values());

  const allListItems = [
    ...uniquePendingReceives.map(tx => ({ type: 'onchain_receive' as const, data: tx })),
    ...mergedTransactions.map(tx => ({ type: 'standard' as const, data: tx }))
  ].sort((a, b) => {
    const timeA = a.type === 'onchain_receive' ? Math.floor((a.data.timestamp || Date.now()) / 1000) : a.data.timestamp;
    const timeB = b.type === 'onchain_receive' ? Math.floor((b.data.timestamp || Date.now()) / 1000) : b.data.timestamp;
    return timeB - timeA;
  });

  const handleCardClick = (tx: Transaction) => {
    if ('Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      setSelectedTx(tx);
    }
  };

  const handleRefundClick = async (txId: string) => {
    const tx = momoHistory.find(t => t.id === txId) || (activeTransaction?.id === txId ? activeTransaction : null);
    if (!tx || !tx.boltzSwapId || !tx.refundPrivateKey || !tx.redeemScript || !tx.timeoutBlockHeight) {
      toast.error("Missing refund details. This swap may be too old to refund programmatically.");
      return;
    }

    const destinationAddress = window.prompt("Enter the external Bitcoin address where you want to receive your refund:");
    if (!destinationAddress) return;

    try {
      toast.loading("Initiating refund...", { id: "refundToast" });
      const { refundSwap } = await import('../services/boltzService');
      const txid = await refundSwap(
        tx.boltzSwapId,
        tx.refundPrivateKey,
        tx.redeemScript,
        tx.timeoutBlockHeight,
        tx.onchainAddress!,
        destinationAddress
      );
      toast.success(`Refund broadcasted! TXID: ${txid}`, { id: "refundToast" });
      
      // Update transaction phase to EXPIRED or create a new phase REFUNDED
      // Let's use EXPIRED for now so it doesn't show as pending anymore
      if (activeTransaction?.id === txId) {
        updateTransactionPhase(AppPhase.EXPIRED);
      } else {
        useTransactionStore.getState().updateHistoryTransaction(txId, { currentPhase: AppPhase.EXPIRED });
      }

    } catch (e: any) {
      toast.error(`Refund failed: ${e.message}`, { id: "refundToast" });
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
      ) : allListItems.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface-container-high rounded-xl border border-outline-variant/10">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-card-gap">
          {allListItems.map((item) => {
            if (item.type === 'standard') {
              const tx = item.data;
              return (
                <TransactionCard 
                  key={tx.id} 
                  tx={tx} 
                  onRetryMint={handleRetryMint}
                  onCheckMelt={handleRecoverPendingTransaction}
                  onCheckIssue={(txId) => handleCheckIssue(txId, navigate)}
                  onDownloadNote={handleDownloadNote}
                  onClick={'Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type ? () => handleCardClick(tx) : undefined}
                />
              );
            } else {
              const tx = item.data;
              const isFailed = tx.currentPhase === AppPhase.PAYMENT_FAILED;
              return (
                <div key={tx.id} className={`obsidian-card rounded-xl p-5 border group relative overflow-hidden ${isFailed ? 'border-error/30 bg-error/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none ${isFailed ? 'bg-error/10' : 'bg-amber-500/10'}`}></div>
                  <div className="noise-overlay opacity-30"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isFailed ? 'bg-error/20 border-error/30' : 'bg-amber-500/20 border-amber-500/30'}`}>
                          <ArrowDown className={`w-4 h-4 ${isFailed ? 'text-error' : 'text-amber-500'}`} />
                        </div>
                        <div>
                          <h3 className={`text-body-md font-body-md font-semibold ${isFailed ? 'text-error' : 'text-amber-500'}`}>
                            {isFailed ? 'Failed On-Chain Receive' : 'Receiving On-Chain'}
                          </h3>
                          <p className="text-label-caps font-label-caps text-on-surface-variant mt-1 max-w-[200px] truncate" title={tx.onchainAddress}>
                            {tx.onchainAddress}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-body-md font-body-md font-bold block ${isFailed ? 'text-error' : 'text-amber-500'}`}>
                          +₿{tx.satsAmount || '???'}
                        </span>
                      </div>
                    </div>
                    <div className={`divider-dashed my-3 ${isFailed ? 'border-error/20' : 'border-amber-500/20'}`}></div>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-label-caps font-label-caps">
                      <div className={`flex items-center gap-2 w-full md:w-auto justify-between md:justify-start ${isFailed ? 'text-error' : 'text-amber-500'}`}>
                        <div className="flex items-center gap-2">
                          {!isFailed && <RefreshCw className={`w-4 h-4 ${checkingDepositIds[tx.id] ? 'animate-spin' : ''}`} />}
                          {isFailed && <AlertCircle className="w-4 h-4" />}
                          <span>{isFailed ? 'Needs Refund' : 'Awaiting Deposit'}</span>
                        </div>
                        <span className="text-on-surface-variant md:hidden">
                          {new Date((tx.timestamp || Date.now())).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        {isFailed ? (
                           <button
                             onClick={() => handleRefundClick(tx.id)}
                             className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-bold bg-error hover:bg-error/90 text-on-primary"
                           >
                             Refund Funds
                           </button>
                        ) : (
                          <button
                            onClick={() => handleCheckDeposit(tx.id, tx.onchainAddress!)}
                            disabled={checkingDepositIds[tx.id]}
                            className={`w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-bold ${checkingDepositIds[tx.id] ? 'bg-amber-500/10 text-amber-500/50 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400 text-on-primary'}`}
                          >
                            {checkingDepositIds[tx.id] ? 'Checking...' : 'Check Status'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          })}
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
