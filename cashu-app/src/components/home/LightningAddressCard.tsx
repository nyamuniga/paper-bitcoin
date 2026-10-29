import React, { useState } from 'react';
import { Copy, Check, Zap, QrCode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNostr } from '../../hooks/useNostr';
import { useNostrStore } from '../../store/nostrStore';
import { LightningAddressModal } from './LightningAddressModal';
import { LightningAddressSkeleton } from '../shared/Skeleton';
import { writeClipboardText } from '../../utils/clipboard';

export const LightningAddressCard: React.FC = () => {
  const { lightningAddress } = useNostr();
  const isInitializing = useNostrStore((s) => s.isInitializing);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInitializing && !lightningAddress) {
    return <LightningAddressSkeleton />;
  }

  if (!lightningAddress) return null;

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    writeClipboardText(lightningAddress);
    setCopied(true);
    toast.success('Lightning Address copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedAddress = lightningAddress.length > 30
    ? `${lightningAddress.slice(0, 14)}...${lightningAddress.slice(-14)}`
    : lightningAddress;

  return (
    <>
      {showQR && <LightningAddressModal onClose={() => setShowQR(false)} />}
      <div 
        onClick={() => setShowQR(true)}
        className="bg-[#0c1b14] border border-[#142d20] rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-[#1a3829] transition-colors duration-200 cursor-pointer group overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#12261d] border border-[#1e3c2e] group-hover:border-[#2b563e] group-hover:bg-[#163024] flex items-center justify-center text-[#f2a93b] shrink-0 shadow-sm transition-colors duration-200">
              <Zap size={18} className="sm:w-5 sm:h-5 text-[#f2a93b] fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] sm:text-[10px] text-[#627d70] font-mono font-bold tracking-widest uppercase mb-0.5">
                LIGHTNING ADDRESS
              </p>
              <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[#f7f4eb] font-semibold tracking-tight truncate font-sans group-hover:text-primary transition-colors">
                {truncatedAddress}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleCopy}
              className="p-2 sm:p-2.5 rounded-xl hover:bg-[#12261d] text-[#627d70] hover:text-[#f2a93b] transition-colors active:scale-95 cursor-pointer"
              title="Copy"
            >
              {copied ? <Check size={16} className="sm:w-[18px] sm:h-[18px] text-secondary" /> : <Copy size={16} className="sm:w-[18px] sm:h-[18px]" />}
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="p-2 sm:p-2.5 rounded-xl hover:bg-[#12261d] text-[#627d70] hover:text-[#f2a93b] transition-colors active:scale-95 cursor-pointer"
              title="Show QR"
            >
              <QrCode size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

