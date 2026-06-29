import React from 'react';

interface WalletBalanceCardProps {
  balance: number;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance }) => {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Wallet Balance</h2>
      <div className="bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 flex flex-col items-center justify-center min-h-[160px]">
        <div className="absolute inset-0 texture-overlay opacity-50"></div>
        <div className="relative z-10 flex items-baseline gap-2">
          <span className="text-display-lg font-display-lg text-primary tracking-tight">{balance}</span>
          <span className="text-label-caps font-label-caps text-on-surface-variant">sats</span>
        </div>
      </div>
    </section>
  );
};
