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

  const payInvoice = async (invoice: string, overrideMintUrl?: string) => {
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
    }
  };

  const receiveLightning = async (amount: number, overrideMintUrl?: string) => {
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for receiving');
      return null;
    }

    setRequesting(true);
    try {
      const res: any = await invoke('receive_lightning', { mintUrl: targetMint, amount });
      return { quoteId: res.quote_id as string, receiveInvoice: res.invoice as string };
    } catch (e: any) {
      toast.error(`Failed to create invoice: ${e}`);
      return null;
    } finally {
      setRequesting(false);
    }
  };

  const pollReceiveStatus = async (quoteId: string, amount: number, overrideMintUrl?: string) => {
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) return;
    
    let isMounted = true;
    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current && isMounted) {
        try {
          await invoke('check_receive_lightning', { mintUrl: targetMint, quoteId, amount });
          if (!isMounted) return;
          setReceiveSuccess(true);
          await refreshWallet();
          toast.success(`Received ₿${amount.toLocaleString()} sats!`);
          return;
        } catch {
          // Not paid yet, keep polling
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
