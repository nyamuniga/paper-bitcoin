import { Banknote, ArrowDownLeft, ArrowUpRight, Clock, X } from 'lucide-react';

export interface Transaction {
  id: string;
  tx_type: any;
  amount: number;
  fee: number;
  status: 'Pending' | 'Success' | 'Failed' | 'FailedMintError';
  timestamp: number;
  mint_url: string;
  momo_direction?: string;
}

interface TransactionCardProps {
  tx: Transaction;
  onClick?: () => void;
}

export const TransactionCard = ({ tx, onClick }: TransactionCardProps) => {
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;
  const isSend = 'Send' in tx.tx_type;
  const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
  const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;
  const isReceive = isReceiveEcash || isReceiveLightning;

  const isInflow = isMint || isRedeem || isReceive || tx.momo_direction === 'RWF_TO_SATS';

  const formatTimeAgo = (timestamp: number) => {
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

  const getTxTitle = () => {
    if (tx.momo_direction === 'RWF_TO_SATS') return 'MoMo Top Up';
    if (tx.momo_direction === 'SATS_TO_RWF') return 'MoMo Cash Out';
    if (isMint) return 'Received Lightning';
    if (isReceiveEcash) return 'Received eCash';
    if (isReceiveLightning) return 'Received Lightning';
    if (isIssue) return 'Exported Note';
    if (isRedeem) return 'Redeemed Note';
    if (isSend) return 'Sent eCash';
    if (isMelt) return 'Sent Lightning';
    return 'Transaction';
  };

  const getIconInfo = () => {
    if (tx.status === 'Pending') {
      return {
        bg: 'bg-[#f2a93b]/10 border-[#f2a93b]/20 text-[#f2a93b]',
        icon: <Clock className="w-4 h-4 stroke-[2.25]" />
      };
    }
    if (tx.status === 'Failed' || tx.status === 'FailedMintError') {
      return {
        bg: 'bg-[#f87171]/10 border-[#f87171]/20 text-[#f87171]',
        icon: <X className="w-4 h-4 stroke-[2.5]" />
      };
    }
    if (isInflow) {
      return {
        bg: 'bg-[#0e291d] border-[#1c442f] text-[#34d399]',
        icon: <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
      };
    }
    if (isIssue) {
      return {
        bg: 'bg-[#10241b] border-[#1b3829] text-[#627d70]',
        icon: <Banknote className="w-4 h-4 stroke-[2]" />
      };
    }
    return {
      bg: 'bg-[#10241b] border-[#1b3829] text-[#627d70]',
      icon: <ArrowUpRight className="w-4 h-4 stroke-[2.25]" />
    };
  };

  const iconInfo = getIconInfo();

  const getAmountColor = () => {
    if (tx.status === 'Failed' || tx.status === 'FailedMintError') {
      return 'text-on-surface-variant/70 line-through decoration-rose-400/50';
    }
    if (tx.status === 'Pending') {
      return 'text-amber-400';
    }
    if (isInflow) {
      return 'text-[#34d399]';
    }
    return 'text-white';
  };

  return (
    <div 
      onClick={onClick}
      className={`obsidian-card rounded-2xl p-4 sm:p-5 border group ${isInflow && tx.status === 'Success' ? 'border-primary/20' : 'border-outline-variant'} hover:border-outline-variant/60 hover:bg-surface-container-high/40 active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden`}
    >
      {isInflow && tx.status === 'Success' && (
        <>
          <div className="absolute inset-0 bg-[#0e2e20]/15 mix-blend-screen pointer-events-none"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        </>
      )}
      <div className="noise-overlay"></div>
      <div className="relative z-10 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 transition-transform group-hover:scale-105 ${iconInfo.bg}`}>
            {iconInfo.icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-display-hero text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
              {getTxTitle()}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-[12px] font-sans text-on-surface-variant">
              {tx.status === 'Pending' && (
                <span className="text-amber-400 font-medium">Pending ·</span>
              )}
              {tx.status === 'Failed' && (
                <span className="text-rose-400 font-medium">Failed ·</span>
              )}
              {tx.status === 'FailedMintError' && (
                <span className="text-rose-400 font-medium">Mint Error ·</span>
              )}
              <span>{formatTimeAgo(tx.timestamp)}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className={`font-mono text-body-md block font-bold ${getAmountColor()}`}>
            {isInflow ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
          </span>
          {tx.fee > 0 && (
            <span className="text-[10px] font-mono text-on-surface-variant/60 block mt-0.5">
              fee: ₿{tx.fee}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
