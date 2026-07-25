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
      <section className="bg-surface-container-high rounded-xl border border-outline-variant/30 overflow-hidden">
        <div
          className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-highest transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
              <Lock size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1 truncate">Locked Ecash (P2PK)</h2>
              <p className="text-sm text-on-surface-variant truncate">Receive tokens that are locked to your public key.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-on-surface-variant shrink-0">
              {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-6 pb-6 pt-2 border-t border-outline-variant/10 flex flex-col gap-4">
            {hexPubkey && (
              <div className="bg-surface-container-low  p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-label-caps text-on-surface-variant mb-1">YOUR PUBKEY (HEX)</p>
                  <p className="text-body-md font-mono text-on-surface truncate">{hexPubkey}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyHex}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
                  >
                    {copiedHex ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                  <button
                    onClick={() => setShowQr(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <QrCode size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-high rounded-2xl w-full max-w-sm border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative">
            <div className="flex justify-between items-center p-4 border-b border-outline-variant/10">
              <h2 className="text-title-md font-title-md text-on-surface">Receive Locked Ecash</h2>
              <button
                onClick={() => setShowQr(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-8 flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-xl shadow-md">
                <QRCode value={hexPubkey} size={220} />
              </div>
              <p className="text-center text-body-sm text-on-surface-variant">
                Scan this QR code to send locked ecash to this wallet.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
