import React from 'react';

interface AmountDisplayProps {
  amount: string;
  compact?: boolean;
}

export const AmountDisplay: React.FC<AmountDisplayProps> = ({ amount, compact = false }) => {
  const containerClass = compact
    ? "flex-1 flex flex-col items-center justify-center py-4"
    : "flex-1 flex flex-col items-center justify-center py-6 md:py-10";

  const labelClass = compact
    ? "text-label-sm font-label-caps text-on-surface-variant tracking-widest mb-1"
    : "text-label-caps font-label-caps text-on-surface-variant tracking-widest mb-3";

  const fontSizeClass = compact
    ? amount.length > 6 ? 'text-[32px] md:text-[40px]' : 'text-[44px] md:text-[56px]'
    : amount.length > 6 ? 'text-[40px] md:text-[52px]' : 'text-[56px] md:text-[72px]';

  return (
    <div className={containerClass}>
      <span className={labelClass}>AMOUNT</span>
      <div className="flex items-baseline gap-2 mb-1">
        <h1 className={`font-display-lg text-on-surface tracking-tighter leading-none relative z-10 transition-all duration-300 ${fontSizeClass}`}>
          ₿{amount || '0'}
        </h1>
      </div>
    </div>
  );
};
