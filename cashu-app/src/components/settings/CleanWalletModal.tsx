import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Terminal,
  Globe,
  Trash2,
  ShieldCheck,
  Zap,
  ArrowRight,
  MinusCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { writeClipboardText } from '../../utils/clipboard';

export interface CleanWalletResult {
  removed_sats: number;
  restored_sats: number;
  derivation_index: number;
  cleaned_txs: number;
}

interface CleanWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCleaning: boolean;
  logs: string[];
  result: CleanWalletResult | null;
  error: string | null;
  onRunAgain: () => void;
}

export const CleanWalletModal: React.FC<CleanWalletModalProps> = ({
  isOpen,
  onClose,
  isCleaning,
  logs,
  result,
  error,
  onRunAgain,
}) => {
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logs on new message
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    try {
      await writeClipboardText(logs.join('\n'));
      setCopied(true);
      toast.success('Logs copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  if (!isOpen) return null;

  const renderLogLine = (line: string, index: number) => {
    const isRestoreRequest = line.includes('Requesting restore of') || line.includes('Scanning');
    const isHealed = line.includes('Auto-healed') || line.includes('Healed') || line.includes('healed');
    const isRestored = (line.includes('Restored') || line.includes('Recovered') || line.includes('Completed restore')) && (line.includes('unspent') || line.includes('proofs') || line.includes('sats'));
    const isNoTokens = line.includes('No tokens found') || line.includes('No unspent proofs') || line.includes('No new unspent');
    const isRemoved = line.includes('Removed') && (line.includes('spent') || line.includes('pending'));
    const isAdvanced = line.includes('Derivation index') || line.includes('Synchronized') || line.includes('Synchronizing');
    const isSuccess = line.includes('successfully') || line.includes('Wallet clean complete');
    const isChecking = line.includes('Checking') || line.includes('Verifying');
    const isWarning = line.includes('Warning');

    let textColor = 'text-on-surface/85';
    let icon = <Terminal size={13} className="text-on-surface-variant/60 shrink-0 mt-0.5" />;

    if (isSuccess) {
      textColor = 'text-primary font-bold';
      icon = <Sparkles size={13} className="text-primary shrink-0 mt-0.5" />;
    } else if (isHealed) {
      textColor = 'text-primary font-semibold';
      icon = <Sparkles size={13} className="text-primary shrink-0 mt-0.5 animate-pulse" />;
    } else if (isRestored) {
      textColor = 'text-secondary font-bold';
      icon = <CheckCircle2 size={13} className="text-secondary shrink-0 mt-0.5" />;
    } else if (isRestoreRequest) {
      textColor = 'text-secondary/95 font-medium';
      icon = <Globe size={13} className="text-secondary shrink-0 mt-0.5 animate-pulse" />;
    } else if (isRemoved) {
      textColor = 'text-error font-medium';
      icon = <Trash2 size={13} className="text-error/80 shrink-0 mt-0.5" />;
    } else if (isWarning) {
      textColor = 'text-amber-400 font-medium';
      icon = <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />;
    } else if (isAdvanced) {
      textColor = 'text-primary font-semibold';
      icon = <Zap size={13} className="text-primary shrink-0 mt-0.5" />;
    } else if (isChecking) {
      textColor = 'text-on-surface-variant';
      icon = <RefreshCw size={13} className="text-on-surface-variant/70 shrink-0 mt-0.5 animate-spin" />;
    } else if (isNoTokens) {
      textColor = 'text-on-surface-variant/50';
      icon = <MinusCircle size={13} className="text-on-surface-variant/40 shrink-0 mt-0.5" />;
    }

    return (
      <div
        key={index}
        className="flex items-start gap-2 text-[11px] font-mono leading-relaxed break-all select-text hover:bg-surface-container/50 px-1.5 py-0.5 rounded transition-colors"
      >
        <span className="text-on-surface-variant/40 select-none text-[10px] w-6 text-right shrink-0">
          {index + 1}
        </span>
        {icon}
        <span className={textColor}>{line}</span>
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-background/85 backdrop-blur-md animate-fade-in"
      onClick={isCleaning ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container-high rounded-2xl w-full max-w-2xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col relative max-h-[92vh]"
      >
        {/* Brand texture overlay & subtle gold glow */}
        <div className="absolute inset-0 texture-overlay opacity-25 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-outline-variant relative z-10 bg-surface-container-highest/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-inner">
              {isCleaning ? (
                <RefreshCw size={20} className="animate-spin text-primary" />
              ) : (
                <ShieldCheck size={20} className="text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-body-md sm:text-headline-sm font-bold text-on-surface truncate">
                  Wallet Maintenance & Cleaning
                </h2>
                {isCleaning && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Live Sync
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant truncate">
                Purging spent proofs & recovering unspent ecash from mints
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors shrink-0 ml-2 cursor-pointer"
            title={isCleaning ? 'Minimize' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex flex-col gap-4 relative z-10 overflow-y-auto min-h-0">
          {/* Status banner */}
          {isCleaning ? (
            <div className="p-3.5 bg-primary/10 border border-primary/25 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                <div>
                  <div className="text-xs font-bold text-primary">Cleaning & Scanning Active</div>
                  <div className="text-[11px] text-on-surface-variant">
                    Querying configured mints for proofs and synchronizing output counters...
                  </div>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="p-3.5 bg-error/10 border border-error/30 rounded-xl flex items-center gap-3 text-error">
              <AlertTriangle size={18} className="shrink-0" />
              <div className="text-xs font-medium">{error}</div>
            </div>
          ) : result ? (
            <div className="p-3.5 bg-secondary-container/60 border border-secondary/30 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-secondary shrink-0" />
                <div>
                  <div className="text-xs font-bold text-secondary">Wallet Clean Complete</div>
                  <div className="text-[11px] text-on-surface-variant">
                    Your local proofs and derivation counters are completely in sync with all mints.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Result statistics cards (when finished) */}
          {result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-surface-container p-3 rounded-xl border border-secondary/25 flex flex-col">
                <span className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-wider">
                  Restored
                </span>
                <span className="text-base sm:text-lg font-bold text-secondary font-mono mt-0.5">
                  +{result.restored_sats.toLocaleString()} sats
                </span>
              </div>
              <div className="bg-surface-container p-3 rounded-xl border border-outline-variant flex flex-col">
                <span className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-wider">
                  Spent Purged
                </span>
                <span className="text-base sm:text-lg font-bold text-error font-mono mt-0.5">
                  {result.removed_sats.toLocaleString()} sats
                </span>
              </div>
              <div className="bg-surface-container p-3 rounded-xl border border-outline-variant flex flex-col">
                <span className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-wider">
                  Stuck Txs
                </span>
                <span className="text-base sm:text-lg font-bold text-on-surface font-mono mt-0.5">
                  {result.cleaned_txs} cleared
                </span>
              </div>
              <div className="bg-surface-container p-3 rounded-xl border border-primary/25 flex flex-col">
                <span className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-wider">
                  Counter Index
                </span>
                <span className="text-base sm:text-lg font-bold text-primary font-mono mt-0.5">
                  #{result.derivation_index}
                </span>
              </div>
            </div>
          )}

          {/* Terminal Log Console */}
          <div className="flex flex-col bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-inner">
            {/* Terminal bar */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-container-low border-b border-outline-variant select-none">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-error/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-primary/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-secondary/70" />
                </div>
                <span className="text-[11px] font-mono text-on-surface-variant ml-2">
                  restore-sync.log {logs.length > 0 && `(${logs.length} entries)`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface text-[11px] font-mono transition-colors border border-outline-variant disabled:opacity-40 cursor-pointer"
                  title="Copy log text"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-secondary" />
                      <span className="text-secondary">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Terminal logs body */}
            <div
              ref={logContainerRef}
              className="p-3 max-h-64 sm:max-h-80 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-outline-variant bg-surface-container-lowest"
            >
              {logs.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center text-on-surface-variant font-mono text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mb-2 opacity-50 text-secondary" />
                  <span>Connecting to mints and checking wallet states...</span>
                </div>
              ) : (
                logs.map((line, i) => renderLogLine(line, i))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-outline-variant relative z-10 bg-surface-container-highest/30 flex items-center justify-between gap-3">
          <div className="text-[11px] text-on-surface-variant font-mono hidden sm:block">
            {isCleaning ? 'Do not close app while sync is in progress' : 'Counters safely advanced by +25'}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!isCleaning && (
              <button
                type="button"
                onClick={onRunAgain}
                className="btn-secondary px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Run Clean Again
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isCleaning}
              className="btn-primary px-6 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isCleaning ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  Done
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
