import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { AppPhase } from '../types/momo';
import { 
  startPaymentVerification, 
  executeSendPayment, 
  initiateAndVerifyPayout,
} from '../services/flowServices';
import { syncBarkVutxos, getBarkBalance, payLightningInvoiceBark } from '../services/barkService';

const POLLING_INTERVAL = 2000;

export const TransactionProcessor = () => {
  const { activeTransaction } = useTransactionStore();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const momoPollingRef = useRef<any>(null);
  const momoTimeoutRef = useRef<any>(null);
  const backendPollingRef = useRef<any>(null);
  const isPollingRef = useRef<boolean>(false);

  // 1. Transaction Resumption (MoMo)
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
    } else if (phase === AppPhase.AWAITING_ASP_BOARDING) {
      // Poll Ark ASP for onboarding VTXOs
      if (!momoPollingRef.current) {
        momoPollingRef.current = setInterval(async () => {
          try {
            await syncBarkVutxos();
            // In a full implementation, we'd check if the VTXO is confirmed and transition the phase
          } catch (e) {
            console.error("Error syncing Bark VTXOs", e);
          }
        }, POLLING_INTERVAL);
      }
    } else if (phase === AppPhase.READY_TO_CLAIM) {
      refreshWallet();
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

  // 3. Auto-sweep Bark VUTXOs
  useEffect(() => {
    let isMounted = true;
    let isSweeping = false;

    const sweepBark = async () => {
      if (!isMounted || isSweeping) return;
      isSweeping = true;

      try {
        await syncBarkVutxos();
        const balance = await getBarkBalance();
        
        // Only sweep if balance > 50 sats to account for potential routing fees
        if (balance > 50) {
          const sweepAmount = balance - 50; // Leave 50 sats for Ark fees
          
          // Determine the target mint
          const mints = Object.keys(useWalletStore.getState().mintBalances);
          if (mints.length === 0) {
            console.warn("No mints available to sweep Bark funds into.");
            return;
          }
          const targetMint = mints[0];
          
          // Request invoice from mint
          const res: any = await invoke('receive_lightning', { mintUrl: targetMint, amount: sweepAmount });
          const invoice = res.invoice as string;
          
          if (invoice) {
            // Pay it with Bark
            await payLightningInvoiceBark(invoice);
            console.log(`Successfully swept ${sweepAmount} sats from Bark to Cashu`);
            // Trigger backend check to fetch the eCash immediately
            await invoke('check_transaction_status', { txId: res.quote_id });
            await refreshWallet();
          }
        }
      } catch (e) {
        console.error("Auto-sweep failed:", e);
      } finally {
        isSweeping = false;
      }
    };

    sweepBark();
    const intervalId = setInterval(sweepBark, 30000); // Check every 30 seconds

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return null;
};
