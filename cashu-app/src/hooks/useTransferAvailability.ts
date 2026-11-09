import { useEffect, useState, useRef } from 'react';
import { getStableTransferLimits, previewStableTransfer } from '../services/stableBalanceService';
import { TransferMinimumError } from '../services/transferAmount';
import type { StableDirection, StableOperation } from '../services/stableBalanceModel';
import type { StableTransferLimits } from '../services/stableBalanceService';

interface Props {
  enabled: boolean;
  direction: StableDirection;
  mintUrl: string;
  cashuBalance: number;
  sourceBalance: bigint | null;
  sourceAmount: bigint;
  estimate: bigint | null;
}
interface Limits { key: string; value: StableTransferLimits | null; failed: boolean }
interface Draft { key: string; quote: StableOperation | null; error: unknown; checking: boolean }

/** Live checks never save a conversion, allocate proofs, or send money. */
export function useTransferAvailability({enabled, direction, mintUrl, cashuBalance, sourceBalance, sourceAmount, estimate}: Props) {
  const cache = useRef(new Map<string, {quote:StableOperation; until:number}>());
  const estimateRef = useRef(estimate);
  estimateRef.current = estimate;
  const hasEstimate = estimate !== null && estimate > 0n;
  const [revision, setRevision] = useState(0);
  const [limits, setLimits] = useState<Limits>({key:'',value:null,failed:false});
  const [draft, setDraft] = useState<Draft>({key:'',quote:null,error:null,checking:false});
  const limitKey = `${direction}|${mintUrl}`;
  const key = `${limitKey}|${sourceAmount}|${sourceBalance}|${cashuBalance}`;
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
  useEffect(() => {
    if (!enabled || !limitsReady || belowMinimum || sourceAmount <= 0n || sourceBalance === null || sourceAmount > sourceBalance || !hasEstimate || !mintUrl) {
      setDraft({key,quote:null,error:null,checking:false});
      return;
    }
    const cached = cache.current.get(key);
    if (cached && cached.until > Date.now()) {
      setDraft({key,quote:cached.quote,error:null,checking:false});
      return;
    }
    const controller = new AbortController();
    setDraft({key,quote:null,error:null,checking:true});
    const timer = setTimeout(() => {
      void previewStableTransfer(direction, estimateRef.current!, mintUrl, cashuBalance, sourceAmount, controller.signal).then(quote => {
        if (!controller.signal.aborted) {
          cache.current.set(key,{quote,until:Math.min(quote.expires_at*1000,Date.now()+15000)});
          if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
          setDraft({key,quote,error:null,checking:false});
        }
      }).catch(error => {
        if (controller.signal.aborted) return;
        setDraft({key,quote:null,error,checking:false});
        if (error instanceof TransferMinimumError && !error.includesFees) {
          // A fresh provider response can supersede the limits fetched on opening.
          setLimits(previous => previous.key === limitKey && previous.value ? {...previous,value:{...previous.value,minSource: previous.value.minSource === null || previous.value.minSource < error.minimum ? error.minimum : previous.value.minSource}} : previous);
        }
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, limitsReady, belowMinimum, key, limitKey, direction, hasEstimate, mintUrl, cashuBalance, sourceAmount, sourceBalance, revision]);
  const currentDraft = draft.key === key ? draft : null;
  const expired = !!currentDraft?.quote && currentDraft.quote.expires_at * 1000 <= Date.now();
  return {
    minimum, belowMinimum, limitsReady,
    limitsFailed: !!currentLimits?.failed,
    checking: enabled && (!currentLimits || (!limitsReady && !currentLimits.failed) || !!currentDraft?.checking),
    quote: !expired ? currentDraft?.quote ?? null : null,
    quoteError: currentDraft?.error,
    minimumError: currentDraft?.error instanceof TransferMinimumError ? currentDraft.error : null,
    expired,
    retry: () => {cache.current.delete(key); setRevision(value => value + 1);},
  };
}
