import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../store/wallet';
import { Transaction } from '../components/history/TransactionCard';

export const useHistory = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const fetchHistory = async () => {
    try {
      const txs = await invoke<Transaction[]>('get_transactions');
      setTransactions(txs);
    } catch (e) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleRetryMint = async (txId: string) => {
    try {
      toast.loading('Retrying mint...', { id: txId });
      await invoke('retry_mint', { txId });
      toast.success('Tokens minted safely!', { id: txId });
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(e.toString(), { id: txId });
    }
  };

  const handleCheckMelt = async (txId: string) => {
    try {
      toast.loading('Checking status with mint...', { id: txId });
      const status = await invoke<string>('check_melt_status', { txId });
      
      if (status === 'Success') {
        toast.success('Mint confirmed payment was successful.', { id: txId });
      } else if (status === 'Failed') {
        toast.success('Melt failed. Proofs refunded to your wallet.', { id: txId });
      } else if (status === 'FailedMintError') {
        toast.error('Mint seized proofs but did not pay the invoice!', { id: txId });
      }
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(e.toString(), { id: txId });
    }
  };

  const handleCheckIssue = async (txId: string, navigate: any) => {
    toast.loading('Loading invoice...', { id: txId });
    try {
      const pendingIssue = await invoke('get_pending_issue', { txId });
      toast.dismiss(txId);
      navigate('/issue', { state: { pendingIssue } });
    } catch (e: any) {
      toast.error(`Error: ${e}`, { id: txId });
    }
  };

  const handleDownloadNote = async (txId: string, amount: number, serial?: string) => {
    try {
      toast.loading('Generating PDF...', { id: txId });
      const filename = serial ? `note-${amount}-sats-${serial}.pdf` : `note-${amount}-sats.pdf`;
      
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const savePath = await save({
        title: 'Save Note PDF',
        defaultPath: filename,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      });

      if (savePath) {
        const pdfBytes = await invoke<number[]>('get_note_pdf', { txId });
        await writeFile(savePath, new Uint8Array(pdfBytes));
        toast.success(`Successfully saved note!`, { id: txId, duration: 5000 });
        
        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          await openPath(savePath);
        } catch (e) {
          console.log("Could not open file natively", e);
        }
      } else {
        toast.dismiss(txId);
      }
    } catch (e: any) {
      toast.error(`Failed to save: ${e}`, { id: txId });
    }
  };

  return {
    transactions,
    loading,
    fetchHistory,
    handleRetryMint,
    handleCheckMelt,
    handleCheckIssue,
    handleDownloadNote
  };
};
