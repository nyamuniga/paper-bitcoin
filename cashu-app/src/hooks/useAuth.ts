import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { useNostrStore } from '../store/nostrStore';
import { useTransactionStore } from '../store/transactionStore';

export const useAuth = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'create' | 'restore'>('login');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string[]>([]);
  
  useEffect(() => {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('restore-progress', (event) => {
        setRestoreProgress(prev => {
            const next = [...prev, event.payload as string];
            if (next.length > 50) return next.slice(next.length - 50); // Keep last 50 logs
            return next;
        });
      });
    });
  }, []);
  
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleClearError = () => setErrorMsg('');

  useEffect(() => {
    invoke('is_wallet_setup').then((setup) => {
      setIsSetup(setup as boolean);
      if (!setup) {
        setMode('create');
      } else {
        setMode('login');
      }
    }).catch(e => triggerError(String(e)));
  }, []);

  const unlockWallet = async (passphrase: string) => {
    setLoading(true);
    handleClearError();
    try {
      await invoke('unlock_wallet', { passphrase });
      window.history.replaceState(null, '', '/');
      await refreshWallet();
      return true;
    } catch (e: any) {
      triggerError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const createWallet = async (passphrase: string) => {
    setLoading(true);
    handleClearError();
    try {
      const res: any = await invoke('create_wallet', { passphrase });
      return res.mnemonic as string;
    } catch (e: any) {
      triggerError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const restoreWallet = async (mnemonic: string, passphrase: string, mintUrls: string[]) => {
    setLoading(true);
    setRestoreProgress([]);
    handleClearError();
    try {
      await invoke('restore_wallet', { mnemonic, passphrase, mintUrls });
      window.history.replaceState(null, '', '/');
      await refreshWallet();
      return true;
    } catch (e: any) {
      triggerError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const resetWallet = async () => {
    setLoading(true);
    handleClearError();
    try {
      await invoke('reset_wallet');
      useNostrStore.getState().reset();
      useTransactionStore.getState().reset();
      localStorage.removeItem('npubx_claimed_quotes');
      localStorage.removeItem('cashu-nostr-storage');
      localStorage.removeItem('cashu-transaction-storage');
      await refreshWallet();
      return true;
    } catch (e: any) {
      triggerError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const lockWallet = async () => {
    setLoading(true);
    handleClearError();
    try {
      await invoke('lock_wallet');
      await refreshWallet();
      return true;
    } catch (e: any) {
      triggerError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    isSetup,
    setIsSetup,
    mode,
    setMode,
    errorMsg,
    shake,
    showConfirmReset,
    setShowConfirmReset,
    generatedMnemonic,
    setGeneratedMnemonic,
    triggerError,
    handleClearError,
    loading,
    unlockWallet,
    createWallet,
    restoreWallet,
    resetWallet,
    lockWallet,
    restoreProgress
  };
};
