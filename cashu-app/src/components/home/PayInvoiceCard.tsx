import React from 'react';
import { Loader2 } from 'lucide-react';

interface PayInvoiceCardProps {
  invoice: string;
  setInvoice: (val: string) => void;
  paying: boolean;
  onPay: () => void;
}

export const PayInvoiceCard: React.FC<PayInvoiceCardProps> = ({ 
  invoice, setInvoice, paying, onPay 
}) => {
  return (
    <section className="flex flex-col gap-2 mt-4 md:mt-0">
      <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Pay Lightning Invoice</h2>
      <div className="bg-surface-container-high rounded-xl p-6 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 flex flex-col gap-4">
        <div className="absolute inset-0 texture-overlay opacity-30"></div>
        <p className="text-body-md font-body-md text-on-surface-variant relative z-10">Pay any lightning invoice directly from your E-Cash balance.</p>
        <div className="relative z-10 flex flex-col gap-4">
          <div className="relative glow-effect transition-shadow duration-300 rounded-lg">
            <textarea 
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              className="w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none resize-none placeholder:text-on-surface-variant/50" 
              placeholder="lnbc..." 
              rows={2}
            />
          </div>
          <button 
            onClick={onPay}
            disabled={paying || !invoice}
            className="btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center disabled:opacity-50"
          >
            {paying ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay Invoice'}
          </button>
        </div>
      </div>
    </section>
  );
};
