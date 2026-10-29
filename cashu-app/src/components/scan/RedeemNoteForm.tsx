import React, { useState } from 'react';
import { Loader2, Zap, Wallet, QrCode } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { readClipboardText } from '../../utils/clipboard';
import { getInvoiceAmountSats } from '../../services/lnurlService';

interface RedeemNoteFormProps {
  invoice: string;
  setInvoice: (val: string) => void;
  redeeming: boolean;
  onRedeem: () => void;
  noteAmount: number;
  redeemMethod: 'lightning' | 'wallet';
  setRedeemMethod: (method: 'lightning' | 'wallet') => void;
  hasExtraProofs: boolean;
  isSpent?: boolean;
}

export const RedeemNoteForm: React.FC<RedeemNoteFormProps> = ({ 
  invoice, setInvoice, redeeming, onRedeem, noteAmount, redeemMethod, setRedeemMethod, hasExtraProofs, isSpent
}) => {
  const [showScanner, setShowScanner] = useState(false);

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
              onClick={() => !isSpent && setRedeemMethod('wallet')}
              disabled={isSpent}
              className={`p-4 md:p-5 rounded-2xl border transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                isSpent
                  ? 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
                  : redeemMethod === 'wallet'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary cursor-pointer'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40 cursor-pointer'
              }`}
            >
              <Wallet size={20} className={isSpent ? 'text-on-surface-variant/40' : redeemMethod === 'wallet' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Local Wallet</div>
              <div className="text-[11px] opacity-80 leading-tight">Zero fees. Instant transfer.</div>
            </button>

            <button
              onClick={() => hasExtraProofs && !isSpent && setRedeemMethod('lightning')}
              disabled={!hasExtraProofs || isSpent}
              className={`p-4 md:p-5 rounded-2xl border transition-all duration-200 flex flex-col items-center text-center gap-2 relative group ${
                !hasExtraProofs || isSpent
                  ? 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
                  : redeemMethod === 'lightning'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary cursor-pointer'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40 cursor-pointer'
              }`}
            >
              <Zap size={20} className={!hasExtraProofs || isSpent ? 'text-on-surface-variant/40' : redeemMethod === 'lightning' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Lightning</div>
              <div className="text-[11px] opacity-80 leading-tight">Pay to external LN wallet.</div>
              {!hasExtraProofs && !isSpent && (
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
                    <button onClick={() => setShowScanner(false)} className="btn-gradient w-full py-4 rounded-2xl text-label-caps font-label-caps text-on-primary shadow-lg hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                      Cancel Scanner
                    </button>
                  </div>
                </div>
              )}
              <div className={`relative glow-effect rounded-xl transition-all duration-300 bg-[#0c1b14] border overflow-hidden flex flex-col ${
                isInvalidAmount
                  ? 'border-error/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : 'border-[#142d20] focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40'
              }`}>
                <textarea
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  disabled={isSpent}
                  className={`w-full bg-transparent text-on-surface font-label-caps text-label-caps p-3.5 pb-2 border-none focus:outline-none resize-none placeholder:text-on-surface-variant/50 min-h-[64px] ${isSpent ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="Paste lnbc..."
                  rows={2}
                  spellCheck="false"
                />

                {/* Action Toolbar */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-[#142d20]">
                  <div>
                    {invoice ? (
                      <button
                        type="button"
                        onClick={() => setInvoice('')}
                        disabled={isSpent}
                        className="text-[12px] font-bold text-on-surface-variant hover:text-error transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Clear
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await readClipboardText();
                            if (text) setInvoice(text.trim());
                          } catch (e) {
                            console.warn('Clipboard read failed', e);
                          }
                        }}
                        disabled={isSpent}
                        className="text-[12px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Paste
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => !isSpent && setShowScanner(true)}
                      disabled={isSpent}
                      className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all cursor-pointer border border-outline-variant/20 shadow-sm flex items-center justify-center disabled:opacity-50"
                      title="Scan QR Code"
                    >
                      <QrCode size={15} />
                    </button>
                  </div>
                </div>
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

          {isSpent && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/30 text-error text-center font-bold text-sm">
              ⚠️ This note has already been redeemed and the tokens are spent. It cannot be claimed again.
            </div>
          )}

          <button
            onClick={onRedeem}
            disabled={isSpent || redeeming || (redeemMethod === 'lightning' && (!invoice || isInvalidAmount))}
            className={`w-full btn-gradient py-4 rounded-2xl text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
              isSpent || redeeming || (redeemMethod === 'lightning' && (!invoice || isInvalidAmount)) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98] cursor-pointer'
            }`}
          >
            {redeeming ? <Loader2 className="animate-spin w-6 h-6" /> : isSpent ? 'Note Already Spent' : redeemMethod === 'wallet' ? 'Redeem to Wallet' : 'Pay to Invoice'}
          </button>
        </div>
    </div>
  );
};
