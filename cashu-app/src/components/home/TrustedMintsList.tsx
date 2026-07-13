import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Zap, Coins } from 'lucide-react';
import { SendEcashModal } from './SendEcashModal';

interface TrustedMintsListProps {
  mintBalances: Record<string, number>;
  showAll?: boolean;
}

export const TrustedMintsList: React.FC<TrustedMintsListProps> = ({ mintBalances, showAll = false }) => {
  const navigate = useNavigate();
  const sortedMints = Object.entries(mintBalances).sort((a, b) => b[1] - a[1]);
  const displayMints = showAll ? sortedMints : sortedMints.slice(0, 6);

  const [revealedMint, setRevealedMint] = useState<string | null>(null);
  const [ecashMint, setEcashMint] = useState<string | null>(null);

  const toggleReveal = (mint: string) => {
    if (revealedMint === mint) {
      setRevealedMint(null);
    } else {
      setRevealedMint(mint);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant tracking-widest">TRUSTED MINTS</h2>
        {!showAll && sortedMints.length > 0 && (
          <Link to="/mints" className="text-label-caps font-label-caps text-primary hover:opacity-80 transition-opacity flex items-center gap-1">
            VIEW ALL
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2 overflow-hidden px-1 -mx-1 py-1 -my-1">
        {sortedMints.length === 0 ? (
          <div className="text-center text-on-surface-variant py-6 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">No mints connected yet</div>
        ) : (
          displayMints.map(([mint, amt], index) => {
            const isRevealed = revealedMint === mint;
            return (
              <div 
                key={mint} 
                className={`relative rounded-2xl overflow-hidden ${!showAll && index >= 3 ? 'hidden md:block' : 'block'}`}
              >
                {/* Background Action Buttons */}
                <div className="absolute inset-y-0 left-0 w-36 flex items-center justify-center gap-3 px-3">
                  <button 
                    onClick={(e) => { e.stopPropagation(); navigate('/pay', { state: { mintUrl: mint } }); }}
                    className="flex flex-col items-center justify-center text-amber-500 hover:text-amber-400 hover:scale-105 active:scale-95 transition-all duration-200 gap-1"
                  >
                    <Zap className="w-5 h-5" />
                    <span className="text-[10px] font-label-caps uppercase tracking-wider">Pay</span>
                  </button>
                  <div className="w-px h-8 bg-outline-variant/20"></div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEcashMint(mint); setRevealedMint(null); }}
                    className="flex flex-col items-center justify-center text-primary hover:text-primary/80 hover:scale-105 active:scale-95 transition-all duration-200 gap-1"
                  >
                    <Coins className="w-5 h-5" />
                    <span className="text-[10px] font-label-caps uppercase tracking-wider">Ecash</span>
                  </button>
                </div>

                {/* Foreground Card */}
                <div 
                  onClick={() => toggleReveal(mint)}
                  className={`bg-surface-container-high rounded-2xl p-3.5 md:p-4 flex justify-between items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-outline-variant/10 relative group hover:bg-surface-container-highest transition-all duration-300 cursor-pointer ${isRevealed ? 'translate-x-36' : 'translate-x-0'}`}
                >
                  <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
                  <div className="flex items-center gap-3 relative z-10 min-w-0 mr-4 pointer-events-none">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-[12px] font-bold">{new URL(mint).hostname.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-body-md font-body-md text-on-surface truncate text-[14px]" title={mint}>{new URL(mint).hostname}</span>
                  </div>
                  <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
                    <span className="text-body-md font-body-md font-semibold text-on-surface">₿{amt.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {ecashMint && (
        <SendEcashModal
          mintUrl={ecashMint}
          onClose={() => setEcashMint(null)}
        />
      )}
    </section>
  );
};
