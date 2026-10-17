import { Loader2, Gauge, Shield, Coins, Wallet, Zap } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';

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
}

export const IssueSummaryStep: React.FC<IssueSummaryStepProps> = ({
  sats, mintUrls, strategy, setStrategy, fundMethod, setFundMethod, loading, onIssue, onBack
}) => {
  const amount = parseInt(sats) || 0;

  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding pt-6 pb-0 -mb-8 flex flex-col">
      <PageHeader title="Confirm & Create" subtitle="Step 3 of 3" onBack={onBack} />

      <div className="flex-1 flex flex-col gap-6 pb-6">
        {/* Unified Card: Amount, Mint, Funding Method, Strategy */}
        <div className="bg-[#0c1b14] rounded-2xl sm:rounded-[28px] p-5 sm:p-6 relative overflow-hidden border border-[#142d20] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div className="relative z-10 flex flex-col gap-5">

            {/* 1. Centered Hero: Coins Icon + Amount + Badge */}
            <div className="flex flex-col items-center text-center pt-1">
              {/* Visual Icon Badge */}
              <div className="w-14 h-14 rounded-full flex items-center justify-center border mb-3 shadow-md bg-[#10241b] border-[#1e3c2e] text-primary">
                <Coins className="w-7 h-7 stroke-[2.25] text-primary" />
              </div>

              {/* Hero Amount */}
              <div className="flex items-baseline justify-center">
                <span className="font-display-hero text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  ₿{amount.toLocaleString()}
                </span>
              </div>

              {/* Physical Note Badge */}
              <div className="mt-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-sm bg-primary/10 border-primary/25 text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Physical Note
                </span>
              </div>
            </div>

            <div className="border-b border-[rgba(247,244,235,0.06)]"></div>

            {/* 2. Target Mints */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-mono font-bold tracking-widest text-[#627d70] uppercase">
                TARGET MINT{mintUrls.length > 1 ? `S (${mintUrls.length})` : ''}
              </span>
              <div className="flex flex-col gap-2">
                {mintUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#10241b]/60 border border-[#1a3828]">
                    <MintIcon 
                      mintUrl={url} 
                      className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0" 
                      textClassName="text-primary text-[11px] font-bold" 
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <MintName 
                        mintUrl={url} 
                        className="text-body-md font-semibold text-white truncate" 
                      />
                      <span className="font-mono text-[11px] text-[#627d70] truncate">{formatMintUrl(url)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-[rgba(247,244,235,0.06)]"></div>

            {/* 3. Funding Method */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono font-bold tracking-widest text-[#627d70] uppercase">
                FUNDING METHOD
              </span>
              <div className="bg-[#10241b]/70 border border-[#1a3828] rounded-2xl p-3 flex flex-col gap-2.5">
                {/* Segmented Switch */}
                <div className="bg-[#081710] p-1 rounded-xl flex items-center border border-[#183626]">
                  <button
                    type="button"
                    onClick={() => setFundMethod('lightning')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-display-hero text-[13px] sm:text-[14px] font-bold transition-all cursor-pointer ${
                      fundMethod === 'lightning'
                        ? 'bg-[#153a27] text-white border border-primary/50 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_12px_rgba(242,169,59,0.15)]'
                        : 'text-[#8b9e94] hover:text-[#f7f4eb] border border-transparent'
                    }`}
                  >
                    <Zap size={15} className={fundMethod === 'lightning' ? 'text-primary fill-primary/20' : 'text-[#8b9e94]'} />
                    Lightning
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundMethod('wallet')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-display-hero text-[13px] sm:text-[14px] font-bold transition-all cursor-pointer ${
                      fundMethod === 'wallet'
                        ? 'bg-[#153a27] text-white border border-primary/50 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_12px_rgba(242,169,59,0.15)]'
                        : 'text-[#8b9e94] hover:text-[#f7f4eb] border border-transparent'
                    }`}
                  >
                    <Wallet size={15} className={fundMethod === 'wallet' ? 'text-primary' : 'text-[#8b9e94]'} />
                    Local Wallet
                  </button>
                </div>

                {/* Active Description */}
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                  <p className="text-[12px] text-[#8b9e94] font-sans leading-snug">
                    {fundMethod === 'lightning'
                      ? 'Pay note invoice using any external Lightning wallet.'
                      : 'Deduct amount directly from your current eCash balance.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-b border-[rgba(247,244,235,0.06)]"></div>

            {/* 4. Strategy Selection */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono font-bold tracking-widest text-[#627d70] uppercase">
                FEE RESERVE STRATEGY
              </span>
              <div className="bg-[#10241b]/70 border border-[#1a3828] rounded-2xl p-3 flex flex-col gap-2.5">
                {/* Segmented Switch */}
                <div className="bg-[#081710] p-1 rounded-xl flex items-center border border-[#183626]">
                  <button
                    type="button"
                    onClick={() => setStrategy('dynamic')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-display-hero text-[13px] sm:text-[14px] font-bold transition-all cursor-pointer ${
                      strategy === 'dynamic'
                        ? 'bg-[#153a27] text-white border border-primary/50 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_12px_rgba(242,169,59,0.15)]'
                        : 'text-[#8b9e94] hover:text-[#f7f4eb] border border-transparent'
                    }`}
                  >
                    <Gauge size={15} className={strategy === 'dynamic' ? 'text-primary' : 'text-[#8b9e94]'} />
                    Dynamic
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategy('static')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-display-hero text-[13px] sm:text-[14px] font-bold transition-all cursor-pointer ${
                      strategy === 'static'
                        ? 'bg-[#153a27] text-white border border-primary/50 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_12px_rgba(242,169,59,0.15)]'
                        : 'text-[#8b9e94] hover:text-[#f7f4eb] border border-transparent'
                    }`}
                  >
                    <Shield size={15} className={strategy === 'static' ? 'text-primary' : 'text-[#8b9e94]'} />
                    Static
                  </button>
                </div>

                {/* Active Description */}
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                  <p className="text-[12px] text-[#8b9e94] font-sans leading-snug">
                    {strategy === 'dynamic'
                      ? 'Lower fee reserve. Adapts to network fees, best for regular or immediate use.'
                      : 'Full fee reserve. Guarantees redemption anytime, recommended for cold storage.'}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Sticky Bottom Navigation */}
      <div className="sticky bottom-0 z-30 mt-auto bg-[#06110c]/95 backdrop-blur-md -mx-container-padding px-container-padding md:-mx-10 md:px-10 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[rgba(247,244,235,0.08)] shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <button
          onClick={onIssue}
          disabled={loading}
          className="w-full py-3.5 sm:py-4 rounded-2xl btn-gradient text-[#06110c] font-extrabold text-[15px] sm:text-[16px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? <Loader2 className="animate-spin w-5 h-5 text-[#06110c]" /> : 'Create Note'}
        </button>
      </div>
    </main>
  );
};
