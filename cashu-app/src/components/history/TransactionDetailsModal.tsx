import React, { useState } from 'react';
import { X, ArrowDown, ArrowUp, FileText, CheckCircle, AlertCircle, XCircle, Copy, Check } from 'lucide-react';
import { Transaction } from './TransactionCard';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { useUrEncoder } from '../../hooks/useUrEncoder';

interface TransactionDetailsModalProps {
  tx: Transaction;
  onClose: () => void;
  onRecover?: () => void;
  onCheckClaimed?: () => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ tx, onClose, onRecover, onCheckClaimed }) => {
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;
  const isSend = 'Send' in tx.tx_type;
  const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
  const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;
  const isReceive = isReceiveEcash || isReceiveLightning;

  const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : (isIssue ? tx.tx_type.Issue.quote_id : (isReceiveLightning ? tx.tx_type.ReceiveLightning.quote_id : '')));
  const tokenString = isSend ? tx.tx_type.Send.token_string : (isReceiveEcash ? tx.tx_type.ReceiveEcash.token_string : null);

  const [copied, setCopied] = useState(false);
  
  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(tokenString, 150, 400);

  const getTxLabel = () => {
    if (isMint) return 'Received / Mint';
    if (isReceiveEcash) return 'Received Ecash';
    if (isReceiveLightning) return 'Received Lightning';
    if (isIssue) return 'Issued Note';
    if (isRedeem) return 'Redeemed Note';
    if (isSend) return 'Sent Ecash';
    return 'Sent / Melt';
  };

  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString([], {
      dateStyle: 'long',
      timeStyle: 'medium'
    });
  };

  const handleCopy = async () => {
    if (!tokenString) return;
    try {
      await navigator.clipboard.writeText(tokenString);
      setCopied(true);
      toast.success('Token copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
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
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          {/* Main info */}
          <div className="flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border mb-4 ${
              isMint || isReceive ? 'bg-emerald-900/30 border-emerald-500/30' : 
              isIssue ? 'bg-primary-container/20 border-primary/20' : 
              isRedeem ? 'bg-amber-500/20 border-amber-500/20' :
              isSend ? 'bg-tertiary/20 border-tertiary/20' :
              'bg-error-container/20 border-error/20'
            }`}>
              {isMint || isRedeem || isReceive ? <ArrowDown className="text-emerald-400 w-8 h-8" /> :
               isIssue ? <FileText className="text-primary w-8 h-8" /> : 
               isSend ? <ArrowUp className="text-tertiary w-8 h-8" /> :
               <ArrowUp className="text-error w-8 h-8" />}
            </div>
            <h3 className="text-headline-md font-headline-md text-on-surface">{getTxLabel()}</h3>
            <p className={`text-display-sm font-display-sm mt-2 ${isMint || isRedeem || isReceive ? 'text-emerald-400' : isIssue ? 'text-primary' : isSend ? 'text-tertiary' : 'text-on-surface'}`}>
              {isMint || isRedeem || isReceive ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
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
            
            {tx.status === 'Pending' && onRecover && (
              <button
                onClick={onRecover}
                className="mt-2 w-full py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded-xl font-label-lg transition-colors border border-amber-500/30 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Check Status & Recover
              </button>
            )}

            {tx.status !== 'Pending' && (isSend || isIssue) && onCheckClaimed && (
              <button
                onClick={onCheckClaimed}
                className="mt-2 w-full py-2.5 bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-xl font-label-lg transition-colors border border-outline-variant/20 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Check if Claimed
              </button>
            )}
          </div>

          {/* Token Display for Send Ecash */}
          {isSend && tokenString && (
            <>
              <div className="divider-dashed my-1 border-outline-variant/20"></div>
              
              <div className="flex flex-col items-center gap-5">
                <span className="text-label-caps font-label-caps text-on-surface-variant self-start">TOKEN DATA</span>
                
                {/* QR Code */}
                <div className="relative">
                  <div className="bg-white p-4 rounded-xl shadow-lg relative">
                    <QRCode value={currentFrame || tokenString || ''} size={180} />
                    {isAnimated && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-label-caps">
                        {currentFrameIndex + 1}/{totalFrames}
                      </div>
                    )}
                  </div>
                  {/* Pulsing glow */}
                  <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
                </div>

                {/* Token string */}
                <div className="w-full flex flex-col gap-2">
                  <div 
                    onClick={handleCopy}
                    className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/30 transition-colors"
                  >
                    <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{tokenString}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
                  >
                    {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Token</>}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
