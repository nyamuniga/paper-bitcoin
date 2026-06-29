import React from 'react';

interface TrustedMintsListProps {
  mintBalances: Record<string, number>;
}

export const TrustedMintsList: React.FC<TrustedMintsListProps> = ({ mintBalances }) => {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Trusted Mints</h2>
      <div className="flex flex-col gap-2">
        {Object.entries(mintBalances).length === 0 ? (
          <div className="text-center text-on-surface-variant py-4 bg-surface-container-high rounded-xl border border-outline-variant/10">No mints connected yet</div>
        ) : (
          Object.entries(mintBalances).map(([mint, amt]) => (
            <div key={mint} className="bg-surface-container-high rounded-xl p-4 flex justify-between items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-outline-variant/10 relative overflow-hidden group hover:bg-surface-container-highest transition-colors cursor-pointer">
              <div className="absolute inset-0 texture-overlay opacity-20"></div>
              <span className="text-body-md font-body-md text-on-surface relative z-10 truncate mr-4" title={mint}>{new URL(mint).hostname}</span>
              <div className="flex items-baseline gap-1 relative z-10 whitespace-nowrap">
                <span className="text-headline-lg-mobile text-[20px] font-headline-lg-mobile text-on-surface">{amt as React.ReactNode}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant">sats</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
