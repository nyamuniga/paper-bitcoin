import React from 'react';

export type MedallionSize = 'sm' | 'md' | 'lg' | 'xl' | 'custom';

interface AnimatedMedallionProps {
  size?: MedallionSize;
  className?: string;
  onClick?: () => void;
  src?: string;
}

const SIZE_MAP: Record<MedallionSize, string> = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
  xl: 'w-36 h-36',
  custom: '',
};

export const AnimatedMedallion: React.FC<AnimatedMedallionProps> = ({
  size = 'lg',
  className = '',
  onClick,
  src = '/logo.png',
}) => {
  const sizeClass = SIZE_MAP[size] ?? SIZE_MAP.lg;

  return (
    <div
      onClick={onClick}
      style={{
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
        maskImage: 'radial-gradient(white, black)',
        transform: 'translateZ(0)',
      }}
      className={`relative rounded-full overflow-hidden select-none shrink-0 ${sizeClass} ${className}`}
    >
      {/* ── Logo ── */}
      <img
        src={src}
        alt="BitNotes Logo"
        className="w-full h-full object-cover select-none pointer-events-none rounded-full"
      />

      {/* ── Animated Shine (Zero Black Artifacts) ── */}
      <div
        style={{
          WebkitMaskImage: '-webkit-radial-gradient(white, black)',
          maskImage: 'radial-gradient(white, black)',
        }}
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
      >
        <div
          className="absolute top-0 bottom-0 w-[60%] animate-logo-shine pointer-events-none"
          style={{
            background:
              'linear-gradient(110deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.15) 30%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0.15) 70%, rgba(255, 255, 255, 0) 100%)',
          }}
        />
      </div>
    </div>
  );
};
