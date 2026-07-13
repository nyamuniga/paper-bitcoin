import React from 'react';

interface TrustedMintsListProps {
  mintBalances: Record<string, number>;
}

export const TrustedMintsList: React.FC<TrustedMintsListProps> = ({ mintBalances }) => {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label-caps font-label-caps text-on-surface-variant tracking-widest">TRUSTED MINTS</h2>
      <div className="flex flex-col gap-2">
        {Object.entries(mintBalances).length === 0 ? (
          <div className="text-center text-on-surface-variant py-6 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">No mints connected yet</div>
        ) : (
          Object.entries(mintBalances).map(([mint, amt]) => (
            <div key={mint} className="bg-surface-container-high rounded-2xl p-3.5 md:p-4 flex justify-between items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-outline-variant/10 relative overflow-hidden group hover:bg-surface-container-highest transition-colors cursor-pointer">
              <div className="absolute inset-0 texture-overlay opacity-20"></div>
              <div className="flex items-center gap-3 relative z-10 min-w-0 mr-4">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-[12px] font-bold">{new URL(mint).hostname.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-body-md font-body-md text-on-surface truncate text-[14px]" title={mint}>{new URL(mint).hostname}</span>
              </div>
              <div className="flex items-baseline gap-1 relative z-10 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">{amt as React.ReactNode}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant text-[10px]">sats</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
