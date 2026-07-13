import { AlertCircle, CheckCircle, XCircle, Download, FileText, ArrowDown, ArrowUp } from 'lucide-react';

export interface Transaction {
  id: string;
  tx_type: any;
  amount: number;
  fee: number;
  status: 'Pending' | 'Success' | 'Failed' | 'FailedMintError';
  timestamp: number;
  mint_url: string;
}

interface TransactionCardProps {
  tx: Transaction;
  onRetryMint: (txId: string) => void;
  onCheckMelt: (txId: string) => void;
  onCheckIssue: (txId: string) => void;
  onDownloadNote: (txId: string, amount: number, serial?: string) => void;
  onClick?: () => void;
}

export const TransactionCard = ({ tx, onRetryMint, onCheckMelt, onCheckIssue, onDownloadNote, onClick }: TransactionCardProps) => {
  const isMint = 'Mint' in tx.tx_type;
  const isIssue = 'Issue' in tx.tx_type;
  const isMelt = 'Melt' in tx.tx_type;
  const isRedeem = 'Redeem' in tx.tx_type;
  const isSend = 'Send' in tx.tx_type;
  const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : '');

  return (
    <div 
      onClick={onClick}
      className={`obsidian-card rounded-xl p-5 border group ${isMint && tx.status === 'Success' ? 'border-emerald-900/30' : 'border-surface-container-high/50'} ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
    >
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
              isSend ? 'bg-tertiary/20 border-tertiary/20' :
              'bg-error-container/20 border-error/20'
            }`}>
              {isMint ? <ArrowDown className="text-emerald-400 w-4 h-4" /> : 
               isIssue ? <FileText className="text-primary w-4 h-4" /> : 
               isRedeem ? <ArrowDown className="text-amber-400 w-4 h-4" /> :
               isSend ? <ArrowUp className="text-tertiary w-4 h-4" /> :
               <ArrowUp className="text-error w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-body-md font-body-md font-semibold text-on-surface">
                {isMint ? 'Received / Mint' : isIssue ? 'Issued Note' : isRedeem ? 'Redeemed Note' : isSend ? 'Sent Ecash' : 'Sent / Melt'}
              </h3>
              <p className="text-label-caps font-label-caps text-on-surface-variant mt-1 max-w-[200px] truncate" title={tx.mint_url}>
                {tx.mint_url || 'Local Wallet'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-body-md font-body-md font-bold block ${isMint || isRedeem ? 'text-emerald-400' : isIssue ? 'text-primary' : isSend ? 'text-tertiary' : 'text-on-surface'}`}>
              {isMint || isRedeem ? '+' : isIssue ? '' : '-'}₿{tx.amount}
            </span>
            {tx.fee > 0 && <span className="text-label-caps font-label-caps text-on-surface-variant mt-1 block">Fee: ₿{tx.fee}</span>}
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
            <button onClick={(e) => { e.stopPropagation(); onDownloadNote(tx.id, tx.amount, tx.tx_type?.Issue?.note?.serial); }} className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-colors border border-outline-variant/30 text-label-caps font-label-caps">
              <Download className="w-4 h-4" /> Download SVG / PDF
            </button>
          )}

          {tx.status === 'Pending' && (
            <div className="flex gap-2 w-full md:w-auto">
              {isMint ? (
                <button onClick={(e) => { e.stopPropagation(); onRetryMint(tx.id); }} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors border border-teal-500/30 text-label-caps font-label-caps">
                  Retry Mint
                </button>
              ) : isIssue ? (
                <button onClick={(e) => { e.stopPropagation(); onCheckIssue(tx.id); }} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps">
                  Check Status & Resume
                </button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors border border-amber-500/30 text-label-caps font-label-caps">
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
};
