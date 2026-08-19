import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';
import { getBarkBoardingAddress, sendOnChainBark } from '../services/barkService';

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

  const receiveOnChain = async () => {
    if (isRequestingRef.current) return null;
    isRequestingRef.current = true;
    setRequesting(true);
    try {
      const res = await getBarkBoardingAddress();
      return { boardingAddress: res.address };
    } catch (e: any) {
      toast.error(`Failed to get boarding address: ${e.message || e}`);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const sendOnChain = async (address: string, amount: number) => {
    if (isPayingRef.current) return null;
    isPayingRef.current = true;
    setPaying(true);
    try {
      const txid = await sendOnChainBark(address, amount);
      return { txid };
    } catch (e: any) {
      toast.error(`On-Chain send failed: ${e.message || e}`);
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
    receiveOnChain,
    sendOnChain,
  };
};
