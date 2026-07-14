import React, { useState } from 'react';
import { useMintInfo } from '../../hooks/useMintInfo';
import { formatMintUrl } from '../../utils/format';

interface MintIconProps {
  mintUrl: string;
  className?: string; // Classes for the container (e.g. w-8 h-8 rounded-full)
  textClassName?: string; // Classes for the fallback text (e.g. text-[12px])
}

export const MintIcon: React.FC<MintIconProps> = ({ 
  mintUrl, 
  className = "w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary/15 border border-primary/20", 
  textClassName = "text-primary text-[12px] font-bold"
}) => {
  const { info } = useMintInfo(mintUrl);
  const [imageError, setImageError] = useState(false);

  const fallback = (
    <div className={`${className} flex items-center justify-center flex-shrink-0`}>
      <span className={textClassName}>
        {formatMintUrl(mintUrl).charAt(0).toUpperCase()}
      </span>
    </div>
  );

  if (info?.icon_url && !imageError) {
    return (
      <div className={`${className} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
        <img 
          src={info.icon_url} 
          alt={`${formatMintUrl(mintUrl)} logo`} 
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return fallback;
};
