import React, { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { getGlobalNostrPrivateKey } from './useNostr';
import { toast } from 'react-hot-toast';
import { describeSendEcashFailure } from '../services/sendEcashError';
import type { SendEcashFailure } from '../services/sendEcashError';
import type { SendEcashResult } from '../types/sendEcash';

export const useEcash = (mintUrl?: string) => {
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isSendingRef = useRef(false);
  const isReceivingRef = useRef(false);
  const unresolvedSendRef = useRef<SendEcashFailure | null>(null);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const checkClaimedStatus = async () => {
      if (currentTxId && !isClaimed) {
        try {
          const status = await invoke<string>('check_token_spend_status', { txId: currentTxId });
          if (status === 'Spent') {
            setIsClaimed(true);
            await refreshWallet();
          }
        } catch (e) {
          // ignore
        }
      }
    };

    if (currentTxId && !isClaimed) {
      checkClaimedStatus();
      interval = setInterval(checkClaimedStatus, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTxId, isClaimed]);

  const sendEcash = async (
    amount: number, 
    overrideMintUrl?: string, 
    pubkey?: string,
    opts?: { silent?: boolean; onError?: (msg: string) => void }
  ) => {
    if (isSendingRef.current) return null;

    const reportError = (message: string) => {
      if (!opts?.silent) toast.error(message);
      opts?.onError?.(message);
      return null;
    };
    if (unresolvedSendRef.current) {
      return reportError(unresolvedSendRef.current.message);
    }
    
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      return reportError('No mint specified for sending');
    }

    isSendingRef.current = true;
    setSending(true);
    setIsClaimed(false);
    setCurrentTxId(null);
    try {
      let result: SendEcashResult;
      try {
        result = await invoke<SendEcashResult>('send_ecash_v2', {
          mintUrl: targetMint,
          amount,
          pubkey,
        });
      } catch (error: unknown) {
        const failure = describeSendEcashFailure(error);
        if (failure.requiresReconciliation) unresolvedSendRef.current = failure;
        return reportError(failure.message);
      }

      setCurrentTxId(result.tx_id);
      try {
        await refreshWallet();
      } catch {
        // The token is already confirmed; balance refresh cannot change its outcome.
        if (!opts?.silent) toast.error('Token created, but the balance could not be refreshed. Check History.');
      }
      return result;
    } finally {
      setSending(false);
      isSendingRef.current = false;
    }
  };

  const receiveEcash = async (
    token: string,
    opts?: { silent?: boolean; onError?: (msg: string) => void }
  ) => {
    if (isReceivingRef.current) return null;
    isReceivingRef.current = true;
    setReceiving(true);
    try {
      let cleanToken = token.trim();
      if (cleanToken.toLowerCase().startsWith('cashu://')) {
        cleanToken = cleanToken.substring(8).trim();
      } else if (cleanToken.toLowerCase().startsWith('cashu:')) {
        cleanToken = cleanToken.substring(6).trim();
      }

      let nostrKey = getGlobalNostrPrivateKey();
      if (!nostrKey) {
        try {
          const custom = await invoke<string | null>('get_custom_nostr_key');
          if (custom) {
            nostrKey = custom;
          }
        } catch {
          // ignore
        }
      }

      const amount = await invoke<number>('receive_ecash', { 
        tokenString: cleanToken,
        nostrKey: nostrKey || undefined,
      });
      await refreshWallet();
      if (!opts?.silent) toast.success(`Received ₿${amount.toLocaleString()} sats!`);
      return amount;
    } catch (e: any) {
      const err = String(e?.message ?? e);
      if (!opts?.silent) toast.error(`Receive failed: ${err}`);
      opts?.onError?.(err);
      return null;
    } finally {
      setReceiving(false);
      isReceivingRef.current = false;
    }
  };

  return {
    sending,
    receiving,
    isClaimed,
    setIsClaimed,
    sendEcash,
    receiveEcash,
    trackOutgoing: (txId: string) => {
      setCurrentTxId(txId);
      setIsClaimed(false);
    },
  };
};
