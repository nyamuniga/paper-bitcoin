import React from 'react';
import { X, ArrowDown, ArrowUp, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Transaction } from './TransactionCard';

interface TransactionDetailsModalProps {
  tx: Transaction;
  onClose: () => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ tx, onClose }) => {
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;

  const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : (isIssue ? tx.tx_type.Issue.quote_id : ''));
  
  const getTxLabel = () => {
    if (isMint) return 'Received / Mint';
    if (isIssue) return 'Issued Note';
    if (isRedeem) return 'Redeemed Note';
    return 'Sent / Melt';
  };

  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString([], {
      dateStyle: 'long',
      timeStyle: 'medium'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">Transaction Details</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10">
          {/* Main info */}
          <div className="flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border mb-4 ${
              isMint ? 'bg-emerald-900/30 border-emerald-500/30' : 
              isIssue ? 'bg-primary-container/20 border-primary/20' : 
              isRedeem ? 'bg-amber-500/20 border-amber-500/20' :
              'bg-error-container/20 border-error/20'
            }`}>
              {isMint ? <ArrowDown className="text-emerald-400 w-8 h-8" /> : 
               isIssue ? <FileText className="text-primary w-8 h-8" /> : 
               isRedeem ? <ArrowDown className="text-amber-400 w-8 h-8" /> :
               <ArrowUp className="text-error w-8 h-8" />}
            </div>
            <h3 className="text-headline-md font-headline-md text-on-surface">{getTxLabel()}</h3>
            <p className={`text-display-sm font-display-sm mt-2 ${isMint || isRedeem ? 'text-emerald-400' : isIssue ? 'text-primary' : 'text-on-surface'}`}>
              {isMint || isRedeem ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
            </p>
            {tx.fee > 0 && <p className="text-label-caps font-label-caps text-on-surface-variant mt-1">Fee: ₿{tx.fee.toLocaleString()}</p>}
          </div>

          <div className="divider-dashed my-1 border-outline-variant/20"></div>

          {/* Details list */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-label-caps font-label-caps text-on-surface-variant">STATUS</span>
              <div className={`flex items-center gap-1.5 text-body-md font-body-md font-semibold ${
                tx.status === 'Pending' ? 'text-amber-500' :
                tx.status === 'Success' ? 'text-emerald-400' :
                tx.status === 'FailedMintError' ? 'text-rose-500' :
                'text-on-surface-variant'
              }`}>
                {tx.status === 'Pending' && <AlertCircle className="w-4 h-4" />}
                {tx.status === 'Success' && <CheckCircle className="w-4 h-4" />}
                {tx.status === 'Failed' && <XCircle className="w-4 h-4" />}
                {tx.status === 'FailedMintError' && <AlertCircle className="w-4 h-4" />}
                <span>{tx.status === 'FailedMintError' ? 'Mint Error' : tx.status}</span>
              </div>
            </div>

            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">DATE</span>
              <span className="text-body-md font-body-md text-on-surface text-right">{formatFullDate(tx.timestamp)}</span>
            </div>

            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">MINT URL</span>
              <span className="text-body-md font-body-md text-on-surface truncate text-right">{tx.mint_url || 'Local Wallet'}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-label-caps font-label-caps text-on-surface-variant">TRANSACTION ID</span>
              <span className="text-body-md font-body-md text-on-surface bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10 truncate font-mono text-xs select-all text-center">
                {tx.id}
              </span>
            </div>

            {quoteId && (
              <div className="flex flex-col gap-1.5">
                <span className="text-label-caps font-label-caps text-on-surface-variant">QUOTE ID</span>
                <span className="text-body-md font-body-md text-on-surface bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10 truncate font-mono text-xs select-all text-center">
                  {quoteId}
                </span>
              </div>
            )}
            
            {isMelt && (
              <div className="flex justify-between items-center gap-4 mt-1">
                <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">PROOFS MELTED</span>
                <span className="text-body-md font-body-md text-on-surface text-right">{tx.tx_type.Melt.proofs?.length || 0}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
