import React, { useState } from 'react';
import { Loader2, Copy, Check, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import QRCode from 'react-qr-code';
import { toast } from 'react-hot-toast';
import { writeClipboardText } from '../../utils/clipboard';

interface InvoicePaymentPendingProps {
  invoicePayload: any;
  loading: boolean;
  onCheckStatus: () => void;
  error: string;
  onError: (err: string) => void;
  debugLogs: string[];
  onCancel?: () => void;
}

export const InvoicePaymentPending: React.FC<InvoicePaymentPendingProps> = ({ 
  invoicePayload, 
  loading, 
  onCheckStatus, 
  error, 
  debugLogs,
  onCancel
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyInvoice = async () => {
    if (!invoicePayload?.invoice) return;
    try {
      await writeClipboardText(invoicePayload.invoice);
      setCopied(true);
      toast.success('Invoice copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy invoice');
    }
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader title="Pay Lightning Invoice" subtitle="Scan with an external Lightning wallet" />

      <div className="w-full max-w-2xl mx-auto bg-surface-container-high rounded-2xl p-8 relative overflow-hidden shadow-xl border border-outline-variant flex flex-col space-y-6 items-center text-center">
        <div className="noise-overlay pointer-events-none"></div>
        <div className="relative z-10 flex flex-col space-y-6 w-full items-center">
          <p className="text-on-surface-variant font-label-caps text-label-caps">
            Pay this invoice from an external wallet (Phoenix, Strike, CashApp, etc.) to fund the note
          </p>

          <div className="bg-white p-4 rounded-2xl inline-block shadow-2xl border border-primary/20 relative group">
            <QRCode value={invoicePayload.invoice} size={200} />
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-label-caps font-label-caps text-on-surface-variant">INVOICE AMOUNT</span>
            <div className="text-headline-lg font-headline-lg text-primary font-mono">
              ₿{invoicePayload.total_sats?.toLocaleString()}
            </div>
          </div>

          {/* Copy invoice box */}
          <div className="w-full max-w-md flex flex-col gap-2">
            <div 
              onClick={handleCopyInvoice}
              className="text-xs font-mono text-on-surface-variant truncate w-full px-4 py-3 bg-surface-container-lowest rounded-xl border border-outline-variant select-all shadow-inner cursor-pointer hover:border-primary/40 transition-colors"
              title="Click to copy"
            >
              {invoicePayload.invoice}
            </div>

            <button
              type="button"
              onClick={handleCopyInvoice}
              className="btn-secondary w-full py-2.5 rounded-xl font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-secondary" />
                  <span className="text-secondary font-bold">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Lightning Invoice</span>
                </>
              )}
            </button>
          </div>

          {/* Check payment status button */}
          <button 
            onClick={onCheckStatus} 
            disabled={loading} 
            className="btn-primary w-full max-w-md py-4 rounded-xl text-base font-semibold flex justify-center items-center disabled:opacity-50 mt-2 cursor-pointer transition-all shadow-lg"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : null}
            {loading ? 'Checking status...' : 'Check Payment Status'}
          </button>

          {/* Status feedback */}
          {loading && (
            <div className="text-xs text-on-surface-variant flex items-center justify-center font-label-caps text-label-caps animate-pulse">
              <Loader2 className="animate-spin w-4 h-4 mr-2 text-primary" />
              Waiting for Lightning payment to settle...
            </div>
          )}

          {/* Cancel / back button */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer py-1 mt-2"
            >
              <ArrowLeft size={13} />
              <span>Cancel & Choose Different Funding Method</span>
            </button>
          )}

          {error && (
            <div className="text-error text-xs p-4 bg-error/10 rounded-xl text-left font-mono w-full max-w-md border border-error/20">
              {error}
            </div>
          )}

          {debugLogs.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto text-left w-full max-w-md border border-outline-variant shadow-inner">
              {debugLogs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
