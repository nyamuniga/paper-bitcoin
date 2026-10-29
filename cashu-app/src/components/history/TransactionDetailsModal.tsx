import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle, AlertCircle, XCircle, Copy, Check, Clock, Download, ExternalLink } from 'lucide-react';
import { Transaction } from './TransactionCard';
import { toast } from 'react-hot-toast';
import { SafeQRCode } from '../shared/SafeQRCode';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { MintName } from '../shared/MintName';
import { MintIcon } from '../shared/MintIcon';
import { openMempoolTx, openMempoolAddress } from '../../utils/mempool';
import { writeClipboardText } from '../../utils/clipboard';

interface TransactionDetailsModalProps {
  tx: Transaction;
  onClose: () => void;
  onRecover?: () => void;
  onCheckClaimed?: () => void;
  onRetryReceiveEcash?: () => void;
  onRetryMint?: (txId: string) => void;
  onCheckIssue?: (txId: string) => void;
  onDownloadNote?: (txId: string, amount: number, serial?: string) => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ 
  tx, 
  onClose, 
  onRecover, 
  onCheckClaimed, 
  onRetryReceiveEcash,
  onRetryMint,
  onCheckIssue,
  onDownloadNote
}) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;
  const isSend = 'Send' in tx.tx_type;
  const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
  const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;
  const isSendOnchain = 'SendOnchain' in tx.tx_type;
  const isReceiveOnchain = 'ReceiveOnchain' in tx.tx_type;
  const isReceive = isReceiveEcash || isReceiveLightning || isReceiveOnchain;
  const isInflow = isMint || isRedeem || isReceive || tx.momo_direction === 'RWF_TO_SATS';

  const onchainTxid = isSendOnchain
    ? tx.tx_type.SendOnchain.txid
    : isReceiveOnchain
    ? tx.tx_type.ReceiveOnchain.txid
    : null;

  const onchainAddress = isSendOnchain
    ? tx.tx_type.SendOnchain.address
    : isReceiveOnchain
    ? tx.tx_type.ReceiveOnchain.boarding_address
    : null;

  const quoteId = isMint 
    ? tx.tx_type.Mint.quote_id 
    : (isMelt 
      ? tx.tx_type.Melt.quote_id 
      : (isIssue 
        ? tx.tx_type.Issue.quote_id 
        : (isReceiveLightning ? tx.tx_type.ReceiveLightning.quote_id : '')));

  const tokenString = isSend 
    ? tx.tx_type.Send.token_string 
    : (isReceiveEcash ? tx.tx_type.ReceiveEcash.token_string : null);

  const [copied, setCopied] = useState(false);
  
  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(tokenString, 150, 400);

  const getTxLabel = () => {
    if (tx.momo_direction === 'RWF_TO_SATS') return 'MoMo Top Up';
    if (tx.momo_direction === 'SATS_TO_RWF') return 'MoMo Cash Out';
    if (isMint) return 'Lightning Deposit';
    if (isReceiveEcash) return 'Received eCash';
    if (isReceiveLightning) return 'Lightning Deposit';
    if (isReceiveOnchain) return 'Bitcoin Deposit';
    if (isIssue) return 'Exported Note';
    if (isRedeem) return 'Redeemed Note';
    if (isSend) return 'Sent eCash';
    if (isSendOnchain) return 'Bitcoin Payment';
    return isMelt ? 'Lightning Payment' : 'Transaction';
  };

  const formatCompactDate = (timestamp: number) => {
    const d = new Date(timestamp * 1000);
    const dateStr = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${dateStr} · ${timeStr}`;
  };

  const copyToClipboard = async (text: string, label: string = 'Copied!') => {
    try {
      await writeClipboardText(text);
      toast.success(label);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopyToken = async () => {
    if (!tokenString) return;
    try {
      await writeClipboardText(tokenString);
      setCopied(true);
      toast.success('Token copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const hasActions = Boolean(
    (tx.status === 'Pending' && (onRecover || (isMint && onRetryMint) || (isIssue && onCheckIssue))) ||
    (isIssue && tx.status === 'Success' && onDownloadNote) ||
    (tx.status !== 'Pending' && (isSend || isIssue || isRedeem) && onCheckClaimed) ||
    (tx.status === 'Failed' && isReceiveEcash && onRetryReceiveEcash)
  );

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="bg-surface-container-high/98 backdrop-blur-2xl rounded-t-[2rem] sm:rounded-3xl w-full max-w-md border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col relative max-h-[92vh]"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Drag Handle for mobile */}
        <div 
          {...dragHandleProps}
          className="w-full flex justify-center pt-3 pb-1 relative z-10 cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors"></div>
        </div>
        
        {/* Top Control Bar (No name/title on top) */}
        <div 
          {...dragHandleProps}
          className="flex items-center justify-end px-5 pt-2 pb-1 relative z-10"
        >
          <button 
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container/70 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors border border-outline-variant/20 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={`px-6 pt-1 flex-1 flex flex-col gap-5 relative z-10 overflow-y-auto ${hasActions ? 'pb-4' : 'pb-6 sm:pb-5'}`}>
          {/* Hero Section: Icon + Amount + Status Label */}
          <div className="flex flex-col items-center text-center">
            {/* Visual Icon Badge */}
            <div className={`w-14 h-14 rounded-full flex items-center justify-center border mb-3 shadow-md ${
              tx.status === 'Pending'
                ? 'bg-[#f2a93b]/10 border-[#f2a93b]/25 text-[#f2a93b]'
                : tx.status === 'Failed' || tx.status === 'FailedMintError'
                ? 'bg-[#f87171]/10 border-[#f87171]/25 text-[#f87171]'
                : isInflow 
                ? 'bg-[#0e291d] border-[#1c442f] text-[#34d399]' 
                : isIssue 
                ? 'bg-[#10241b] border-[#1b3829] text-primary' 
                : 'bg-[#10241b] border-[#1b3829] text-on-surface-variant'
            }`}>
              {tx.status === 'Pending' ? (
                <Clock className="w-7 h-7 stroke-[2.25]" />
              ) : tx.status === 'Failed' || tx.status === 'FailedMintError' ? (
                <X className="w-7 h-7 stroke-[2.5]" />
              ) : isInflow ? (
                <ArrowDownLeft className="w-7 h-7 stroke-[2.25]" />
              ) : isIssue ? (
                <Banknote className="w-7 h-7 stroke-[2]" />
              ) : (
                <ArrowUpRight className="w-7 h-7 stroke-[2.25]" />
              )}
            </div>

            {/* Hero Amount */}
            <div className="flex items-baseline justify-center">
              <span className="font-display-hero text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {isInflow ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
              </span>
            </div>

            {/* Status Label Pill (right below amount) */}
            <div className="mt-2.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-sm ${
                tx.status === 'Success'
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                  : tx.status === 'Pending'
                  ? 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                  : 'bg-rose-950/60 border-rose-500/30 text-rose-400'
              }`}>
                {tx.status === 'Success' && <CheckCircle size={13} className="stroke-[2.5]" />}
                {tx.status === 'Pending' && <AlertCircle size={13} className="stroke-[2.5]" />}
                {tx.status === 'Failed' && <XCircle size={13} className="stroke-[2.5]" />}
                {tx.status === 'FailedMintError' && <AlertCircle size={13} className="stroke-[2.5]" />}
                <span>{tx.status === 'FailedMintError' ? 'Mint Error' : tx.status}</span>
              </span>
            </div>

            {/* Mint Settlement Error Explanation Box */}
            {tx.status === 'FailedMintError' && (
              <div className="mt-3.5 bg-rose-500/10 border border-rose-500/25 p-4 rounded-2xl flex flex-col gap-1.5 text-left w-full shadow-sm">
                <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs uppercase tracking-wider">
                  <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />
                  <span>Mint Settlement Issue</span>
                </div>
                <p className="text-xs text-rose-200/90 leading-relaxed font-sans">
                  The mint marked your proofs as spent, but the external Lightning invoice was not confirmed as paid. Please contact the mint operator with the Quote ID or Invoice below.
                </p>
              </div>
            )}

            {/* QR Code for Sent eCash (right below status label) */}
            {isSend && tokenString && (
              <div className="mt-4 flex flex-col items-center">
                <div 
                  onClick={handleCopyToken}
                  className="relative cursor-pointer group/qr active:scale-[0.98] transition-transform"
                  title="Click to copy token"
                >
                  <div className="bg-white p-3.5 rounded-2xl shadow-xl relative min-w-[196px] min-h-[196px] flex items-center justify-center transition-all group-hover/qr:shadow-[0_0_25px_rgba(255,184,116,0.35)]">
                    <SafeQRCode 
                      value={currentFrame || (tokenString && tokenString.length < 1500 ? tokenString : '')} 
                      size={170} 
                    />
                    {isAnimated && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-full font-mono backdrop-blur-sm">
                        {currentFrameIndex + 1}/{totalFrames}
                      </div>
                    )}
                    {copied && (
                      <div className="absolute inset-0 bg-black/80 rounded-2xl flex flex-col items-center justify-center text-emerald-400 gap-1.5 backdrop-blur-[2px]">
                        <Check size={28} className="stroke-[2.5]" />
                        <span className="text-xs font-bold font-mono tracking-wide">Copied!</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl -z-10 animate-pulse group-hover/qr:bg-primary/30"></div>
                </div>
                <p className="text-[11px] text-on-surface-variant/60 font-mono mt-2">
                  {copied ? '✓ Token copied to clipboard' : 'Click QR code to copy token'}
                </p>
              </div>
            )}
          </div>

          {/* Details Card: Payment Type, Date, Mint Name, Fee */}
          <div className="bg-surface-container/60 rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3.5 shadow-sm">
            {/* Payment Type */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">TYPE</span>
              <span className="text-body-md font-medium text-on-surface text-right">{getTxLabel()}</span>
            </div>

            <div className="border-b border-outline-variant/15"></div>

            {/* Compact Date and Time */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">DATE</span>
              <span className="text-body-md font-medium text-on-surface text-right">{formatCompactDate(tx.timestamp)}</span>
            </div>

            <div className="border-b border-outline-variant/15"></div>

            {/* Mint (Mint Name instead of raw URL) */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">MINT</span>
              <div className="flex items-center gap-2 max-w-[65%] justify-end">
                {tx.mint_url && (
                  <MintIcon 
                    mintUrl={tx.mint_url} 
                    className="w-5 h-5 rounded-full bg-primary/15 border border-primary/25" 
                    textClassName="text-[10px] text-primary font-bold" 
                  />
                )}
                <span className="text-body-md font-medium text-on-surface truncate text-right">
                  {tx.mint_url ? <MintName mintUrl={tx.mint_url} /> : 'Local Wallet'}
                </span>
              </div>
            </div>

            {tx.fee > 0 && (
              <>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">FEE</span>
                  <span className="text-body-md font-medium text-on-surface text-right">₿{tx.fee.toLocaleString()}</span>
                </div>
              </>
            )}

            {isMelt && tx.tx_type.Melt?.proofs && (
              <>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">PROOFS MELTED</span>
                  <span className="text-body-md font-medium text-on-surface text-right">{tx.tx_type.Melt.proofs.length}</span>
                </div>
              </>
            )}

            {isSendOnchain && tx.tx_type.SendOnchain && (
              <>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">ARK BATCHING FEE</span>
                  <span className="text-body-md font-medium text-on-surface text-right">₿{tx.tx_type.SendOnchain.ark_fee.toLocaleString()}</span>
                </div>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">LIGHTNING ROUTING FEE</span>
                  <span className="text-body-md font-medium text-on-surface text-right">₿{tx.tx_type.SendOnchain.cashu_fee.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Transaction Identifiers */}
          <div className="flex flex-col gap-2.5">
            {/* Transaction ID */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Transaction ID</span>
                <span className="font-mono text-xs text-on-surface truncate">{tx.id}</span>
              </div>
              <button
                onClick={() => copyToClipboard(tx.id, 'Transaction ID copied')}
                className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                title="Copy Transaction ID"
              >
                <Copy size={14} />
              </button>
            </div>

            {/* Token (single-line, same box style as txid, right below it) */}
            {isSend && tokenString && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Token</span>
                  <span className="font-mono text-xs text-on-surface truncate">
                    {tokenString.length > 28 ? `${tokenString.slice(0, 14)}...${tokenString.slice(-10)}` : tokenString}
                  </span>
                </div>
                <button
                  onClick={handleCopyToken}
                  className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                  title="Copy Token"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            {quoteId && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">
                    {quoteId.startsWith('lnbc') || quoteId.startsWith('lntb') ? 'Invoice' : 'Quote ID'}
                  </span>
                  <span className="font-mono text-xs text-on-surface truncate">{quoteId}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(quoteId, quoteId.startsWith('lnbc') || quoteId.startsWith('lntb') ? 'Invoice copied' : 'Quote ID copied')}
                  className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              </div>
            )}

            {onchainTxid && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Bitcoin TxID</span>
                  <span className="font-mono text-xs text-on-surface truncate">{onchainTxid}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openMempoolTx(onchainTxid)}
                    className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-primary transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                    title="View on Mempool.space"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(onchainTxid, 'TxID copied')}
                    className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                    title="Copy TxID"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}

            {onchainAddress && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">
                    {isSendOnchain ? 'Recipient Address' : 'Bitcoin Deposit Address'}
                  </span>
                  <span className="font-mono text-xs text-on-surface truncate">{onchainAddress}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openMempoolAddress(onchainAddress)}
                    className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-primary transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                    title="View on Mempool.space"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(onchainAddress, 'Address copied')}
                    className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
                    title="Copy Address"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Sticky Footer (Always visible at the bottom) */}
        {hasActions && (
          <div className="px-6 pt-3 pb-6 sm:pb-5 bg-surface-container-high/95 backdrop-blur-xl border-t border-outline-variant/15 relative z-20 flex flex-col gap-2 shadow-[0_-8px_24px_rgba(0,0,0,0.3)]">
            {isIssue && tx.status === 'Success' && onDownloadNote && (
              <button
                onClick={() => onDownloadNote(tx.id, tx.amount, tx.tx_type?.Issue?.note?.serial)}
                className="w-full py-3 bg-surface-container-highest hover:bg-surface-bright text-primary rounded-xl font-bold text-body-md transition-colors border border-outline-variant/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <Download className="w-4 h-4" />
                Download SVG / PDF
              </button>
            )}

            {isMint && tx.status === 'Pending' && onRetryMint && (
              <button
                onClick={() => onRetryMint(tx.id)}
                className="w-full py-3 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-xl font-bold text-body-md transition-colors border border-teal-500/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <Clock className="w-4 h-4" />
                Retry Mint
              </button>
            )}

            {isIssue && tx.status === 'Pending' && onCheckIssue && (
              <button
                onClick={() => onCheckIssue(tx.id)}
                className="w-full py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <CheckCircle className="w-4 h-4" />
                Check Status & Resume
              </button>
            )}

            {tx.status === 'Pending' && onRecover && !isMint && !isIssue && (
              <button
                onClick={onRecover}
                className="w-full py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <CheckCircle className="w-4 h-4" />
                {isReceiveEcash
                  ? 'Check Status & Claim'
                  : isReceiveLightning
                  ? 'Check Status'
                  : isReceiveOnchain
                  ? 'Check Status'
                  : isSendOnchain
                  ? 'Check Status'
                  : isRedeem
                  ? 'Check Status & Recover'
                  : isMelt
                  ? 'Check Status & Refund'
                  : 'Check Status & Recover'}
              </button>
            )}

            {tx.status !== 'Pending' && (isSend || isIssue || isRedeem) && onCheckClaimed && (
              <button
                onClick={onCheckClaimed}
                className="w-full py-3 bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-xl font-bold text-body-md transition-colors border border-outline-variant/20 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {isRedeem ? 'Check Note Spend Status' : isIssue ? 'Check if Note Claimed' : 'Check if Claimed'}
              </button>
            )}

            {tx.status === 'Failed' && isReceiveEcash && onRetryReceiveEcash && (
              <button
                onClick={onRetryReceiveEcash}
                className="w-full py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[2.25]" />
                Retry Claim
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
