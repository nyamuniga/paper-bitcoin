import { Download, FileText, ArrowDownLeft, ArrowUpRight, Clock, X } from 'lucide-react';

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
  onRetryMint: (txId: string) => void;
  onCheckMelt: (txId: string) => void;
  onCheckIssue: (txId: string) => void;
  onDownloadNote: (txId: string, amount: number, serial?: string) => void;
  onClick?: () => void;
}

export const TransactionCard = ({ tx, onRetryMint, onCheckMelt, onCheckIssue, onDownloadNote, onClick }: TransactionCardProps) => {
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;
  const isSend = 'Send' in tx.tx_type;
  const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
  const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;
  const isReceive = isReceiveEcash || isReceiveLightning;
  const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : '');

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
    if (isIssue) return 'Issued Note';
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
        icon: <FileText className="w-4 h-4 stroke-[2]" />
      };
    }
    return {
      bg: 'bg-[#10241b] border-[#1b3829] text-[#627d70]',
      icon: <ArrowUpRight className="w-4 h-4 stroke-[2.25]" />
    };
  };

  const iconInfo = getIconInfo();

  const hasCardActions = 
    (isIssue && tx.status === 'Success') ||
    tx.status === 'Pending' ||
    (tx.status === 'Failed' && isReceiveEcash) ||
    tx.status === 'FailedMintError';

  return (
    <div 
      onClick={onClick}
      className={`obsidian-card rounded-2xl p-5 border group ${isInflow && tx.status === 'Success' ? 'border-primary/20' : 'border-outline-variant'} ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
    >
      {isInflow && tx.status === 'Success' && (
        <>
          <div className="absolute inset-0 bg-[#0e2e20]/15 mix-blend-screen pointer-events-none"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        </>
      )}
      <div className="noise-overlay"></div>
      <div className="relative z-10">
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 ${iconInfo.bg}`}>
              {iconInfo.icon}
            </div>
            <div className="min-w-0">
              <h3 className="font-display-hero text-body-md font-semibold text-on-surface truncate">
                {getTxTitle()}
              </h3>
              <p className="text-[12px] text-on-surface-variant font-sans mt-0.5">
                {formatTimeAgo(tx.timestamp)}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-mono text-body-md block text-white font-bold">
              {isInflow ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
            </span>
          </div>
        </div>

        {hasCardActions && (
          <>
            <div className="divider-dashed my-3 border-outline-variant/20"></div>

            <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-3 text-label-caps font-label-caps">
              {isIssue && tx.status === 'Success' && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onDownloadNote(tx.id, tx.amount, tx.tx_type?.Issue?.note?.serial); 
                  }} 
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-colors border border-outline-variant/30 text-label-caps font-label-caps cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download SVG / PDF
                </button>
              )}

              {tx.status === 'Pending' && (
                <div className="flex gap-2 w-full md:w-auto">
                  {isMint ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRetryMint(tx.id); }} 
                      className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors border border-teal-500/30 text-label-caps font-label-caps cursor-pointer"
                    >
                      Retry Mint
                    </button>
                  ) : isIssue ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCheckIssue(tx.id); }} 
                      className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps cursor-pointer"
                    >
                      Check Status & Resume
                    </button>
                  ) : isReceiveEcash ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} 
                      className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps cursor-pointer"
                    >
                      Check Status & Claim
                    </button>
                  ) : isRedeem ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} 
                      className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps cursor-pointer"
                    >
                      Check Status & Recover
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} 
                      className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps cursor-pointer"
                    >
                      Check Status & Refund
                    </button>
                  )}
                </div>
              )}

              {tx.status === 'Failed' && isReceiveEcash && (
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} 
                    className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps cursor-pointer"
                  >
                    Retry Claim
                  </button>
                </div>
              )}

              {tx.status === 'FailedMintError' && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 w-full md:w-auto">
                  The mint marked your proofs as spent but the invoice was not paid. Contact the mint operator with Quote ID: <span className="font-mono bg-rose-950 px-1 rounded">{quoteId}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
