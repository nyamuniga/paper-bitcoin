import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

interface RedeemNoteFormProps {
  invoice: string;
  setInvoice: (val: string) => void;
  redeeming: boolean;
  redeemSuccess: boolean;
  error: string | null;
  onRedeem: () => void;
}

export const RedeemNoteForm: React.FC<RedeemNoteFormProps> = ({ 
  invoice, setInvoice, redeeming, redeemSuccess, error, onRedeem 
}) => {
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
          <div className="relative glow-effect rounded-lg">
            <textarea
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              className="w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none resize-none placeholder:text-on-surface-variant/50 h-[80px]"
              placeholder="Paste lnbc..."
              spellCheck="false"
            />
          </div>
          {error && <div className="text-error text-sm text-center">{error}</div>}
          <button
            onClick={onRedeem}
            disabled={redeeming || !invoice}
            className="w-full btn-gradient py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center disabled:opacity-50"
          >
            {redeeming ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay to Invoice'}
          </button>
        </div>
      )}
    </div>
  );
};
