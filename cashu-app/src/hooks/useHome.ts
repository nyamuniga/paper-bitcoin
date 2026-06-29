import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../store/wallet';

export const useHome = () => {
  const balance = useWalletStore((s) => s.balanceSats);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const pendingTxs = useWalletStore((s) => s.pendingTxs);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const [invoice, setInvoice] = useState('');
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!invoice) return;
    setPaying(true);
    try {
      await invoke('pay_invoice', { invoice });
      toast.success('Invoice paid successfully!');
      setInvoice('');
    } catch (e: any) {
      toast.error(`Payment failed: ${e}`);
    } finally {
      await refreshWallet();
      setPaying(false);
    }
  };

  return {
    balance,
    mintBalances,
    pendingTxs,
    invoice,
    setInvoice,
    paying,
    handlePay
  };
};
