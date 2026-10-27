import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';
import {
  estimateOnChainSendFixedFloat,
  executeOnChainSendFixedFloat,
  getDepositAddressFixedFloat,
  OnchainSendEstimate,
} from '../services/fixedFloatService';

export const useBitcoin = (mintUrl?: string) => {
  const [paying, setPaying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isPayingRef = useRef(false);
  const isRequestingRef = useRef(false);

  const payInvoice = async (
    invoice: string,
    overrideMintUrl?: string,
    opts?: { silent?: boolean; onError?: (message: string) => void }
  ) => {
    if (isPayingRef.current) return false;
    const targetMint = overrideMintUrl || mintUrl;
    
    isPayingRef.current = true;
    setPaying(true);
    try {
      if (targetMint) {
        await invoke('pay_invoice', { invoice, mintUrl: targetMint });
      } else {
        await invoke('pay_invoice', { invoice });
      }
      if (!opts?.silent) toast.success('Invoice paid successfully!');
      await refreshWallet();
      return true;
    } catch (e: any) {
      const message = String(e?.message ?? e);
      if (!opts?.silent) toast.error(`Payment failed: ${message}`);
      opts?.onError?.(message);
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

  const receiveOnChain = async (amountSats?: number, overrideMintUrl?: string) => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for on-chain deposit');
      return null;
    }
    const amount = amountSats && amountSats > 0 ? amountSats : 10000;

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      const res = await getDepositAddressFixedFloat(amount, targetMint);
      await refreshWallet();
      return {
        boardingAddress: res.address,
        amountSats: res.amount_sats,
        quoteId: res.quote_id,
        orderId: res.order_id,
      };
    } catch (e: any) {
      toast.error(`Failed to get Bitcoin deposit address: ${e.message || e}`);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const estimateOnChain = async (address: string, amount: number, overrideMintUrl?: string): Promise<OnchainSendEstimate | null> => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for on-chain send');
      return null;
    }

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      return await estimateOnChainSendFixedFloat(address, amount, targetMint);
    } catch (e: any) {
      toast.error(`Estimation failed: ${e.message || e}`);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const executeOnChain = async (estimate: OnchainSendEstimate, address: string, overrideMintUrl?: string) => {
    if (isPayingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for on-chain send');
      return null;
    }

    isPayingRef.current = true;
    setPaying(true);
    try {
      const txid = await executeOnChainSendFixedFloat(
        estimate.bridging_invoice,
        address,
        estimate.amount,
        targetMint,
        estimate.order_id,
        estimate.order_token
      );
      await refreshWallet();
      return { txid };
    } catch (e: any) {
      toast.error(`On-Chain send failed: ${e.message || e}`);
      await refreshWallet();
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
    estimateOnChain,
    executeOnChain,
  };
};
