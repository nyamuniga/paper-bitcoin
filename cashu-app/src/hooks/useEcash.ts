import React, { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { toast } from 'react-hot-toast';

export const useEcash = (mintUrl?: string) => {
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isSendingRef = useRef(false);
  const isReceivingRef = useRef(false);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const checkClaimedStatus = async () => {
      if (currentTxId && !isClaimed) {
        try {
          const status = await invoke<string>('check_token_spend_status', { txId: currentTxId });
          if (status === 'Spent' || status === 'Partially Spent') {
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

  const sendEcash = async (amount: number, overrideMintUrl?: string) => {
    if (isSendingRef.current) return null;
    
    const targetMint = overrideMintUrl || mintUrl;
    if (!targetMint) {
      toast.error('No mint specified for sending');
      return null;
    }

    isSendingRef.current = true;
    setSending(true);
    try {
      const result: {token: string, tx_id: string} = await invoke('send_ecash', { 
        mintUrl: targetMint, 
        amount 
      });
      setCurrentTxId(result.tx_id);
      await refreshWallet();
      return result;
    } catch (e: any) {
      toast.error(`Send failed: ${e}`);
      return null;
    } finally {
      setSending(false);
      isSendingRef.current = false;
    }
  };

  const receiveEcash = async (token: string) => {
    if (isReceivingRef.current) return null;
    isReceivingRef.current = true;
    setReceiving(true);
    try {
      const amount = await invoke<number>('receive_ecash', { tokenString: token });
      await refreshWallet();
      toast.success(`Received ₿${amount.toLocaleString()} sats!`);
      return amount;
    } catch (e: any) {
      toast.error(`Receive failed: ${e}`);
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
  };
};
