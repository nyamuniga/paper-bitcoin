import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../store/wallet';

export const useMints = () => {
  const [loading, setLoading] = useState(false);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const addMint = async (mintUrl: string) => {
    setLoading(true);
    try {
      await invoke<void>('add_mint', { mintUrl });
      toast.success('Mint added successfully');
      await refreshWallet();
      return true;
    } catch (e: unknown) {
      toast.error(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeMint = async (mintUrl: string) => {
    setLoading(true);
    try {
      await invoke<void>('remove_mint', { mintUrl });
      toast.success('Mint removed successfully');
      await refreshWallet();
      return true;
    } catch (e: unknown) {
      toast.error(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    addMint,
    removeMint
  };
};
