import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { AppPhase } from '../types/momo';
import { 
  startPaymentVerification, 
  executeSendPayment, 
  initiateAndVerifyPayout,
  executeOnChainSend,
  initiateAndVerifyOnChainPayout
} from '../services/flowServices';

const POLLING_INTERVAL = 2000;

export const TransactionProcessor = () => {
  const { activeTransaction } = useTransactionStore();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const momoPollingRef = useRef<any>(null);
  const momoTimeoutRef = useRef<any>(null);
  const backendPollingRef = useRef<any>(null);
  const isPollingRef = useRef<boolean>(false);

  // 1. Transaction Resumption (MoMo & OnChain)
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

    // MoMo specific phases
    if (phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT) {
      startPaymentVerification(stopPolling, momoPollingRef, momoTimeoutRef);
    } else if (phase === AppPhase.AWAITING_INVOICE_PAYMENT) {
      executeSendPayment();
    } else if (phase === AppPhase.INITIATING_PAYOUT || phase === AppPhase.VERIFYING_PAYOUT) {
      initiateAndVerifyPayout(stopPolling, momoPollingRef, momoTimeoutRef);
    } else if (phase === AppPhase.READY_TO_CLAIM) {
      refreshWallet();
    }
    
    // On-Chain specific phases
    if (phase === AppPhase.GENERATING_ONCHAIN_INVOICE || phase === AppPhase.PAYING_ONCHAIN_INVOICE) {
      executeOnChainSend(stopPolling, momoPollingRef, momoTimeoutRef);
    } else if (phase === AppPhase.EXECUTING_ONCHAIN_PAYOUT) {
      initiateAndVerifyOnChainPayout(stopPolling, momoPollingRef, momoTimeoutRef);
    }

    return stopPolling;
  }, [activeTransaction?.id, activeTransaction?.currentPhase, refreshWallet]);

  // 2. Backend Transactions Polling (Ecash, Lightning)
  useEffect(() => {
    let isMounted = true;

    const pollBackend = async () => {
      if (!isMounted) return;
      
      if (isPollingRef.current) {
        // If it's already polling from a previous run, just try again later
        // so we don't accidentally kill the loop forever.
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
        if (pendingTxs.length > 0) {
          const promises = pendingTxs.map(async (tx) => {
            if ('ReceiveLightning' in tx.tx_type || 'Melt' in tx.tx_type || 'Send' in tx.tx_type) {
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

    return () => {
      isMounted = false;
      if (backendPollingRef.current) clearTimeout(backendPollingRef.current);
    };
  }, []);

  return null;
};
