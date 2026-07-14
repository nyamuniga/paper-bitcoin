import React, { useState } from 'react';
import { X, Loader2, Zap } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';

interface PayInvoiceModalProps {
  mintUrl: string;
  onClose: () => void;
}

export const PayInvoiceModal: React.FC<PayInvoiceModalProps> = ({ mintUrl, onClose }) => {
  const [invoice, setInvoice] = useState('');
  const [paying, setPaying] = useState(false);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const availableBalance = mintBalances[mintUrl] || 0;

  const getInvoiceAmountSats = (inv: string): number | null => {
    try {
      const hrp = inv.toLowerCase().split('1')[0];
      if (!hrp) return null;
      // match prefix (e.g., lnbc), amount (digits), optional multiplier (m, u, n, p)
      const match = hrp.match(/^ln[a-z]+(\d+)([munp]?)$/);
      if (match) {
        let val = parseInt(match[1], 10);
        const mult = match[2];
        if (mult === 'm') val *= 100000;
        else if (mult === 'u') val *= 100;
        else if (mult === 'n') val *= 0.1;
        else if (mult === 'p') val *= 0.0001;
        else val *= 100000000; // No multiplier means full BTC
        return Math.floor(val);
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  const invoiceAmount = getInvoiceAmountSats(invoice);
  const isInsufficient = invoiceAmount !== null && invoiceAmount > availableBalance;

  const handlePay = async () => {
    if (!invoice || isInsufficient) return;
    setPaying(true);
    try {
      await invoke('pay_invoice', { invoice, mintUrl });
      toast.success('Invoice paid successfully!');
      refreshWallet();
      onClose();
    } catch (e: any) {
      toast.error(`Payment failed: ${e}`);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Zap className="text-amber-400 w-5 h-5" /> Pay Invoice
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10">
          <div className="flex flex-col gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              Pay lightning invoice using balance from:
            </p>
            <div className="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                <span className="text-body-md font-body-md text-on-surface font-medium truncate">{formatMintUrl(mintUrl)}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">{availableBalance.toLocaleString()}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant text-[10px]">₿</span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col gap-2">
            <div className={`relative glow-effect transition-shadow duration-300 rounded-lg ${isInsufficient ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
              <textarea 
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 ${isInsufficient ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-primary'}`} 
                placeholder="lnbc..." 
                rows={3}
              />
            </div>
            {invoiceAmount !== null && (
              <div className={`text-[12px] font-label-caps px-1 ${isInsufficient ? 'text-error' : 'text-on-surface-variant'}`}>
                Invoice Amount: ₿{invoiceAmount.toLocaleString()}
                {isInsufficient && ' (Insufficient balance)'}
              </div>
            )}
          </div>

          <button 
            onClick={handlePay}
            disabled={paying || !invoice || isInsufficient}
            className={`btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
              paying || !invoice || isInsufficient ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {paying ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};
