import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';
import { getOnChainFee } from '../services/lightningService';

export const useBitcoin = (mintUrl?: string) => {
  const [paying, setPaying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isPayingRef = useRef(false);
  const isRequestingRef = useRef(false);

  const payInvoice = async (invoice: string, overrideMintUrl?: string) => {
    if (isPayingRef.current) return false;
    const targetMint = overrideMintUrl || mintUrl;
    
    setPaying(true);
    try {
      if (targetMint) {
        await invoke('pay_invoice', { invoice, mintUrl: targetMint });
      } else {
        await invoke('pay_invoice', { invoice });
      }
      toast.success('Invoice paid successfully!');
      await refreshWallet();
      return true;
    } catch (e: any) {
      toast.error(`Payment failed: ${e}`);
      return false;
    } finally {
      setPaying(false);
      isPayingRef.current = false;
    }
  };

  const receiveLightning = async (amount: number, overrideMintUrl?: string) => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for receiving');
      return null;
    }

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      const res: any = await invoke('receive_lightning', { mintUrl: targetMint, amount });
      await refreshWallet();
      return { quoteId: res.quote_id as string, receiveInvoice: res.invoice as string };
    } catch (e: any) {
      toast.error(`Failed to create invoice: ${e}`);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const sendOnChain = async (address: string, amount: number, miningFee: number, overrideMintUrl?: string) => {
    if (isPayingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for sending');
      return null;
    }

    setPaying(true);
    isPayingRef.current = true;
    try {
      // Create new transaction record
      const newTx: any = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        direction: "ONCHAIN_SEND",
        satsAmount: amount,
        fee: miningFee,
        onchainAddress: address,
        mintUrl: targetMint,
        status: "PENDING",
        currentPhase: "GENERATING_ONCHAIN_INVOICE",
        timestamp: Date.now()
      };

      const { useTransactionStore } = await import('../store/transactionStore');
      useTransactionStore.getState().setActiveTransaction(newTx);

      return { success: true, status: 'PENDING' };
    } catch (e: any) {
      toast.error(`Send failed: ${e.message}`);
      return null;
    } finally {
      setPaying(false);
      isPayingRef.current = false;
    }
  };

  return {
    paying,
    requesting,
    payInvoice,
    receiveLightning,
    getOnChainFee, // expose for UI to calculate fees before confirming
    sendOnChain,
  };
};
