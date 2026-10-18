import React, { useState } from 'react';
import { GraduationCap, ChevronDown, ExternalLink, Play, Coins } from 'lucide-react';

interface LearnSectionProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

const BITCOIN_VIDEO_URL = 'https://youtu.be/d7ID3fKAFQM';
const ECASH_VIDEO_URL = 'https://youtu.be/OHqxp-Hrx9k';

export const LearnSection: React.FC<LearnSectionProps> = ({
  isExpanded: isExpandedProp,
  onToggle,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const toggleExpanded = onToggle || (() => setInternalExpanded((prev) => !prev));

  const handleOpenUrl = async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden relative group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

      <div
        className="flex items-center justify-between p-4 md:p-6 relative z-10 cursor-pointer hover:bg-surface-container-highest transition-colors select-none"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <GraduationCap size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Learn</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">Educational guides & videos</p>
          </div>
        </div>

        <div className="text-on-surface-variant shrink-0 ml-3">
          <ChevronDown
            size={20}
            className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded ? 'rotate-180 text-primary' : 'text-on-surface-variant'
            }`}
          />
        </div>
      </div>

      <div className={isExpanded ? 'accordion-content-expand' : 'accordion-content-collapse'}>
        <div className={`accordion-inner-content ${isExpanded ? 'accordion-inner-content-open' : 'accordion-inner-content-closed'}`}>
          <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-outline-variant space-y-3 relative z-10">
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Explore short video explainers to understand how Bitcoin and Cashu eCash work.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* What is Bitcoin */}
              <button
                type="button"
                onClick={() => handleOpenUrl(BITCOIN_VIDEO_URL)}
                className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-surface-container-highest/70 hover:bg-surface-container-highest border border-outline-variant/60 hover:border-[#F7931A]/50 transition-all duration-200 cursor-pointer group/btn active:scale-[0.98] text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#F7931A]/15 border border-[#F7931A]/30 flex items-center justify-center text-[#F7931A] font-bold text-lg shrink-0 group-hover/btn:scale-105 transition-transform">
                    ₿
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block font-bold text-on-surface text-sm truncate group-hover/btn:text-primary transition-colors">
                      What is Bitcoin
                    </span>
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-1 mt-0.5">
                      <Play size={10} className="text-[#F7931A] fill-[#F7931A]/40" />
                      Watch Video
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-surface-container/60 flex items-center justify-center text-on-surface-variant group-hover/btn:text-primary group-hover/btn:bg-primary/10 transition-colors shrink-0 ml-2">
                  <ExternalLink size={15} />
                </div>
              </button>

              {/* What is eCash */}
              <button
                type="button"
                onClick={() => handleOpenUrl(ECASH_VIDEO_URL)}
                className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-surface-container-highest/70 hover:bg-surface-container-highest border border-outline-variant/60 hover:border-emerald-500/50 transition-all duration-200 cursor-pointer group/btn active:scale-[0.98] text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 group-hover/btn:scale-105 transition-transform">
                    <Coins size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block font-bold text-on-surface text-sm truncate group-hover/btn:text-primary transition-colors">
                      What is eCash
                    </span>
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-1 mt-0.5">
                      <Play size={10} className="text-emerald-400 fill-emerald-400/40" />
                      Watch Video
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-surface-container/60 flex items-center justify-center text-on-surface-variant group-hover/btn:text-primary group-hover/btn:bg-primary/10 transition-colors shrink-0 ml-2">
                  <ExternalLink size={15} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
