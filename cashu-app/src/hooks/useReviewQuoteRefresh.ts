import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { StableOperation } from '../services/stableBalanceModel';
import { refreshStableQuote } from '../services/stableBalanceService';
import { transferErrorDetails, transferRetrySeconds } from '../services/transferError';

export const REVIEW_REFRESH_MS = 20000;

/** Refresh visible, unconfirmed reviews without overlapping confirmations or retries. */
export function useReviewQuoteRefresh(operation: StableOperation | null, enabled: boolean, cashuBalance: number, busyRef: MutableRefObject<boolean>, onRefresh: (quote: StableOperation) => void) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [revision, setRevision] = useState(0);
  const lastAttempt = useRef(0);
  const cooldown = useRef(0);
  useEffect(() => {
    if (operation?.stage !== 'quoted') {
      setError('');setRetryAt(0);cooldown.current = 0;lastAttempt.current = 0;
      return;
    }
    if (!enabled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const due = Math.max(operation.expires_at * 1000 - 60000 + REVIEW_REFRESH_MS, lastAttempt.current + REVIEW_REFRESH_MS, cooldown.current);
      timer = setTimeout(check, Math.max(1000, due - Date.now()));
    };
    const check = async () => {
      if (!live) return;
      if (document.hidden || busyRef.current || Date.now() < Math.max(lastAttempt.current + REVIEW_REFRESH_MS, cooldown.current)) {schedule(); return;}
      busyRef.current = true;
      lastAttempt.current = Date.now();
      setRefreshing(true);
      try {
        const next = await refreshStableQuote(operation.id, cashuBalance);
        if (live) {setError('');setRetryAt(0);cooldown.current = 0;onRefresh(next);}
      } catch (failure) {
        if (live) {
          const message = transferErrorDetails(failure);
          cooldown.current = Date.now() + (transferRetrySeconds(message) ?? REVIEW_REFRESH_MS / 1000) * 1000;
          setRetryAt(cooldown.current);
          setError(message);
        }
      } finally {
        busyRef.current = false;
        setRefreshing(false);
        if (live) schedule();
      }
    };
    const visible = () => {if (!document.hidden) {clearTimeout(timer);schedule();}};
    schedule();
    document.addEventListener('visibilitychange', visible);
    return () => {live = false;clearTimeout(timer);document.removeEventListener('visibilitychange', visible);};
  }, [operation, enabled, cashuBalance, busyRef, onRefresh, revision]);
  return {refreshing, error, retryAt, retry: () => {if (Date.now() >= cooldown.current) {lastAttempt.current = 0;setRevision(v => v + 1);}}};
}
