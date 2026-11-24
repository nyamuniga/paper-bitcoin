import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';
import {
  estimateOnChainSendSpark,
  executeOnChainSendSpark,
  getDepositAddressSpark,
  OnchainSendEstimate,
} from '../services/sparkService';

interface BitcoinErrorOptions {
  silent?: boolean;
  onError?: (message: string) => void;
}

function reportBitcoinError(message: string, options?: BitcoinErrorOptions) {
  if (!options?.silent) toast.error(message);
  options?.onError?.(message);
}

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
        await invoke<void>('pay_invoice', { invoice, mintUrl: targetMint });
      } else {
        await invoke<void>('pay_invoice', { invoice });
      }
      if (!opts?.silent) toast.success('Invoice paid successfully!');
      await refreshWallet();
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!opts?.silent) toast.error(`Payment failed: ${message}`);
      opts?.onError?.(message);
      return false;
    } finally {
      setPaying(false);
      isPayingRef.current = false;
    }
  };

  const receiveLightning = async (amount: number, overrideMintUrl?: string, options?: BitcoinErrorOptions) => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      reportBitcoinError('No mint specified for receiving', options);
      return null;
    }

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      const res = await invoke<{ quote_id: string; invoice: string; amount: number }>('receive_lightning', { mintUrl: targetMint, amount });
      await refreshWallet();
      return { quoteId: res.quote_id as string, receiveInvoice: res.invoice as string };
    } catch (e: unknown) {
      reportBitcoinError(`Failed to create invoice: ${e}`, options);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const receiveOnChain = async (amountSats?: number, overrideMintUrl?: string, options?: BitcoinErrorOptions) => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      reportBitcoinError('No mint specified for on-chain deposit', options);
      return null;
    }
    const amount = amountSats && amountSats > 0 ? amountSats : 10000;

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      const res = await getDepositAddressSpark(amount, targetMint);
      await refreshWallet();
      return {
        boardingAddress: res.address,
        amountSats: res.amount_sats,
        netReceiveSats: res.net_receive_sats,
        estimatedFeeSats: res.estimated_fee_sats,
        quoteId: res.quote_id,
        orderId: res.order_id,
      };
    } catch (e: unknown) {
      reportBitcoinError(`Failed to get Bitcoin deposit address: ${e instanceof Error ? e.message : String(e)}`, options);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const estimateOnChain = async (address: string, amount: number, overrideMintUrl?: string, options?: BitcoinErrorOptions): Promise<OnchainSendEstimate | null> => {
    if (isRequestingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      reportBitcoinError('No mint specified for on-chain send', options);
      return null;
    }

    isRequestingRef.current = true;
    setRequesting(true);
    try {
      return await estimateOnChainSendSpark(address, amount, targetMint);
    } catch (e: unknown) {
      reportBitcoinError(`Estimation failed: ${e instanceof Error ? e.message : String(e)}`, options);
      return null;
    } finally {
      setRequesting(false);
      isRequestingRef.current = false;
    }
  };

  const executeOnChain = async (estimate: OnchainSendEstimate, address: string, overrideMintUrl?: string, options?: BitcoinErrorOptions) => {
    if (isPayingRef.current) return null;
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      reportBitcoinError('No mint specified for on-chain send', options);
      return null;
    }

    isPayingRef.current = true;
    setPaying(true);
    try {
      const txid = await executeOnChainSendSpark(
        estimate.bridging_invoice,
        address,
        estimate.amount,
        targetMint,
        estimate.ark_fee
      );
      await refreshWallet();
      return { txid };
    } catch (e: unknown) {
      reportBitcoinError(`On-Chain send failed: ${e instanceof Error ? e.message : String(e)}`, options);
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
