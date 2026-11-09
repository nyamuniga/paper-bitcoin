import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { AppPhase } from '../types/momo';
import { 
  startPaymentVerification, 
  executeSendPayment, 
  initiateAndVerifyPayout,
  checkMomoRecovery,
} from '../services/flowServices';
import { subscribeToSparkEvents, syncAndSweepSpark } from '../services/sparkService';

const POLLING_INTERVAL = 2000;
const SPARK_SWEEP_INTERVAL = 15000;

export const TransactionProcessor = () => {
  const { activeTransaction } = useTransactionStore();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const momoPollingRef = useRef<any>(null);
  const momoTimeoutRef = useRef<any>(null);
  const backendPollingRef = useRef<any>(null);
  const isPollingRef = useRef<boolean>(false);
  const lastSparkSweepRef = useRef<number>(0);

  // 1. Transaction Resumption (Mobile Money)
  useEffect(() => {
    if (!activeTransaction) {
      if (momoPollingRef.current) { clearInterval(momoPollingRef.current); momoPollingRef.current = null; }
      if (momoTimeoutRef.current) { clearTimeout(momoTimeoutRef.current); momoTimeoutRef.current = null; }
      return;
    }

    const stopPolling = () => {
      if (momoPollingRef.current) { clearInterval(momoPollingRef.current); momoPollingRef.current = null; }
      if (momoTimeoutRef.current) { clearTimeout(momoTimeoutRef.current); momoTimeoutRef.current = null; }
    };

    const phase = activeTransaction.currentPhase;
    let cancelled = false;
    const isCurrent = () => !cancelled && useTransactionStore.getState().activeTransaction?.id === activeTransaction.id;

    // MoMo specific phases
    if (phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT) {
      startPaymentVerification(stopPolling, momoPollingRef, momoTimeoutRef, isCurrent);
    } else if (phase === AppPhase.AWAITING_INVOICE_PAYMENT) {
      executeSendPayment();
    } else if (phase === AppPhase.INITIATING_PAYOUT || phase === AppPhase.VERIFYING_PAYOUT) {
      initiateAndVerifyPayout(stopPolling, momoPollingRef, momoTimeoutRef, isCurrent);
    } else if (phase === AppPhase.AWAITING_ASP_BOARDING) {
      // With FixedFloat, deposits settle directly to Cashu mint
      refreshWallet();
    } else if (phase === AppPhase.READY_TO_CLAIM) {
      refreshWallet();
    }

    return () => { cancelled = true; stopPolling(); };
  }, [activeTransaction?.id, activeTransaction?.currentPhase, refreshWallet]);

  // Saved transfers continue reconciling by ID without taking over a new form.
  // Never submit/re-fund a cashout here. Confirmed top-ups may finish crediting.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const checks = new Map<string, {next:number; attempts:number}>();
    const pollSaved = async () => {
      const {activeTransaction, history} = useTransactionStore.getState();
      const now = Date.now();
      const pending = history.filter(tx => ['RWF_TO_SATS', 'SATS_TO_RWF'].includes(tx.direction) && tx.id !== activeTransaction?.id && tx.status === 'PENDING' &&
        [AppPhase.RECOVERY_REQUIRED, AppPhase.RETRYABLE_ERROR, AppPhase.PENDING_PAYMENT,
          AppPhase.VERIFYING_PAYMENT, AppPhase.VERIFYING_PAYOUT].includes(tx.currentPhase!));
      for (const id of checks.keys()) if (!pending.some(tx => tx.id === id)) checks.delete(id);
      const tx = pending.find(tx => (checks.get(tx.id)?.next ?? 0) <= now);
      if (tx) {
        const attempts = (checks.get(tx.id)?.attempts ?? 0) + 1;
        checks.set(tx.id, {attempts, next:now + Math.min(300000, 15000 * 2 ** Math.min(attempts, 5))});
        try { await checkMomoRecovery(tx.id); }
        catch { console.error('Could not reconcile a saved Mobile Money transfer.'); }
      }
      if (!stopped) timer = setTimeout(pollSaved, 5000);
    };
    timer = setTimeout(pollSaved, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  // 2. Backend Transactions Polling (Ecash, Lightning, Onchain)
  useEffect(() => {
    let isMounted = true;

    const pollBackend = async () => {
      if (!isMounted) return;
      
      if (isPollingRef.current) {
        backendPollingRef.current = setTimeout(pollBackend, POLLING_INTERVAL);
        return;
      }
      
      isPollingRef.current = true;
      try {
        const txs: any[] = await invoke('get_transactions');
        const { activeTransaction } = useTransactionStore.getState();
        const activeQuoteId = activeTransaction?.mintQuoteId;
        const pendingTxs = txs.filter((t: any) => 
          t.status === 'Pending' && 
          t.id !== activeQuoteId
        );
        const pendingOnchainReceive = pendingTxs.find(
          (t: any) => 'ReceiveOnchain' in t.tx_type && t.mint_url
        );
        const now = Date.now();
        if (
          now - lastSparkSweepRef.current >= SPARK_SWEEP_INTERVAL ||
          pendingOnchainReceive
        ) {
          lastSparkSweepRef.current = now;
          const swept = await syncAndSweepSpark(pendingOnchainReceive?.mint_url);
          if (swept && isMounted) {
            await refreshWallet();
          }
        }

        if (pendingTxs.length > 0) {
          const promises = pendingTxs.map(async (tx) => {
            if (
              'ReceiveLightning' in tx.tx_type ||
              'ReceiveOnchain' in tx.tx_type ||
              'Melt' in tx.tx_type ||
              'Send' in tx.tx_type ||
              'SendOnchain' in tx.tx_type
            ) {
              try {
                const status = await invoke<string>('check_transaction_status', { txId: tx.id });
                if (status !== 'Pending' && isMounted) {
                  await refreshWallet();
                }
              } catch (e) {
                console.error(`[TransactionProcessor] Error polling backend tx ${tx.id}`, e);
              }
            }
          });
          await Promise.allSettled(promises);
        }
      } catch (e) {
        console.error('Failed to fetch transactions for polling', e);
      } finally {
        isPollingRef.current = false;
        if (isMounted) {
          backendPollingRef.current = setTimeout(pollBackend, POLLING_INTERVAL);
        }
      }
    };

    pollBackend(); // Initial check

    const unsubscribeSpark = subscribeToSparkEvents(async (event) => {
      if (
        event.type === 'claimedDeposits' ||
        event.type === 'unclaimedDeposits' ||
        event.type === 'newDeposits' ||
        event.type === 'paymentSucceeded'
      ) {
        const swept = await syncAndSweepSpark();
        if (swept && isMounted) {
          await refreshWallet();
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeSpark();
      if (backendPollingRef.current) clearTimeout(backendPollingRef.current);
    };
  }, []);

  return null;
};
