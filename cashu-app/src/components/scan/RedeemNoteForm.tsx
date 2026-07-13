import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

interface RedeemNoteFormProps {
  invoice: string;
  setInvoice: (val: string) => void;
  redeeming: boolean;
  redeemSuccess: boolean;
  error: string | null;
  onRedeem: () => void;
  noteAmount: number;
}

export const RedeemNoteForm: React.FC<RedeemNoteFormProps> = ({ 
  invoice, setInvoice, redeeming, redeemSuccess, error, onRedeem, noteAmount
}) => {
  const getInvoiceAmountSats = (inv: string): number | null => {
    try {
      const hrp = inv.toLowerCase().split('1')[0];
      if (!hrp) return null;
      const match = hrp.match(/^ln[a-z]+(\d+)([munp]?)$/);
      if (match) {
        let val = parseInt(match[1], 10);
        const mult = match[2];
        if (mult === 'm') val *= 100000;
        else if (mult === 'u') val *= 100;
        else if (mult === 'n') val *= 0.1;
        else if (mult === 'p') val *= 0.0001;
        else val *= 100000000;
        return Math.floor(val);
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  const invoiceAmount = getInvoiceAmountSats(invoice);
  const isZeroAmount = invoiceAmount === 0;
  const isInsufficient = invoiceAmount !== null && invoiceAmount > noteAmount;
  const isInvalidAmount = isInsufficient || isZeroAmount;

  return (
    <div className="pt-6 border-t border-outline-variant/20 mt-4">
      <h3 className="text-headline-lg-mobile text-lg font-headline-lg-mobile mb-4">Redeem to Lightning</h3>
      {redeemSuccess ? (
        <div className="text-center text-emerald-400 py-6 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <CheckCircle className="w-12 h-12 mx-auto mb-3" />
          <div className="font-bold text-lg">Successfully Redeemed!</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-2">
            <div className={`relative glow-effect rounded-lg ${isInvalidAmount ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
              <textarea
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 h-[80px] ${isInvalidAmount ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-primary'}`}
                placeholder="Paste lnbc..."
                spellCheck="false"
              />
            </div>
            {invoiceAmount !== null && (
              <div className={`text-[12px] font-label-caps px-1 ${isInvalidAmount ? 'text-error' : 'text-on-surface-variant'}`}>
                Invoice Amount: {invoiceAmount.toLocaleString()} sats
                {isInsufficient && ' (Exceeds note value)'}
                {isZeroAmount && ' (Amount must be greater than 0)'}
              </div>
            )}
          </div>
          {error && <div className="text-error text-sm text-center">{error}</div>}
          <button
            onClick={onRedeem}
            disabled={redeeming || !invoice || isInvalidAmount}
            className={`w-full btn-gradient py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
              redeeming || !invoice || isInvalidAmount ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {redeeming ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay to Invoice'}
          </button>
        </div>
      )}
    </div>
  );
};
