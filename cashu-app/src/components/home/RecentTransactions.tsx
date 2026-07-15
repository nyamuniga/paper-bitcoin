import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { ArrowDown, ArrowUp, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Transaction } from '../history/TransactionCard';
import { TransactionDetailsModal } from '../history/TransactionDetailsModal';
import { useWalletStore } from '../../store/wallet';

export const RecentTransactions: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const lastUpdate = useWalletStore((s) => s.lastUpdate);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const txs = await invoke<Transaction[]>('get_transactions');
        setTransactions(txs.slice(0, 3));
      } catch (e) {
        console.error('Failed to load recent transactions', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRecent();
  }, [lastUpdate]);

  const handleRowClick = async (tx: Transaction) => {
    if (tx.status === 'Pending' && 'Issue' in tx.tx_type) {
      toast.loading('Loading invoice...', { id: tx.id });
      try {
        const pendingIssue = await invoke('get_pending_issue', { txId: tx.id });
        toast.dismiss(tx.id);
        navigate('/issue', { state: { pendingIssue } });
      } catch (e: any) {
        toast.error(`Error: ${e}`, { id: tx.id });
      }
    } else if ('Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      setSelectedTx(tx);
    }
  };

  const getTxLabel = (tx: Transaction) => {
    if ('Mint' in tx.tx_type) return 'Received';
    if ('ReceiveEcash' in tx.tx_type) return 'Received Ecash';
    if ('ReceiveLightning' in tx.tx_type) return 'Received Lightning';
    if ('Issue' in tx.tx_type) return 'Issued Note';
    if ('Redeem' in tx.tx_type) return 'Redeemed';
    if ('Send' in tx.tx_type) return 'Sent Ecash';
    if ('Melt' in tx.tx_type) return 'Sent';
    return 'Transaction';
  };

  const getTxIcon = (tx: Transaction) => {
    if ('Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      return <ArrowDown className="text-emerald-400 w-4 h-4" />;
    }
    if ('Send' in tx.tx_type) {
      return <ArrowUp className="text-tertiary w-4 h-4" />;
    }
    if ('Issue' in tx.tx_type) {
      return <FileText className="text-primary w-4 h-4" />;
    }
    return <ArrowUp className="text-error w-4 h-4" />;
  };

  const getTxIconBg = (tx: Transaction) => {
    if ('Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) {
      return 'bg-emerald-900/30 border-emerald-500/30';
    }
    if ('Send' in tx.tx_type) {
      return 'bg-tertiary/20 border-tertiary/20';
    }
    if ('Issue' in tx.tx_type) {
      return 'bg-primary-container/20 border-primary/20';
    }
    return 'bg-error-container/20 border-error/20';
  };

  const getTxAmountColor = (tx: Transaction) => {
    if ('Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) return 'text-emerald-400';
    if ('Issue' in tx.tx_type) return 'text-primary';
    if ('Send' in tx.tx_type) return 'text-tertiary';
    return 'text-on-surface';
  };

  const getTxSign = (tx: Transaction) => {
    if ('Mint' in tx.tx_type || 'Redeem' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type) return '+';
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
      <div className="flex justify-between items-center">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant tracking-widest">RECENT ACTIVITY</h2>
        {loading || transactions.length > 0 && (
          <Link to="/history" className="text-label-caps font-label-caps text-primary hover:opacity-80 transition-opacity flex items-center gap-1">
            VIEW ALL
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="text-center text-on-surface-variant py-6 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">
          Loading transactions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center text-on-surface-variant py-6 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">
          No recent activity
        </div>
      ) : (
        <div className="bg-surface-container-high rounded-2xl overflow-hidden border border-outline-variant/10 relative">
          <div className="absolute inset-0 texture-overlay opacity-20"></div>
          {transactions.map((tx, index) => {
            const isClickable = (tx.status === 'Pending' && 'Issue' in tx.tx_type) || 'Melt' in tx.tx_type || 'Redeem' in tx.tx_type || 'Send' in tx.tx_type || 'ReceiveEcash' in tx.tx_type || 'ReceiveLightning' in tx.tx_type;
            return (
            <div
              key={tx.id}
              onClick={() => handleRowClick(tx)}
              className={`flex items-center gap-3 p-3.5 md:p-4 relative z-10 hover:bg-surface-container-highest/50 transition-colors ${index < transactions.length - 1 ? 'border-b border-outline-variant/10' : ''
                } ${isClickable ? 'cursor-pointer active:scale-[0.99]' : ''}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border flex-shrink-0 ${getTxIconBg(tx)}`}>
                {getTxIcon(tx)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-md font-body-md font-medium text-on-surface text-[14px]">{getTxLabel(tx)}</p>
                {/* Mobile: relative time / Desktop: full date */}
                <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] md:hidden">{formatTime(tx.timestamp)}</p>
                <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] hidden md:block">{formatFullDate(tx.timestamp)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-body-md font-body-md font-semibold ${getTxAmountColor(tx)} text-[14px]`}>
                  {getTxSign(tx)}₿{tx.amount}
                </span>
                {tx.status === 'Pending' && (
                  <span className="block text-[10px] text-amber-500 font-label-caps">Pending</span>
                )}
              </div>
            </div>
          )})}
        </div>
      )}

      {selectedTx && (
        <TransactionDetailsModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onCheckStatus={async () => {
            try {
              toast.loading('Checking token status...', { id: selectedTx.id });
              const status = await invoke<string>('check_transaction_status', { txId: selectedTx.id });
              if (status === 'Spent') {
                toast.success('Tokens have been successfully claimed!', { id: selectedTx.id });
              } else if (status === 'Partially Spent') {
                toast.success('Some tokens were claimed, but some remain unspent.', { id: selectedTx.id });
              } else {
                toast.error('Tokens are still unspent.', { id: selectedTx.id });
              }
            } catch (e: any) {
              toast.error(`Error checking status: ${e}`, { id: selectedTx.id });
            }
          }}
        />
      )}
    </section>
  );
};
