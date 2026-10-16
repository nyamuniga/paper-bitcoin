import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, FileText, ChevronRight } from 'lucide-react';
import { useHistory } from '../../hooks/useHistory';
import { Transaction } from '../history/TransactionCard';
import { TransactionDetailsModal } from '../history/TransactionDetailsModal';
import { RecentTransactionsSkeleton } from '../shared/Skeleton';

export const RecentTransactions: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, loading, handleCheckIssue, handleRecoverPendingTransaction, handleCheckTokenSpendStatus, handleRetryReceiveEcash } = useHistory();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const recentTxs = transactions.slice(0, 4);



  const handleRowClick = async (tx: Transaction) => {
    if (tx.status === 'Pending' && 'Issue' in tx.tx_type) {
      await handleCheckIssue(tx.id, navigate);
    } else if ('Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      setSelectedTx(tx);
    }
  };

  const getTxLabel = (tx: Transaction) => {
    const isMint = 'Mint' in tx.tx_type;
    const isIssue = 'Issue' in tx.tx_type;
    const isMelt = 'Melt' in tx.tx_type;
    const isRedeem = 'Redeem' in tx.tx_type;
    const isSend = 'Send' in tx.tx_type;
    const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
    const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;


    if (tx.momo_direction === 'RWF_TO_SATS') return 'Received RWF';
    if (tx.momo_direction === 'SATS_TO_RWF') return 'Sent RWF';
    if (isMint) return 'Received Lightning';
    if (isReceiveEcash) return 'Received eCash';
    if (isReceiveLightning) return 'Received Lightning';
    if (isIssue) return 'Issued Note';
    if (isRedeem) return 'Redeemed Note';
    if (isSend) return 'Sent eCash';
    if (isMelt) return 'Sent Lightning';
    return 'Transaction';
  };

  const getTxIcon = (tx: Transaction) => {
    const isReceive = 'Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type || tx.momo_direction === 'RWF_TO_SATS';
    if (isReceive) {
      return <ArrowDownLeft className="w-4 h-4 text-[#34d399] stroke-[2.5]" />;
    }
    if ('Issue' in tx.tx_type) {
      return <FileText className="w-4 h-4 text-[#627d70] stroke-[2]" />;
    }
    return <ArrowUpRight className="w-4 h-4 text-[#627d70] stroke-[2.25]" />;
  };

  const getTxIconBg = (tx: Transaction) => {
    const isInflow = 'Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type || tx.momo_direction === 'RWF_TO_SATS';
    if (isInflow) return 'bg-[#0e291d] border-[#1c442f]';
    return 'bg-[#10241b] border-[#1b3829]';
  };

  const getTxAmountColor = (_tx: Transaction) => {
    return 'text-[#f2a93b] font-bold';
  };

  const getTxSign = (tx: Transaction) => {
    if ('Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type || tx.momo_direction === 'RWF_TO_SATS') return '+';
    if ('Issue' in tx.tx_type) return '';
    return '-';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="bg-[#0c1b14] rounded-[28px] overflow-hidden border border-[#142d20] relative shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-5">
        {/* Header */}
        <div className="flex justify-between items-center pb-3.5 relative z-10 border-b border-[rgba(247,244,235,0.03)]">
          <h2 className="text-[10px] font-mono font-bold text-[#627d70] tracking-widest uppercase">
            RECENT ACTIVITY
          </h2>
          {(loading || recentTxs.length > 0) && (
            <Link
              to="/history"
              className="text-[#f2a93b] font-display-hero text-[11px] font-bold tracking-wider hover:opacity-85 transition-opacity duration-200 inline-flex items-center gap-0.5 shrink-0"
            >
              VIEW ALL
              <ChevronRight size={13} className="stroke-[2.5]" />
            </Link>
          )}
        </div>

        {loading ? (
          <RecentTransactionsSkeleton count={4} />
        ) : transactions.length === 0 ? (
          <div className="text-center text-[#627d70] py-8 text-body-md relative z-10 font-sans">
            No recent activity
          </div>
        ) : (
          <div className="relative z-10 divide-y divide-[rgba(247,244,235,0.03)]">
            {recentTxs.map((tx) => {
              const isClickable = (tx.status === 'Pending' && 'Issue' in tx.tx_type) || 'Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type;
              return (
                <div
                  key={tx.id}
                  onClick={() => handleRowClick(tx)}
                  className={`flex items-center gap-3.5 py-3.5 hover:bg-[#12261d]/50 transition-colors ${isClickable ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border flex-shrink-0 shadow-sm ${getTxIconBg(tx)}`}>
                    {getTxIcon(tx)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display-hero text-[14px] md:text-[15px] font-semibold text-[#f7f4eb] truncate">{getTxLabel(tx)}</p>
                    <p className="text-[12px] text-[#627d70] font-sans mt-0.5 md:hidden">{formatTime(tx.timestamp)}</p>
                    <p className="text-[12px] text-[#627d70] font-sans mt-0.5 hidden md:block">{formatFullDate(tx.timestamp)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`font-mono text-[14px] md:text-[15px] ${getTxAmountColor(tx)}`}>
                      {getTxSign(tx)}₿{tx.amount.toLocaleString()}
                    </span>
                    {tx.status === 'Pending' && (
                      <span className="block mt-1 px-2 py-0.5 rounded-full bg-[#182c1a] border border-[#2a452d] text-[#f2a93b] text-[10px] font-mono font-medium">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
    </section>
  );
};
