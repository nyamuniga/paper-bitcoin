import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, AlertCircle, CheckCircle, XCircle, Download, FileText, ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../store/wallet';

interface Transaction {
  id: string;
  tx_type: any; // Mint or Melt
  amount: number;
  fee: number;
  status: 'Pending' | 'Success' | 'Failed' | 'FailedMintError';
  timestamp: number;
  mint_url: string;
}

export default function History() {
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

  const handleCheckIssue = async (txId: string) => {
    toast.loading('Checking issuance status...', { id: txId });
    try {
      await invoke('check_issue_status', { txId });
      toast.success('Note issued successfully!', { id: txId });
      fetchHistory();
      refreshWallet();
    } catch (e: any) {
      toast.error(`Status: ${e}`, { id: txId });
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

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">
            Transaction History
          </h1>
          <p className="text-on-surface-variant text-body-md font-body-md">Track your past and pending payments.</p>
        </div>
        <button
          onClick={fetchHistory}
          className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-bright transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-on-surface-variant">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface-container-high rounded-xl border border-outline-variant/10">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-card-gap">
          {transactions.map((tx) => {
            const isMint = 'Mint' in tx.tx_type;
            const isIssue = 'Issue' in tx.tx_type;
            const isMelt = 'Melt' in tx.tx_type;
            const isRedeem = 'Redeem' in tx.tx_type;
            const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : '');

            return (
              <div key={tx.id} className={`obsidian-card rounded-xl p-5 border group ${isMint && tx.status === 'Success' ? 'border-emerald-900/30' : 'border-surface-container-high/50'}`}>
                {isMint && tx.status === 'Success' && (
                  <>
                    <div className="absolute inset-0 bg-emerald-900/5 mix-blend-screen pointer-events-none"></div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                  </>
                )}
                <div className="noise-overlay"></div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                        isMint ? 'bg-emerald-900/30 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 
                        isIssue ? 'bg-primary-container/20 border-primary/20' : 
                        isRedeem ? 'bg-amber-500/20 border-amber-500/20' :
                        'bg-error-container/20 border-error/20'
                      }`}>
                        {isMint ? <ArrowDown className="text-emerald-400 w-4 h-4" /> : 
                         isIssue ? <FileText className="text-primary w-4 h-4" /> : 
                         isRedeem ? <ArrowDown className="text-amber-400 w-4 h-4" /> :
                         <ArrowUp className="text-error w-4 h-4" />}
                      </div>
                      <div>
                        <h3 className="text-body-md font-body-md font-semibold text-on-surface">
                          {isMint ? 'Received / Mint' : isIssue ? 'Issued Note' : isRedeem ? 'Redeemed Note' : 'Sent / Melt'}
                        </h3>
                        <p className="text-label-caps font-label-caps text-on-surface-variant mt-1 max-w-[200px] truncate" title={tx.mint_url}>
                          {tx.mint_url || 'Local Wallet'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-body-md font-body-md font-bold block ${isMint || isRedeem ? 'text-emerald-400' : isIssue ? 'text-primary' : 'text-on-surface'}`}>
                        {isMint || isRedeem ? '+' : isIssue ? '' : '-'}{tx.amount} sats
                      </span>
                      {tx.fee > 0 && <span className="text-label-caps font-label-caps text-on-surface-variant mt-1 block">Fee: {tx.fee} sats</span>}
                    </div>
                  </div>

                  <div className={`divider-dashed my-3 ${isMint && tx.status === 'Success' ? 'border-emerald-900/50' : ''}`}></div>

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-label-caps font-label-caps">
                    <div className={`flex items-center gap-2 w-full md:w-auto justify-between md:justify-start ${
                      tx.status === 'Pending' ? 'text-amber-500' :
                      tx.status === 'Success' ? 'text-emerald-400' :
                      tx.status === 'FailedMintError' ? 'text-rose-500' :
                      'text-on-surface-variant'
                    }`}>
                      <div className="flex items-center gap-2">
                        {tx.status === 'Pending' && <AlertCircle className="w-4 h-4" />}
                        {tx.status === 'Success' && <CheckCircle className="w-4 h-4" />}
                        {tx.status === 'Failed' && <XCircle className="w-4 h-4" />}
                        {tx.status === 'FailedMintError' && <AlertCircle className="w-4 h-4" />}
                        <span>{tx.status === 'FailedMintError' ? 'Mint Error' : tx.status}</span>
                      </div>
                      <span className="text-on-surface-variant md:hidden">
                        {new Date(tx.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>

                    {isIssue && tx.status === 'Success' && (
                      <button onClick={() => handleDownloadNote(tx.id, tx.amount, tx.tx_type?.Issue?.note?.serial)} className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-colors border border-outline-variant/30 text-label-caps font-label-caps">
                        <Download className="w-4 h-4" /> Download SVG / PDF
                      </button>
                    )}

                    {tx.status === 'Pending' && (
                      <div className="flex gap-2 w-full md:w-auto">
                        {isMint ? (
                          <button onClick={() => handleRetryMint(tx.id)} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors border border-teal-500/30 text-label-caps font-label-caps">
                            Retry Mint
                          </button>
                        ) : isIssue ? (
                          <button onClick={() => handleCheckIssue(tx.id)} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps">
                            Check Status & Resume
                          </button>
                        ) : (
                          <button onClick={() => handleCheckMelt(tx.id)} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors border border-amber-500/30 text-label-caps font-label-caps">
                            Check Status & Refund
                          </button>
                        )}
                      </div>
                    )}

                    {tx.status === 'FailedMintError' && (
                      <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 w-full md:w-auto">
                        The mint marked your proofs as spent but the invoice was not paid. Contact the mint operator with Quote ID: <span className="font-mono bg-rose-950 px-1 rounded">{quoteId}</span>
                      </div>
                    )}

                    <span className="text-on-surface-variant hidden md:block">
                      {new Date(tx.timestamp * 1000).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
