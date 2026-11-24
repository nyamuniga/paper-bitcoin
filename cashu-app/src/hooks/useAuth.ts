import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWalletStore } from '../store/wallet';
import { useNostrStore } from '../store/nostrStore';
import { useTransactionStore } from '../store/transactionStore';
import { disconnectSparkSdk } from '../services/sparkService';

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
    let unlistenFn: (() => void) | null = null;
    let isMounted = true;
    listen('restore-progress', (event) => {
      if (!isMounted) return;
      setRestoreProgress(prev => {
        const next = [...prev, event.payload as string];
        if (next.length > 50) return next.slice(next.length - 50); // Keep last 50 logs
        return next;
      });
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });
    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleClearError = () => setErrorMsg('');

  useEffect(() => {
    invoke<boolean>('is_wallet_setup').then(async (setup) => {
      if (!setup) {
        setIsSetup(false);
        setMode('create');
      } else {
        const shouldAutoLogin = localStorage.getItem('rememberMe') === 'true';
        if (shouldAutoLogin) {
          const res = await invoke<boolean>('auto_login').catch(() => false);
          if (res) {
            await refreshWallet();
            return;
          }
        }
        setIsSetup(true);
        setMode('login');
      }
    }).catch(e => triggerError(String(e)));
  }, []);

  const unlockWallet = async (passphrase: string, rememberMe: boolean, onUnlocked?: () => void) => {
    setLoading(true);
    handleClearError();
    try {
      await invoke<void>('unlock_wallet', { passphrase, rememberMe });
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }
      window.history.replaceState(null, '', '/');

      // Trigger the unlock animation (lock snaps open!)
      if (onUnlocked) {
        onUnlocked();
      }

      // Brief delay so the user experiences the satisfying open lock animation
      await new Promise(resolve => setTimeout(resolve, 450));

      await refreshWallet();
      return true;
    } catch (e: unknown) {
      triggerError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const createWallet = async (passphrase: string, rememberMe: boolean) => {
    setLoading(true);
    handleClearError();
    try {
      const res = await invoke<{ mnemonic: string }>('create_wallet', { passphrase, rememberMe });
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }
      return res.mnemonic as string;
    } catch (e: unknown) {
      triggerError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const restoreWallet = async (mnemonic: string, passphrase: string, rememberMe: boolean, mintUrls: string[]) => {
    setLoading(true);
    setRestoreProgress([]);
    handleClearError();
    try {
      await invoke<void>('restore_wallet', { mnemonic, passphrase, rememberMe, mintUrls });
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }
      window.history.replaceState(null, '', '/');
      await refreshWallet();
      return true;
    } catch (e: unknown) {
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
      await disconnectSparkSdk();
      await invoke<void>('reset_wallet');
      useNostrStore.getState().reset();
      useTransactionStore.getState().reset();
      localStorage.removeItem('npubx_claimed_quotes');
      localStorage.removeItem('cashu-nostr-storage');
      localStorage.removeItem('cashu-transaction-storage');
      localStorage.removeItem('rememberMe');
      await refreshWallet();
      return true;
    } catch (e: unknown) {
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
      await disconnectSparkSdk();
      await invoke<void>('lock_wallet');
      localStorage.removeItem('rememberMe');
      useWalletStore.getState().clearWalletState();
      return true;
    } catch (e: unknown) {
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
