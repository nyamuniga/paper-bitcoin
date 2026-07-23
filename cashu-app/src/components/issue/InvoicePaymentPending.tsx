import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import QRCode from 'react-qr-code';
import { useWalletStore } from '../../store/wallet';
import { useBitcoin } from '../../hooks/useBitcoin';

interface InvoicePaymentPendingProps {
  invoicePayload: any;
  loading: boolean;
  onCheckStatus: () => void;
  error: string;
  onError: (err: string) => void;
  debugLogs: string[];
}

export const InvoicePaymentPending: React.FC<InvoicePaymentPendingProps> = ({ 
  invoicePayload, 
  loading, 
  onCheckStatus, 
  error, 
  onError, 
  debugLogs 
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const balance = useWalletStore((s) => s.balanceSats);
  const { paying, payInvoice } = useBitcoin();

  const handlePayFromWallet = async () => {
    setInternalLoading(true);
    const success = await payInvoice(invoicePayload.invoice);
    if (!success) {
      onError("Payment failed");
      setInternalLoading(false);
    }
  };

  const isLoading = loading || internalLoading || paying;

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-6">
        <PageHeader title="Pay Invoice" />
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6 items-center text-center">
        <div className="noise-overlay"></div>
        <div className="relative z-10 flex flex-col space-y-6 w-full items-center">
          <p className="text-on-surface-variant mb-2 font-label-caps text-label-caps">Pay this invoice to fund the new note</p>
          <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
            <QRCode value={invoicePayload.invoice} size={200} />
          </div>
          <div className="text-headline-lg font-headline-lg text-primary">₿{invoicePayload.total_sats}</div>
          <div className="text-xs text-on-surface-variant mb-2 truncate w-full max-w-sm px-4 py-3 bg-surface-container-lowest rounded-lg border border-outline-variant/30 select-all shadow-inner">{invoicePayload.invoice}</div>

          {balance >= invoicePayload.total_sats ? (
            <button onClick={handlePayFromWallet} disabled={isLoading} className="w-full max-w-md bg-emerald-500/20 text-emerald-400 font-bold py-4 rounded-full text-lg flex justify-center items-center hover:bg-emerald-500/30 transition-colors border border-emerald-500/30 disabled:opacity-50 mt-4">
              {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay from Wallet Balance'}
            </button>
          ) : (
            <div className="text-error text-sm mt-4 bg-error/10 py-3 px-4 rounded-lg border border-error/20 w-full max-w-md font-label-caps text-label-caps">Insufficient wallet balance to auto-pay</div>
          )}

          <button onClick={onCheckStatus} disabled={isLoading} className="w-full max-w-md bg-primary/20 text-primary font-bold py-4 rounded-full text-lg flex justify-center items-center hover:bg-primary/30 transition-colors border border-primary/30 disabled:opacity-50 mt-2">
            {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Check Payment Status'}
          </button>

          {isLoading && <div className="mt-4 text-sm text-on-surface-variant flex items-center justify-center font-label-caps text-label-caps"><Loader2 className="animate-spin w-4 h-4 mr-2" /> Waiting for payment...</div>}

          {error && <div className="text-error text-sm mt-4 p-4 bg-error/10 rounded-xl text-left font-mono w-full border border-error/20">{error}</div>}
          {debugLogs.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl mt-4 text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto text-left w-full border border-outline-variant/30 shadow-inner">
              {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
