import React from 'react';
import { Lock, Unlock } from 'lucide-react';

export type ButtonAuthStatus = 'idle' | 'loading' | 'unlocked';

interface MorphingButtonContentProps {
  status: ButtonAuthStatus;
  label?: string;
  className?: string;
}

export const MorphingButtonContent: React.FC<MorphingButtonContentProps> = ({
  status,
  label = 'Unlock Wallet',
  className = '',
}) => {
  const isIdle = status === 'idle';
  const isLoading = status === 'loading';
  const isUnlocked = status === 'unlocked';

  return (
    <div className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden ${className}`}>
      {/* ── Lock Icon: Centered, pulsates while loading, snaps open on finish ── */}
      <div className="flex items-center justify-center shrink-0 z-10">
        {isUnlocked ? (
          <div className="animate-vault-unlock flex items-center justify-center text-[#08140e]">
            <Unlock size={19} className="stroke-[2.35]" />
          </div>
        ) : (
          <div
            className={`flex items-center justify-center text-[#08140e] transition-transform duration-200 ${
              isLoading ? 'animate-vault-pulse' : ''
            }`}
          >
            <Lock size={19} className="stroke-[2.25]" />
          </div>
        )}
      </div>

      {/* ── Collapsing Button Text: Slides & dissolves into lock icon ── */}
      <div
        style={{
          maxWidth: isIdle ? '140px' : '0px',
          opacity: isIdle ? 1 : 0,
          marginLeft: isIdle ? '8px' : '0px',
          transform: isIdle ? 'translateX(0)' : 'translateX(-8px)',
        }}
        className="whitespace-nowrap overflow-hidden font-display-hero font-bold tracking-tight text-[#08140e] transition-all duration-200 ease-in-out inline-block"
      >
        {label}
      </div>
    </div>
  );
};
