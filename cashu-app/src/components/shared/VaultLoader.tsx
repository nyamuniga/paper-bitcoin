import React from 'react';
import { AnimatedMedallion, MedallionSize } from './AnimatedMedallion';

interface VaultLoaderProps {
  size?: MedallionSize;
  fullScreen?: boolean;
  status?: string;
  message?: string;
  className?: string;
}

export const VaultLoader: React.FC<VaultLoaderProps> = ({
  size = 'lg',
  fullScreen = true,
  className = '',
}) => {
  const content = (
    <div className={`flex items-center justify-center select-none ${className}`}>
      <AnimatedMedallion size={size} />
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {content}
    </div>
  );
};
