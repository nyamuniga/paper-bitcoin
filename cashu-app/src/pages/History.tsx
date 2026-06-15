import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, AlertCircle, CheckCircle, XCircle, Download, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
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
  const handleDownloadNote = async (txId: string, amount: number) => {
    try {
      toast.loading('Generating PDF...', { id: txId });
      const svgBase64 = await invoke<string>('get_note_svg', { txId });
      
      const svgText = atob(svgBase64);
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
      const svgElement = svgDoc.documentElement;
      
      const doc = new jsPDF({ orientation: 'landscape', format: [920, 420], unit: 'pt' });
      await doc.svg(svgElement, { x: 0, y: 0, width: 920, height: 420 });
      
      const pdfDataUri = doc.output('datauristring');
      const base64Data = pdfDataUri.split(',')[1];

      const filename = `note-${amount}-sats.pdf`;
      const savePath = await invoke<string>('save_file_to_disk', { base64Data, filename });
      toast.success(`Saved to ${savePath}`, { id: txId, duration: 5000 });
    } catch (e: any) {
      toast.error(`Failed to save: ${e}`, { id: txId });
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-500">
            Transaction History
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Track your past and pending payments.</p>
        </div>
        <button
          onClick={fetchHistory}
          className="p-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-2xl border border-slate-800/50">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const isMint = 'Mint' in tx.tx_type;
            const isIssue = 'Issue' in tx.tx_type;
            const isMelt = 'Melt' in tx.tx_type;
            const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : '');

            return (
              <div key={tx.id} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isMint ? 'bg-emerald-500/10 text-emerald-400' : isIssue ? 'bg-indigo-500/10 text-indigo-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {isMint ? <CheckCircle className="w-5 h-5" /> : isIssue ? <FileText className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-semibold text-white">
                        {isMint ? 'Received / Mint' : isIssue ? 'Issued Note' : 'Sent / Melt'}
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-[200px]">
                        {tx.mint_url}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${isMint ? 'text-emerald-400' : isIssue ? 'text-indigo-400' : 'text-white'}`}>
                      {isMint ? '+' : isIssue ? '' : '-'}{tx.amount} sats
                    </div>
                    {tx.fee > 0 && <div className="text-xs text-slate-500">Fee: {tx.fee} sats</div>}
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    {tx.status === 'Pending' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                    {tx.status === 'Success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    {tx.status === 'Failed' && <XCircle className="w-4 h-4 text-slate-500" />}
                    {tx.status === 'FailedMintError' && <AlertCircle className="w-4 h-4 text-rose-500" />}
                    
                    <span className={`text-sm font-medium ${
                      tx.status === 'Pending' ? 'text-amber-500' :
                      tx.status === 'Success' ? 'text-emerald-500' :
                      tx.status === 'FailedMintError' ? 'text-rose-500' :
                      'text-slate-400'
                    }`}>
                      {tx.status === 'FailedMintError' ? 'Mint Error' : tx.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500">
                    {new Date(tx.timestamp * 1000).toLocaleString()}
                  </div>
                </div>

                {tx.status === 'Pending' && (
                  <div className="flex gap-2 mt-1">
                    {isMint ? (
                      <button
                        onClick={() => handleRetryMint(tx.id)}
                        className="flex-1 bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 p-2 rounded-xl text-sm font-medium transition-colors"
                      >
                        Retry Mint
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCheckMelt(tx.id)}
                        className="flex-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 p-2 rounded-xl text-sm font-medium transition-colors"
                      >
                        Check Status & Refund
                      </button>
                    )}
                  </div>
                )}
                
                {tx.status === 'FailedMintError' && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
                    The mint marked your proofs as spent but the invoice was not paid. Contact the mint operator with Quote ID: <span className="font-mono bg-rose-950 px-1 rounded">{quoteId}</span>
                  </div>
                )}
                
                {isIssue && tx.status === 'Success' && (
                  <div className="flex mt-1">
                    <button
                      onClick={() => handleDownloadNote(tx.id, tx.amount)}
                      className="w-full flex justify-center items-center gap-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 p-2 rounded-xl text-sm font-bold transition-colors"
                    >
                      <Download className="w-4 h-4" /> Download SVG / PDF
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
