import React, { useState } from 'react';
import { X, Info, Copy, Check, ChevronDown, ChevronUp, Lock, ArrowDown, ArrowUp, Hash, Globe } from 'lucide-react';
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
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Parse NUTs
  const capabilities = [];
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={e => e.stopPropagation()}
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
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Info className="text-primary w-5 h-5" /> Mint Info
          </h2>
          <button
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">

          {/* Hero */}
          <div className="flex flex-col items-center justify-center gap-4 mt-4 w-full">
            <MintIcon
              mintUrl={mintUrl}
              className="w-24 h-24 shrink-0 rounded-3xl bg-surface-container-high border border-outline-variant/20 shadow-sm"
              textClassName="text-on-surface text-[32px] font-bold"
            />
            <h1 className="text-headline-md font-headline-md font-bold text-center leading-tight text-on-surface break-words w-full px-2">
              {info?.name || formatMintUrl(mintUrl)}
            </h1>

            <div className="flex items-center gap-2 text-on-surface-variant max-w-full px-4">
              <span className="text-body-md font-body-md truncate">{formatMintUrl(mintUrl)}</span>
              <button
                onClick={handleCopy}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>

            {info?.version && (
              <div className="bg-surface-container-high px-3.5 py-1.5 rounded-full text-body-sm font-body-sm font-semibold text-on-surface border border-outline-variant/10">
                {info.version}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-0 border-y border-outline-variant/10 py-2">
            <div className="flex justify-between items-center py-3.5 border-b border-outline-variant/10">
              <div className="flex items-center gap-3 text-on-surface-variant">
                <span className="text-xl">₿</span>
                <span className="text-body-md font-body-md">Balance</span>
              </div>
              <span className="text-body-md font-body-md font-semibold text-on-surface">{balance.toLocaleString()} {units}</span>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center gap-3 text-on-surface-variant">
                <Globe size={20} className="opacity-70" />
                <span className="text-body-md font-body-md">Connection</span>
              </div>
              <span className={`text-body-md font-body-md font-semibold ${error ? 'text-error' : loading ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                {error ? 'Offline' : loading ? 'Connecting...' : 'Online'}
              </span>
            </div>
          </div>

          {/* About */}
          {info?.description && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-label-caps font-label-caps text-on-surface-variant tracking-wider uppercase">About</h3>
              <p className="text-body-md font-body-md leading-relaxed text-on-surface">
                {info.description}
              </p>
              {info.description_long && (
                <div className="flex flex-col gap-2">
                  <p className={`text-body-sm font-body-sm text-on-surface-variant leading-relaxed ${!showFullDesc && 'line-clamp-3'}`}>
                    {info.description_long}
                  </p>
                  <button
                    onClick={() => setShowFullDesc(!showFullDesc)}
                    className="text-primary font-bold text-body-sm self-start py-0.5 hover:underline cursor-pointer"
                  >
                    {showFullDesc ? 'Show less' : 'Read more'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MOTD */}
          {info?.motd && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-label-caps font-label-caps text-on-surface-variant tracking-wider uppercase">Message from the mint</h3>
              <p className="text-body-md font-body-md text-on-surface leading-relaxed">{info.motd}</p>
            </div>
          )}

          {/* Capabilities */}
          {capabilities.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <h3 className="text-label-caps font-label-caps text-on-surface-variant tracking-wider uppercase">Capabilities</h3>
              <div className="flex flex-col gap-3.5">
                {capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-3.5 text-body-md font-body-md text-on-surface">
                    <Lock size={18} className="text-on-surface-variant flex-shrink-0" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="flex justify-between items-center py-3 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="text-body-md font-body-md font-medium">Technical details</span>
                {showTechDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showTechDetails && (
                <div className="bg-surface-container-high p-4 rounded-xl text-xs font-mono text-on-surface-variant overflow-x-auto border border-outline-variant/10">
                  <pre>{JSON.stringify(info?.nuts, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {/* Payment Methods */}
          {(receiveMethods.length > 0 || sendMethods.length > 0) && (
            <div className="flex flex-col gap-0 border-t border-outline-variant/10 pt-5">
              <h3 className="text-label-caps font-label-caps text-on-surface-variant tracking-wider uppercase mb-1">Payment Methods</h3>

              {receiveMethods.length > 0 && (
                <div className="flex justify-between items-center py-3.5 border-b border-outline-variant/10">
                  <div className="flex items-center gap-3.5 text-body-md font-body-md text-on-surface-variant">
                    <ArrowDown size={18} className="flex-shrink-0" />
                    <span>Receive</span>
                  </div>
                  <span className="text-body-md font-mono text-on-surface">{receiveMethods.join(', ')}</span>
                </div>
              )}

              {sendMethods.length > 0 && (
                <div className="flex justify-between items-center py-3.5">
                  <div className="flex items-center gap-3.5 text-body-md font-body-md text-on-surface-variant">
                    <ArrowUp size={18} className="flex-shrink-0" />
                    <span>Send</span>
                  </div>
                  <span className="text-body-md font-mono text-on-surface">{sendMethods.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Details */}
          <div className="flex flex-col gap-0 border-t border-outline-variant/10 pt-5">
            <h3 className="text-label-caps font-label-caps text-on-surface-variant tracking-wider uppercase mb-1">Details</h3>

            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center gap-3.5 text-body-md font-body-md text-on-surface-variant">
                <Hash size={18} className="flex-shrink-0" />
                <span>Units</span>
              </div>
              <span className="text-body-md font-mono text-on-surface">{units}</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-6 flex justify-center">
            {isConnected ? (
              <button
                onClick={handleRemoveMint}
                disabled={balance > 0 || isMintActionLoading}
                className="text-error text-body-md font-bold py-3.5 px-8 hover:bg-error/10 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-full transition-colors cursor-pointer"
                title={balance > 0 ? "Cannot remove mint with a non-zero balance" : undefined}
              >
                {isMintActionLoading ? 'Removing...' : 'Remove mint'}
              </button>
            ) : (
              <button
                onClick={handleAddMint}
                disabled={isMintActionLoading}
                className="text-primary text-body-md font-bold py-3.5 px-8 hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-full transition-colors cursor-pointer"
              >
                {isMintActionLoading ? 'Adding...' : 'Add mint to wallet'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
