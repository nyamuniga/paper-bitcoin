import React, { useState, useMemo } from 'react';
import { Lock, Copy, QrCode, Check, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useNostrStore } from '../../store/nostrStore';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import { nip19 } from 'nostr-tools';

export const LockedEcashSection: React.FC = () => {
  const { npub } = useNostrStore();
  const [showQr, setShowQr] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const hexPubkey = useMemo(() => {
    if (!npub) return '';
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        const hex = decoded.data as string;
        if (hex.length === 64) return `02${hex}`;
        return hex;
      }
    } catch (e) {
      console.error('Failed to decode npub', e);
    }
    return '';
  }, [npub]);

  const handleCopyHex = () => {
    if (!hexPubkey) return;
    navigator.clipboard.writeText(hexPubkey);
    setCopiedHex(true);
    toast.success('Hex pubkey copied to clipboard');
    setTimeout(() => setCopiedHex(false), 2000);
  };

  if (!npub) return null;

  return (
    <>
      <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden">
        <div
          className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-surface-container-highest transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
              <Lock size={20} />
            </div>
            <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Locked Ecash</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">P2PK public key receiving</p>
          </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-on-surface-variant shrink-0">
              {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-6 pb-6 pt-2 border-t border-outline-variant flex flex-col gap-4">
            {hexPubkey && (
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-label-caps text-on-surface-variant mb-1">YOUR PUBKEY (HEX)</p>
                  <p className="text-body-md font-mono text-on-surface truncate">{hexPubkey}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopyHex}
                    className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors border border-outline-variant"
                    title="Copy hex pubkey"
                  >
                    {copiedHex ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                  <button
                    onClick={() => setShowQr(true)}
                    className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors border border-outline-variant"
                    title="Show QR Code"
                  >
                    <QrCode size={18} />
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-on-surface-variant leading-relaxed">
              When someone sends you ecash locked with P2PK, share your hex public key above. Only your wallet can unlock and spend those proofs.
            </p>
          </div>
        )}
      </section>

      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-high rounded-2xl w-full max-w-sm p-6 relative flex flex-col items-center border border-outline-variant">
            <button
              onClick={() => setShowQr(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
            >
              <X size={20} />
            </button>

            <h3 className="text-body-lg font-body-lg font-bold text-on-surface mb-2">P2PK Public Key</h3>
            <p className="text-sm text-on-surface-variant text-center mb-6">Scan to copy public key for locked ecash</p>

            <div className="bg-white p-4 rounded-xl border border-outline-variant mb-6">
              <QRCode value={hexPubkey} size={200} />
            </div>

            <button
              onClick={handleCopyHex}
              className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary rounded-xl py-3 font-bold transition-opacity hover:opacity-90"
            >
              {copiedHex ? <Check size={18} /> : <Copy size={18} />}
              {copiedHex ? 'Copied' : 'Copy Hex Key'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
