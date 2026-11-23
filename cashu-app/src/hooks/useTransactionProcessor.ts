import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { startActiveMomoProcessing } from '../services/momoProcessingAdapter';
import { startSavedMomoProcessing } from '../services/savedMomoRecoveryAdapter';
import { subscribeToSparkEvents, syncAndSweepSpark } from '../services/sparkService';

const POLLING_INTERVAL = 2000;
const SPARK_SWEEP_INTERVAL = 15000;

export const TransactionProcessor = () => {
  const { activeTransaction } = useTransactionStore();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const backendPollingRef = useRef<any>(null);
  const isPollingRef = useRef<boolean>(false);
  const lastSparkSweepRef = useRef<number>(0);

  useEffect(() => {
    if (!activeTransaction) return;
    return startActiveMomoProcessing(activeTransaction.id, activeTransaction.currentPhase, refreshWallet);
  }, [activeTransaction?.id, activeTransaction?.currentPhase, refreshWallet]);

  useEffect(() => startSavedMomoProcessing(), []);

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
