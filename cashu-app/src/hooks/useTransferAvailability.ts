import { useEffect, useState } from 'react';
import { getStableTransferLimits } from '../services/stableBalanceService';
import type { StableDirection } from '../services/stableBalanceModel';
import type { StableTransferLimits } from '../services/stableBalanceService';

interface Props {
  enabled: boolean;
  direction: StableDirection;
  mintUrl: string;
  sourceAmount: bigint;
}
interface Limits { key: string; value: StableTransferLimits | null; failed: boolean }
/** Load reusable provider limits only. Typing never creates mint or funding quotes. */
export function useTransferAvailability({enabled, direction, mintUrl, sourceAmount}: Props) {
  const [revision, setRevision] = useState(0);
  const [limits, setLimits] = useState<Limits>({key:'',value:null,failed:false});
  const limitKey = `${direction}|${mintUrl}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLimits({key:limitKey,value:null,failed:false});
    void getStableTransferLimits(direction).then(value => {
      if(live) setLimits({key:limitKey,value,failed:false});
    }).catch(() => {if(live) setLimits({key:limitKey,value:null,failed:true});});
    return () => {live=false;};
  }, [enabled, direction, limitKey, revision]);
  const currentLimits = limits.key === limitKey ? limits : null;
  const minimum = currentLimits?.value?.minSource ?? null;
  const belowMinimum = minimum !== null && sourceAmount > 0n && sourceAmount < minimum;
  const limitsReady = !!currentLimits?.value;
  return {
    minimum, belowMinimum, limitsReady,
    limitsFailed: !!currentLimits?.failed,
    retry: () => setRevision(value => value + 1),
  };
}
