import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';
import { useMintInfo } from '../../hooks/useMintInfo';
import { useWalletStore } from '../../store/wallet';
import { useMints } from '../../hooks/useMints';
import { useBottomSheet } from '../../hooks/useBottomSheet';

interface MintInfoModalProps {
  mintUrl: string;
  onClose: () => void;
}

export const MintInfoModal: React.FC<MintInfoModalProps> = ({ mintUrl, onClose }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });
  const { info, loading, error } = useMintInfo(mintUrl);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const normalize = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  const connectedKey = Object.keys(mintBalances).find(k => normalize(k) === normalize(mintUrl));
  const isConnected = !!connectedKey;
  const balance = connectedKey ? mintBalances[connectedKey] : 0;

  const { removeMint, addMint, loading: isMintActionLoading } = useMints();

  const handleRemoveMint = async () => {
    if (connectedKey) {
      const success = await removeMint(connectedKey);
      if (success) {
        onClose();
      }
    }
  };

  const handleAddMint = async () => {
    if (isMintActionLoading) return;
    await addMint(mintUrl);
  };

  const [copied, setCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mintUrl);
      setCopied(true);
      toast.success('Mint URL copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
      toast.error('Failed to copy');
    }
  };

  // Parse NUTs
  const capabilities: string[] = [];
  if (info?.nuts) {
    if (info.nuts['11']?.supported || info.nuts['12']?.supported) {
      capabilities.push('Locked ecash (P2PK · HTLC)');
    }
    if (info.nuts['7']?.supported || info.nuts['8']?.supported) {
      capabilities.push('State checks (Check · Melt)');
    }
    if (info.nuts['14']?.supported) {
      capabilities.push('Hashed Timelock Contracts (HTLCs)');
    }
  }

  const receiveMethods = info?.nuts?.['4']?.methods?.map((m: any) => m.method.toUpperCase()) || [];
  const sendMethods = info?.nuts?.['5']?.methods?.map((m: any) => m.method.toUpperCase()) || [];
  const units = info?.nuts?.['4']?.methods?.[0]?.unit || 'sat';

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={e => e.stopPropagation()}
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
        <div className="px-6 pt-1 flex-1 flex flex-col gap-5 relative z-10 overflow-y-auto pb-4">
          {/* Hero Section: Centered Mint Icon + Title + Status Pill */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <MintIcon
                mintUrl={mintUrl}
                className="w-16 h-16 shrink-0 rounded-2xl bg-surface-container border border-outline-variant/25 shadow-md flex items-center justify-center"
                textClassName="text-on-surface text-[24px] font-bold"
              />
            </div>

            <h1 className="font-display-hero text-2xl sm:text-3xl font-extrabold tracking-tight text-white text-center leading-tight truncate max-w-full px-2">
              {info?.name || formatMintUrl(mintUrl)}
            </h1>

            {/* Status Pill (right below name) */}
            <div className="mt-2.5 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-sm ${
                error
                  ? 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                  : loading
                  ? 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  error ? 'bg-rose-400' : loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`} />
                <span>{error ? 'Offline' : loading ? 'Connecting...' : 'Online'}</span>
              </span>

              {info?.version && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium text-on-surface-variant bg-surface-container/70 border border-outline-variant/20">
                  v{info.version}
                </span>
              )}
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-surface-container/60 rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3.5 shadow-sm">
            {/* Balance */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">BALANCE</span>
              <span className="font-mono text-body-md font-bold text-white text-right">
                ₿{balance.toLocaleString()} <span className="text-on-surface-variant font-normal text-xs">{units}</span>
              </span>
            </div>

            <div className="border-b border-outline-variant/15"></div>

            {/* Connection Status */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">STATUS</span>
              <span className={`text-body-md font-medium text-right ${error ? 'text-rose-400' : loading ? 'text-amber-400' : 'text-emerald-400'}`}>
                {error ? 'Offline' : loading ? 'Connecting' : 'Connected'}
              </span>
            </div>

            {receiveMethods.length > 0 && (
              <>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">RECEIVE</span>
                  <span className="text-body-md font-medium text-on-surface text-right">{receiveMethods.join(', ')}</span>
                </div>
              </>
            )}

            {sendMethods.length > 0 && (
              <>
                <div className="border-b border-outline-variant/15"></div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">SEND</span>
                  <span className="text-body-md font-medium text-on-surface text-right">{sendMethods.join(', ')}</span>
                </div>
              </>
            )}

            <div className="border-b border-outline-variant/15"></div>

            {/* Unit */}
            <div className="flex justify-between items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant flex-shrink-0">UNIT</span>
              <span className="text-body-md font-mono text-on-surface text-right">{units}</span>
            </div>
          </div>

          {/* Mint URL Card */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/60 border border-outline-variant/20 shadow-sm">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Mint URL</span>
              <span className="font-mono text-xs text-on-surface truncate">{mintUrl}</span>
            </div>
            <button
              onClick={handleCopy}
              className="p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20"
              title="Copy Mint URL"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>

          {/* About */}
          {info?.description && (
            <div className="bg-surface-container/60 rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-2 shadow-sm">
              <span className="text-label-caps font-label-caps text-on-surface-variant uppercase">ABOUT</span>
              <p className="text-body-md text-on-surface leading-relaxed">{info.description}</p>
              {info.description_long && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <p className={`text-body-sm text-on-surface-variant leading-relaxed ${!showFullDesc ? 'line-clamp-3' : ''}`}>
                    {info.description_long}
                  </p>
                  <button
                    onClick={() => setShowFullDesc(!showFullDesc)}
                    className="text-primary font-bold text-xs self-start py-0.5 hover:underline cursor-pointer"
                  >
                    {showFullDesc ? 'Show less' : 'Read more'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MOTD */}
          {info?.motd && (
            <div className="bg-surface-container/60 rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-2 shadow-sm">
              <span className="text-label-caps font-label-caps text-on-surface-variant uppercase">MESSAGE FROM MINT</span>
              <p className="text-body-md text-on-surface leading-relaxed italic">"{info.motd}"</p>
            </div>
          )}

          {/* Capabilities */}
          {capabilities.length > 0 && (
            <div className="bg-surface-container/60 rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3 shadow-sm">
              <span className="text-label-caps font-label-caps text-on-surface-variant uppercase">CAPABILITIES</span>
              <div className="flex flex-col gap-2">
                {capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-body-md text-on-surface">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="flex justify-between items-center pt-2.5 mt-0.5 border-t border-outline-variant/15 text-xs text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="font-medium">Technical Details (NUTs)</span>
                {showTechDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showTechDetails && (
                <div className="bg-surface-container-lowest/80 p-3 rounded-xl text-[11px] font-mono text-on-surface-variant overflow-x-auto border border-outline-variant/15">
                  <pre>{JSON.stringify(info?.nuts, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Sticky Footer */}
        <div className="px-6 pt-3 pb-6 sm:pb-5 bg-surface-container-high/95 backdrop-blur-xl border-t border-outline-variant/15 relative z-20 flex flex-col gap-2 shadow-[0_-8px_24px_rgba(0,0,0,0.3)]">
          {isConnected ? (
            <>
              <button
                onClick={handleRemoveMint}
                disabled={balance > 0 || isMintActionLoading}
                className="w-full py-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 disabled:opacity-40 disabled:hover:bg-rose-500/15 disabled:cursor-not-allowed rounded-xl font-bold text-body-md transition-colors border border-rose-500/25 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
                title={balance > 0 ? "Cannot remove mint with a non-zero balance" : undefined}
              >
                {isMintActionLoading ? 'Removing...' : 'Remove Mint'}
              </button>
              {balance > 0 && (
                <p className="text-[11px] text-center text-on-surface-variant font-sans">
                  Mints with an active balance cannot be removed.
                </p>
              )}
            </>
          ) : (
            <button
              onClick={handleAddMint}
              disabled={isMintActionLoading}
              className="w-full py-3 bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-40 rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
            >
              {isMintActionLoading ? 'Adding...' : 'Add Mint to Wallet'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
