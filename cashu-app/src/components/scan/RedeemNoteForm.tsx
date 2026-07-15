import React, { useState } from 'react';
import { Loader2, Zap, Wallet, QrCode } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';

interface RedeemNoteFormProps {
  invoice: string;
  setInvoice: (val: string) => void;
  redeeming: boolean;
  onRedeem: () => void;
  noteAmount: number;
  redeemMethod: 'lightning' | 'wallet';
  setRedeemMethod: (method: 'lightning' | 'wallet') => void;
  hasExtraProofs: boolean;
}

export const RedeemNoteForm: React.FC<RedeemNoteFormProps> = ({ 
  invoice, setInvoice, redeeming, onRedeem, noteAmount, redeemMethod, setRedeemMethod, hasExtraProofs
}) => {
  const [showScanner, setShowScanner] = useState(false);

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

  // Ensure redeemMethod is wallet if we don't have extra proofs
  React.useEffect(() => {
    if (!hasExtraProofs && redeemMethod === 'lightning') {
      setRedeemMethod('wallet');
    }
  }, [hasExtraProofs, redeemMethod, setRedeemMethod]);

  return (
    <div className="pt-6 border-t border-outline-variant/20 mt-4">
      <h3 className="text-headline-lg-mobile text-lg font-headline-lg-mobile mb-4">Redeem Options</h3>
      <div className="flex flex-col gap-4">
          <label className="block text-label-caps font-label-caps text-on-surface-variant tracking-widest mt-2">REDEEM METHOD</label>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <button
              onClick={() => setRedeemMethod('wallet')}
              className={`p-4 md:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                redeemMethod === 'wallet'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
              }`}
            >
              <Wallet size={20} className={redeemMethod === 'wallet' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Local Wallet</div>
              <div className="text-[11px] opacity-80 leading-tight">Zero fees. Instant transfer.</div>
            </button>

            <button
              onClick={() => hasExtraProofs && setRedeemMethod('lightning')}
              disabled={!hasExtraProofs}
              className={`p-4 md:p-5 rounded-2xl border transition-all duration-200 flex flex-col items-center text-center gap-2 relative group ${
                !hasExtraProofs
                  ? 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
                  : redeemMethod === 'lightning'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary cursor-pointer'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40 cursor-pointer'
              }`}
            >
              <Zap size={20} className={!hasExtraProofs ? 'text-on-surface-variant/40' : redeemMethod === 'lightning' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Lightning</div>
              <div className="text-[11px] opacity-80 leading-tight">Pay to external LN wallet.</div>
              {!hasExtraProofs && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[180px] bg-surface-container-highest text-on-surface text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10 border border-outline-variant/20">
                  This note doesn't contain enough routing fees for Lightning payments.
                </div>
              )}
            </button>
          </div>

          {redeemMethod === 'lightning' && (
            <div className="relative flex flex-col gap-2">
              {showScanner && (
                <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
                  <div className="w-full max-w-md flex flex-col gap-6">
                    <div className="rounded-2xl overflow-hidden border-2 border-primary relative shadow-[0_0_30px_rgba(255,184,116,0.3)] aspect-square bg-black">
                      <Scanner 
                        onScan={(result) => {
                          if (result && result.length > 0) {
                            setInvoice(result[0].rawValue);
                            setShowScanner(false);
                          }
                        }} 
                        onError={(e) => console.error(e)}
                      />
                    </div>
                    <button onClick={() => setShowScanner(false)} className="btn-gradient w-full py-4 rounded-full text-label-caps font-label-caps text-on-primary shadow-lg hover:opacity-90 active:scale-[0.98] transition-all">
                      Cancel Scanner
                    </button>
                  </div>
                </div>
              )}
              <div className={`relative glow-effect rounded-lg ${isInvalidAmount ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
                <textarea
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 pr-12 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 h-[80px] ${isInvalidAmount ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-primary'}`}
                  placeholder="Paste lnbc..."
                  spellCheck="false"
                />
                <button 
                  onClick={() => setShowScanner(true)}
                  className="absolute right-3 top-3 p-2 bg-surface-container-highest rounded-lg text-primary hover:bg-surface-bright transition-colors"
                  title="Scan QR Code"
                >
                  <QrCode size={20} />
                </button>
              </div>
              {invoiceAmount !== null && !showScanner && (
                <div className={`text-[12px] font-label-caps px-1 ${isInvalidAmount ? 'text-error' : 'text-on-surface-variant'}`}>
                  Invoice Amount: ₿{invoiceAmount.toLocaleString()}
                  {isInsufficient && ' (Exceeds note value)'}
                  {isZeroAmount && ' (Amount must be greater than 0)'}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onRedeem}
            disabled={redeeming || (redeemMethod === 'lightning' && (!invoice || isInvalidAmount))}
            className={`w-full btn-gradient py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
              redeeming || (redeemMethod === 'lightning' && (!invoice || isInvalidAmount)) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {redeeming ? <Loader2 className="animate-spin w-6 h-6" /> : redeemMethod === 'wallet' ? 'Redeem to Wallet' : 'Pay to Invoice'}
          </button>
        </div>
    </div>
  );
};
