import React from 'react';
import { useMintInfo } from '../../hooks/useMintInfo';
import { formatMintUrl } from '../../utils/format';

interface MintNameProps {
  mintUrl: string;
  className?: string;
}

export const MintName: React.FC<MintNameProps> = ({ mintUrl, className }) => {
  const { info } = useMintInfo(mintUrl || '');
  const name = info?.name?.trim();
  return (
    <span className={className}>
      {name || (mintUrl ? formatMintUrl(mintUrl) : 'Unknown Mint')}
    </span>
  );
};
