import React, { useState } from 'react';
import { X, Info, Copy, Check, ChevronDown, ChevronUp, Lock, ArrowDown, ArrowUp, Hash, Globe } from 'lucide-react';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';
import { useMintInfo } from '../../hooks/useMintInfo';
import { useWalletStore } from '../../store/wallet';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';

interface MintInfoModalProps {
  mintUrl: string;
  onClose: () => void;
}

export const MintInfoModal: React.FC<MintInfoModalProps> = ({ mintUrl, onClose }) => {
  const { info, loading, error } = useMintInfo(mintUrl);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const balance = mintBalances[mintUrl] || 0;

  const handleRemoveMint = async () => {
    try {
      await invoke('remove_mint', { mintUrl });
      await refreshWallet();
      toast.success('Mint removed successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.toString());
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Info className="text-primary w-5 h-5" /> Mint Info
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          
          {/* Hero */}
          <div className="flex flex-col items-center justify-center gap-4 mt-4">
            <MintIcon 
              mintUrl={mintUrl} 
              className="w-24 h-24 rounded-3xl bg-surface-container-high border border-outline-variant/20 shadow-sm" 
              textClassName="text-on-surface text-[32px] font-bold" 
            />
            <h1 className="text-[32px] font-bold text-center leading-tight text-on-surface">
              {info?.name || formatMintUrl(mintUrl)}
            </h1>
            
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="text-[14px]">{formatMintUrl(mintUrl)}</span>
              <button 
                onClick={handleCopy}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>

            {info?.version && (
              <div className="bg-surface-container-high px-4 py-2 rounded-full text-[13px] font-semibold text-on-surface border border-outline-variant/10">
                {info.version}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-0 border-y border-outline-variant/10 py-2">
            <div className="flex justify-between items-center py-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3 text-on-surface-variant">
                <span className="text-xl">₿</span>
                <span className="text-[16px]">Balance</span>
              </div>
              <span className="text-[16px] font-semibold text-on-surface">{balance.toLocaleString()} {units}</span>
            </div>
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3 text-on-surface-variant">
                <Globe size={20} className="opacity-70" />
                <span className="text-[16px]">Connection</span>
              </div>
              <span className={`text-[16px] font-semibold ${error ? 'text-error' : loading ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                {error ? 'Offline' : loading ? 'Connecting...' : 'Online'}
              </span>
            </div>
          </div>

          {/* About */}
          {info?.description && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] font-bold tracking-[0.2em] text-on-surface-variant uppercase">About</h3>
              <p className="text-[16px] font-medium leading-relaxed text-on-surface">
                {info.description}
              </p>
              {info.description_long && (
                <div className="flex flex-col gap-2">
                  <p className={`text-[15px] text-on-surface-variant leading-relaxed ${!showFullDesc && 'line-clamp-3'}`}>
                    {info.description_long}
                  </p>
                  <button 
                    onClick={() => setShowFullDesc(!showFullDesc)}
                    className="text-on-surface font-semibold text-[14px] self-start py-1"
                  >
                    {showFullDesc ? 'Show less' : 'Read more'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MOTD */}
          {info?.motd && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] font-bold tracking-[0.2em] text-on-surface-variant uppercase">Message from the mint</h3>
              <p className="text-[16px] text-on-surface">{info.motd}</p>
            </div>
          )}

          {/* Capabilities */}
          {capabilities.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[12px] font-bold tracking-[0.2em] text-on-surface-variant uppercase">Capabilities</h3>
              <div className="flex flex-col gap-4">
                {capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-4 text-[16px] text-on-surface">
                    <Lock size={20} className="text-on-surface-variant" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="flex justify-between items-center py-4 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="text-[16px]">Technical details</span>
                {showTechDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              
              {showTechDetails && (
                <div className="bg-surface-container-high p-4 rounded-xl text-[13px] font-mono text-on-surface-variant overflow-x-auto border border-outline-variant/10">
                  <pre>{JSON.stringify(info?.nuts, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {/* Payment Methods */}
          {(receiveMethods.length > 0 || sendMethods.length > 0) && (
            <div className="flex flex-col gap-0 border-t border-outline-variant/10 pt-6">
              <h3 className="text-[12px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-2">Payment Methods</h3>
              
              {receiveMethods.length > 0 && (
                <div className="flex justify-between items-center py-4 border-b border-outline-variant/10">
                  <div className="flex items-center gap-4 text-[16px] text-on-surface-variant">
                    <ArrowDown size={18} />
                    <span>Receive</span>
                  </div>
                  <span className="text-[16px] font-mono text-on-surface">{receiveMethods.join(', ')}</span>
                </div>
              )}
              
              {sendMethods.length > 0 && (
                <div className="flex justify-between items-center py-4">
                  <div className="flex items-center gap-4 text-[16px] text-on-surface-variant">
                    <ArrowUp size={18} />
                    <span>Send</span>
                  </div>
                  <span className="text-[16px] font-mono text-on-surface">{sendMethods.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Details */}
          <div className="flex flex-col gap-0 border-t border-outline-variant/10 pt-6">
            <h3 className="text-[12px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-2">Details</h3>
            
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-4 text-[16px] text-on-surface-variant">
                <Hash size={18} />
                <span>Units</span>
              </div>
              <span className="text-[16px] font-mono text-on-surface">{units}</span>
            </div>
          </div>

          {/* Remove Mint Button */}
          <div className="mt-8 flex justify-center">
            <button 
              onClick={handleRemoveMint}
              disabled={balance > 0}
              className="text-error text-[16px] font-medium py-4 px-8 hover:bg-error/10 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-full transition-colors"
              title={balance > 0 ? "Cannot remove mint with a non-zero balance" : undefined}
            >
              Remove mint
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};
