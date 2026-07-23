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

  const lastUpdate = useWalletStore((s) => s.lastUpdate);

  useEffect(() => {
    fetchHistory();
  }, [lastUpdate]);

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

  const handleRecoverPendingTransaction = async (txId: string) => {
    try {
      toast.loading('Checking status...', { id: txId });
      const status = await invoke<string>('check_transaction_status', { txId });
      
      if (status === 'Success') {
        toast.success('Transaction was successful.', { id: txId });
      } else if (status === 'Failed') {
        toast.success('Transaction failed safely. No funds were lost.', { id: txId });
      } else if (status === 'FailedMintError') {
        toast.error('Mint seized proofs but did not pay the invoice!', { id: txId });
      } else if (status === 'Pending') {
        toast.error('Transaction is still pending.', { id: txId });
      }
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(e.toString(), { id: txId });
    }
  };

  const handleCheckIssue = async (txId: string, navigate: any) => {
    try {
      toast.loading('Checking issue status...', { id: txId });
      const success = await invoke<boolean>('check_issue_status', { txId });
      if (success) {
        toast.success('Note issued successfully!', { id: txId });
        navigate('/history');
      } else {
        toast.error('Issue is still pending.', { id: txId });
      }
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(e.toString(), { id: txId });
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

  const handleCheckTokenSpendStatus = async (txId: string) => {
    try {
      toast.loading('Checking token status...', { id: txId });
      const status = await invoke<string>('check_token_spend_status', { txId });
      if (status === 'Spent') {
        toast.success('Tokens have been successfully claimed!', { id: txId });
      } else if (status === 'Partially Spent') {
        toast.success('Some tokens were claimed, but some remain unspent.', { id: txId });
      } else {
        toast.error('Tokens are still unspent.', { id: txId });
      }
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(`Error checking status: ${e}`, { id: txId });
    }
  };

  const handleRetryReceiveEcash = async (txId: string, tokenString: string) => {
    try {
      toast.loading('Retrying claim...', { id: txId });
      await invoke('receive_ecash', { tokenString });
      toast.success('Successfully claimed eCash!', { id: txId });
      fetchHistory();
      await refreshWallet();
    } catch (e: any) {
      toast.error(`Failed to claim: ${e}`, { id: txId });
    }
  };

  return {
    transactions,
    loading,
    fetchHistory,
    handleRetryMint,
    handleRecoverPendingTransaction,
    handleCheckIssue,
    handleDownloadNote,
    handleCheckTokenSpendStatus,
    handleRetryReceiveEcash
  };
};
