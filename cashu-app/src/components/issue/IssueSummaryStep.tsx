import React from 'react';
import { Loader2, ChevronLeft, Gauge, Shield, Coins, Globe, Wallet, Zap } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';

interface IssueSummaryStepProps {
  sats: string;
  mintUrls: string[];
  strategy: 'dynamic' | 'static';
  setStrategy: (strategy: 'dynamic' | 'static') => void;
  fundMethod: 'lightning' | 'wallet';
  setFundMethod: (method: 'lightning' | 'wallet') => void;
  loading: boolean;
  onIssue: () => void;
  onBack: () => void;
  error: string;
  debugLogs: string[];
}

export const IssueSummaryStep: React.FC<IssueSummaryStepProps> = ({
  sats, mintUrls, strategy, setStrategy, fundMethod, setFundMethod, loading, onIssue, onBack, error, debugLogs
}) => {
  const amount = parseInt(sats) || 0;

  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding py-6 flex flex-col">
      <PageHeader title="Confirm & Create" subtitle="Step 3 of 3" />

      <div className="flex-1 flex flex-col gap-6">
        {/* Summary card */}
        <div className="bg-surface-container-high rounded-2xl p-6 relative overflow-hidden border border-outline-variant/20">
          <div className="absolute inset-0 texture-overlay opacity-30"></div>
          <div className="relative z-10 flex flex-col gap-5">
            {/* Amount */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Coins size={18} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">AMOUNT</p>
                <p className="text-[22px] font-headline-lg-mobile text-on-surface">₿{amount.toLocaleString()}</p>
              </div>
            </div>

            <div className="divider-dashed"></div>

            {/* Mints */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Globe size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] tracking-widest mb-2">MINTS ({mintUrls.length})</p>
                <div className="flex flex-col gap-3">
                  {mintUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <MintIcon mintUrl={url} className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 flex-shrink-0" textClassName="text-primary text-[12px] font-bold" />
                      <span className="text-body-md font-body-md text-on-surface text-[14px] font-medium truncate" title={url}>
                        {formatMintUrl(url)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Funding method */}
        <div>
          <label className="block text-label-caps font-label-caps text-on-surface-variant tracking-widest mb-3">FUNDING METHOD</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFundMethod('lightning')}
              className={`p-4 md:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                fundMethod === 'lightning'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
              }`}
            >
              <Zap size={20} className={fundMethod === 'lightning' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Lightning</div>
              <div className="text-[11px] opacity-80 leading-tight">Pay from external wallet.</div>
            </button>
            <button
              onClick={() => setFundMethod('wallet')}
              className={`p-4 md:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                fundMethod === 'wallet'
                  ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-emerald-500'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
              }`}
            >
              <Wallet size={20} className={fundMethod === 'wallet' ? 'text-emerald-500' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Local Wallet</div>
              <div className="text-[11px] opacity-80 leading-tight">Use eCash balance.</div>
            </button>
          </div>
        </div>

        {/* Strategy selection */}
        <div>
          <label className="block text-label-caps font-label-caps text-on-surface-variant tracking-widest mb-3 mt-2">FEE RESERVE STRATEGY</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStrategy('dynamic')}
              className={`p-4 md:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                strategy === 'dynamic'
                  ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
              }`}
            >
              <Gauge size={20} className={strategy === 'dynamic' ? 'text-primary' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Dynamic</div>
              <div className="text-[11px] opacity-80 leading-tight">Cheaper fees. Best for immediate use.</div>
            </button>
            <button
              onClick={() => setStrategy('static')}
              className={`p-4 md:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center gap-2 ${
                strategy === 'static'
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-amber-500'
                  : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
              }`}
            >
              <Shield size={20} className={strategy === 'static' ? 'text-amber-500' : 'text-on-surface-variant'} />
              <div className="font-bold text-[14px]">Static</div>
              <div className="text-[11px] opacity-80 leading-tight">Safer reserves. Best for cold storage.</div>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="text-error text-sm text-center bg-error/10 p-3 rounded-xl border border-error/20">{error}</div>}

        {/* Debug logs */}
        {debugLogs.length > 0 && (
          <div className="bg-surface-container-lowest p-4 rounded-xl text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto border border-outline-variant/30 shadow-inner">
            {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="grid grid-cols-2 gap-3 mt-8">
        <button
          onClick={onBack}
          disabled={loading}
          className="py-4 rounded-full bg-surface-container-high text-on-surface font-bold text-[16px] border border-outline-variant/30 hover:bg-surface-container-highest active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <ChevronLeft size={20} />
          Back
        </button>
        <button
          onClick={onIssue}
          disabled={loading}
          className="py-4 rounded-full btn-gradient text-on-primary font-bold text-[16px] shadow-lg hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Create Note'}
        </button>
      </div>
    </main>
  );
};
