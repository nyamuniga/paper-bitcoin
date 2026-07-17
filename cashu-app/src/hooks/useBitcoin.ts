import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';

export const useBitcoin = (mintUrl?: string) => {
  const [paying, setPaying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [receiveSuccess, setReceiveSuccess] = useState(false);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const pollingRef = useRef(false);
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
      return { quoteId: res.quote_id as string, receiveInvoice: res.invoice as string };
    } catch (e: any) {
      toast.error(`Failed to create invoice: ${e}`);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const pollReceiveStatus = async (quoteId: string, amount: number) => {
    let isMounted = true;
    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current && isMounted) {
        try {
          const status = await invoke<string>('check_transaction_status', { txId: quoteId });
          if (!isMounted) return;
          
          if (status === 'Success') {
            setReceiveSuccess(true);
            await refreshWallet();
            toast.success(`Received ₿${amount.toLocaleString()} sats!`);
            return;
          } else if (status === 'Failed') {
            toast.error("Transaction failed.");
            return;
          }
          // If Pending, continue polling
          await new Promise(r => setTimeout(r, 2000));
        } catch {
          // Network error or other error, keep polling
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    };

    poll();

    return () => {
      isMounted = false;
      pollingRef.current = false;
    };
  };

  const stopPolling = () => {
    pollingRef.current = false;
  };

  return {
    paying,
    requesting,
    receiveSuccess,
    setReceiveSuccess,
    payInvoice,
    receiveLightning,
    pollReceiveStatus,
    stopPolling
  };
};
