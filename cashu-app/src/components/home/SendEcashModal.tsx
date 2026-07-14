import React, { useState } from 'react';
import { X, Loader2, Copy, Check, Coins } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import QRCode from 'react-qr-code';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';

interface SendEcashModalProps {
  mintUrl: string;
  onClose: () => void;
}

export const SendEcashModal: React.FC<SendEcashModalProps> = ({ mintUrl, onClose }) => {
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const availableBalance = mintBalances[mintUrl] || 0;

  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(token || '', 150, 400);

  const parsedAmount = parseInt(amount) || 0;
  const isInsufficient = parsedAmount > availableBalance;
  const isValid = parsedAmount > 0 && !isInsufficient;

  const handleSend = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      const result = await invoke<string>('send_ecash', { mintUrl, amount: parsedAmount });
      setToken(result);
      refreshWallet();
    } catch (e: any) {
      toast.error(`Send failed: ${e}`);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
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
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Coins className="text-primary w-5 h-5" /> Send Ecash
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
          {/* Mint info */}
          <div className="flex flex-col gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              {token ? 'Ecash token created from:' : 'Send ecash token from:'}
            </p>
            <div className="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                <span className="text-body-md font-body-md text-on-surface font-medium truncate">{formatMintUrl(mintUrl)}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">₿{availableBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {token ? (
            /* Token display */
            <div className="flex flex-col items-center gap-5">
              {/* Amount confirmation */}
              <div className="text-center">
                <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">AMOUNT SENT</p>
                <p className="text-[28px] font-display-lg text-primary">₿{parsedAmount.toLocaleString()}</p>
              </div>

              {/* QR Code */}
              <div className="relative">
                <div className="bg-white p-4 rounded-xl shadow-lg relative">
                  <QRCode value={currentFrame || token} size={200} />
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
                  <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{token}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
                >
                  {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Token</>}
                </button>
              </div>
            </div>
          ) : (
            /* Amount input */
            <div className="flex flex-col gap-4">
              <div className="relative">
                <div className={`relative glow-effect transition-shadow duration-300 rounded-xl ${isInsufficient ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] font-bold">₿</div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`w-full bg-surface-container-lowest text-on-surface text-[22px] font-bold p-4 pl-10 rounded-xl border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none placeholder:text-on-surface-variant/30 ${isInsufficient ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-primary'}`}
                    placeholder="0"
                    min="1"
                  />
                </div>
                {isInsufficient && (
                  <p className="text-error text-[12px] font-label-caps mt-2 px-1">Insufficient balance</p>
                )}
              </div>

              <button 
                onClick={handleSend}
                disabled={sending || !isValid}
                className={`btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
                  sending || !isValid ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                }`}
              >
                {sending ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Token'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
