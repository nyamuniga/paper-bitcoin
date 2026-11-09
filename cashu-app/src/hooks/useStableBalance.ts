import { useCallback, useEffect, useState } from 'react';
import { getActiveConversion, getStableBalance } from '../services/stableBalanceService';
import { subscribeToSparkEvents } from '../services/sparkService';
import type { StableOperation } from '../services/stableBalanceModel';

export function useStableBalance() {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [operation, setOperation] = useState<StableOperation | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  useEffect(() => {
    let live = true;
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const op = await getActiveConversion();
        if (live) setOperation(op);
        const amount = await getStableBalance();
        if (live) { setBalance(amount); setError(''); }
      } catch {
        if (live) setError('Dollar balance unavailable');
      } finally { running = false; }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    const stop = subscribeToSparkEvents(event => { if (['paymentSucceeded', 'paymentMetadataUpdated'].includes(event.type)) void load(); });
    return () => { live = false; clearInterval(interval); stop(); };
  }, [revision]);
  return { balance, operation, error, refresh };
}
