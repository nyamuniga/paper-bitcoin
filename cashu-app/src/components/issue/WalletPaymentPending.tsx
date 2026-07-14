import React from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';

interface WalletPaymentPendingProps {
  invoicePayload: any;
  error: string;
  debugLogs: string[];
}

export const WalletPaymentPending: React.FC<WalletPaymentPendingProps> = ({ 
  invoicePayload, 
  error, 
  debugLogs 
}) => {
  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-6">
        <PageHeader title="Funding Note" />
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6 items-center text-center">
        <div className="noise-overlay"></div>
        <div className="relative z-10 flex flex-col space-y-6 w-full items-center">
          
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2">
            <Wallet size={32} className="text-emerald-400" />
          </div>

          <div className="text-headline-lg font-headline-lg text-emerald-400">₿{invoicePayload.total_sats}</div>
          <p className="text-on-surface-variant mb-6 font-label-caps text-label-caps">Paying from Local Wallet Balance...</p>
          
          {!error && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin w-8 h-8 text-emerald-400" />
              <span className="text-body-md font-body-md text-emerald-400/80">Processing transaction</span>
            </div>
          )}

          {error && <div className="text-error text-sm mt-4 p-4 bg-error/10 rounded-xl text-left font-mono w-full border border-error/20">{error}</div>}
          
          {debugLogs.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl mt-8 text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto text-left w-full border border-outline-variant/30 shadow-inner">
              {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
