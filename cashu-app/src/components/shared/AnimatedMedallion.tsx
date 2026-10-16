import React from 'react';

export type MedallionSize = 'sm' | 'md' | 'lg' | 'xl';

interface AnimatedMedallionProps {
  size?: MedallionSize;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<MedallionSize, string> = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
  xl: 'w-36 h-36',
};

export const AnimatedMedallion: React.FC<AnimatedMedallionProps> = ({
  size = 'lg',
  className = '',
  onClick,
}) => {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.lg;

  return (
    <div
      onClick={onClick}
      className={`relative rounded-full overflow-hidden select-none shrink-0 ${sizeClass} ${className}`}
    >
      {/* ── Logo ── */}
      <img
        src="/logo.png"
        alt="BitNotes Logo"
        className="w-full h-full object-cover select-none pointer-events-none"
      />

      {/* ── Animated Shine ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
        <div
          className="absolute top-0 bottom-0 w-[60%] animate-logo-shine pointer-events-none"
          style={{
            background:
              'linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.15) 30%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0.15) 70%, transparent 100%)',
          }}
        />
      </div>
    </div>
  );
};
