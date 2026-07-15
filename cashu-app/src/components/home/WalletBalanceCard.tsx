import React from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, Send } from 'lucide-react';

interface WalletBalanceCardProps {
  balance: number;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance }) => {
  return (
    <section className="flex flex-col gap-4 md:gap-5">
      {/* Balance display */}
      <div className="bg-surface-container-high rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 flex flex-col items-center justify-center min-h-[140px] md:min-h-[200px]">
        <div className="absolute inset-0 texture-overlay opacity-50"></div>
        <span className="text-label-caps font-label-caps text-on-surface-variant tracking-widest mb-2 relative z-10">BALANCE</span>
        <div className="relative z-10 flex items-baseline gap-2">
          <span className="text-[48px] md:text-[64px] leading-none font-display-lg text-on-surface tracking-tight">₿{balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Action buttons — prominent on mobile, also visible on desktop */}
      <div className="grid grid-cols-2 gap-3">
        <Link 
          to="/scan" 
          className="flex items-center justify-center gap-2 md:gap-3 py-3.5 md:py-4 px-4 md:px-6 rounded-2xl bg-primary text-on-primary font-headline-lg-mobile text-[15px] md:text-[16px] shadow-[0_4px_20px_rgba(212,157,66,0.3)] hover:opacity-90 active:scale-[0.97] transition-all duration-200"
        >
          <ScanLine size={20} />
          <span>Scan</span>
        </Link>
        <Link 
          to="/issue" 
          className="flex items-center justify-center gap-2 md:gap-3 py-3.5 md:py-4 px-4 md:px-6 rounded-2xl bg-surface-container-high text-on-surface font-headline-lg-mobile text-[15px] md:text-[16px] border border-outline-variant/30 hover:bg-surface-container-highest active:scale-[0.97] transition-all duration-200"
        >
          <Send size={20} />
          <span>Issue</span>
        </Link>
      </div>
    </section>
  );
};
