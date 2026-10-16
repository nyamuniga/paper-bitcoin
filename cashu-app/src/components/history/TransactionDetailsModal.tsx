import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowDownLeft, ArrowUpRight, FileText, CheckCircle, AlertCircle, XCircle, Copy, Check } from 'lucide-react';
import { Transaction } from './TransactionCard';
import { toast } from 'react-hot-toast';
import { SafeQRCode } from '../shared/SafeQRCode';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import { useBottomSheet } from '../../hooks/useBottomSheet';

interface TransactionDetailsModalProps {
  tx: Transaction;
  onClose: () => void;
  onRecover?: () => void;
  onCheckClaimed?: () => void;
  onRetryReceiveEcash?: () => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ tx, onClose, onRecover, onCheckClaimed, onRetryReceiveEcash }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });
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
    if (tx.momo_direction === 'RWF_TO_SATS') return 'Receive RWF';
    if (tx.momo_direction === 'SATS_TO_RWF') return 'Send RWF';
    if (isMint) return 'Lightning Deposit';
    if (isReceiveEcash) return 'Received eCash';
    if (isReceiveLightning) return 'Lightning Deposit';
    if (isIssue) return 'Exported Note';
    if (isRedeem) return 'Redeemed Note';
    if (isSend) return 'Sent eCash';
    return isMelt ? 'Lightning Payment' : 'Transaction';
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

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="bg-surface-container-high/95 backdrop-blur-xl rounded-t-[2rem] sm:rounded-3xl w-full max-w-md border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-0"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Drag Handle */}
        <div 
          {...dragHandleProps}
          className="w-full flex justify-center pt-3 pb-1 relative z-10 cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full"></div>
        </div>
        
        {/* Header */}
        <div 
          {...dragHandleProps}
          className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/10 relative z-10 cursor-grab active:cursor-grabbing"
        >
          <h2 className="text-headline-sm font-headline-sm text-on-surface">Transaction Details</h2>
          <button 
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          {/* Main info */}
          <div className="flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border mb-3 ${
              isMint || isRedeem || isReceive ? 'bg-[#0e291d] border-[#1c442f] text-[#34d399]' : 'bg-[#10241b] border-[#1b3829] text-[#627d70]'
            }`}>
              {isMint || isRedeem || isReceive ? <ArrowDownLeft className="w-8 h-8 stroke-[2.25]" /> :
               isIssue ? <FileText className="w-8 h-8 stroke-[2]" /> : 
               <ArrowUpRight className="w-8 h-8 stroke-[2.25]" />}
            </div>
            <span className="text-body-sm font-body-sm font-medium text-on-surface-variant tracking-wide">{getTxLabel()}</span>
            <p className="text-headline-md font-headline-md font-bold mt-1 text-primary">
              {isMint || isRedeem || isReceive ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
            </p>
            {tx.fee > 0 && <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">Fee: ₿{tx.fee.toLocaleString()}</p>}
          </div>

          <div className="divider-dashed my-1 border-outline-variant/20"></div>

          {/* Details list */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-label-caps font-label-caps text-on-surface-variant">STATUS</span>
              <div className={`flex items-center gap-1.5 text-body-md font-body-md font-semibold ${
                tx.status === 'Pending' ? 'text-primary' :
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
              <span className="font-mono text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/10 truncate select-all text-center">
                {tx.id}
              </span>
            </div>

            {quoteId && (
              <div className="flex flex-col gap-1.5">
                <span className="text-label-caps font-label-caps text-on-surface-variant">QUOTE ID</span>
                <span className="font-mono text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/10 truncate select-all text-center">
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
                className="mt-2 w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                {isReceiveEcash ? 'Check Status & Claim' : 'Check Status & Recover'}
              </button>
            )}

            {tx.status !== 'Pending' && (isSend || isIssue) && onCheckClaimed && (
              <button
                onClick={onCheckClaimed}
                className="mt-2 w-full py-2.5 bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-xl font-bold text-body-md transition-colors border border-outline-variant/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Check if Claimed
              </button>
            )}

            {tx.status === 'Failed' && isReceiveEcash && onRetryReceiveEcash && (
              <button
                onClick={onRetryReceiveEcash}
                className="mt-2 w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[2.25]" />
                Retry Claim
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
                  <div className="bg-white p-4 rounded-xl shadow-lg relative min-w-[212px] min-h-[212px] flex items-center justify-center">
                    <SafeQRCode value={currentFrame || (tokenString && tokenString.length < 1500 ? tokenString : '')} size={180} />
                    {isAnimated && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded font-mono">
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
                    <p className="text-xs font-mono text-on-surface-variant break-all line-clamp-3 select-all">{tokenString}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary/15 text-primary font-bold text-body-md hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
                  >
                    {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Token</>}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
