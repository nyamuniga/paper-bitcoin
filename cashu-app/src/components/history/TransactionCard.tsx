import { AlertCircle, CheckCircle, XCircle, Download, FileText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export interface Transaction {
  id: string;
  tx_type: any;
  amount: number;
  fee: number;
  status: 'Pending' | 'Success' | 'Failed' | 'FailedMintError';
  timestamp: number;
  mint_url: string;
  momo_direction?: string;
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
  const isReceiveEcash = 'ReceiveEcash' in tx.tx_type;
  const isReceiveLightning = 'ReceiveLightning' in tx.tx_type;
  const isReceive = isReceiveEcash || isReceiveLightning;
  const quoteId = isMint ? tx.tx_type.Mint.quote_id : (isMelt ? tx.tx_type.Melt.quote_id : '');

  const isInflow = isMint || isRedeem || isReceive || tx.momo_direction === 'RWF_TO_SATS';

  return (
    <div 
      onClick={onClick}
      className={`obsidian-card rounded-2xl p-5 border group ${isInflow && tx.status === 'Success' ? 'border-primary/20' : 'border-outline-variant'} ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
    >
      {isInflow && tx.status === 'Success' && (
        <>
          <div className="absolute inset-0 bg-[#0e2e20]/15 mix-blend-screen pointer-events-none"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        </>
      )}
      <div className="noise-overlay"></div>
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4 gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 ${
              isInflow ? 'bg-[#0e291d] border-[#1c442f] text-[#34d399]' : 'bg-[#10241b] border-[#1b3829] text-[#627d70]'
            }`}>
              {isInflow ? <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" /> : 
               isIssue ? <FileText className="w-4 h-4 stroke-[2]" /> : 
               <ArrowUpRight className="w-4 h-4 stroke-[2.25]" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-display-hero text-body-md font-semibold text-on-surface truncate">
                {tx.momo_direction === 'RWF_TO_SATS' ? 'Received RWF' :
                 tx.momo_direction === 'SATS_TO_RWF' ? 'Sent RWF' :
                 isMint ? 'Received Lightning' : 
                 isReceiveEcash ? 'Received eCash' : 
                 isReceiveLightning ? 'Received Lightning' : 
                 isIssue ? 'Issued Note' : 
                 isRedeem ? 'Redeemed Note' : 
                 isSend ? 'Sent eCash' : 
                 isMelt ? 'Sent Lightning' : 'Transaction'}
              </h3>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className={`font-mono text-body-md block ${isInflow ? 'text-primary font-bold' : 'text-on-surface font-semibold'}`}>
              {isInflow ? '+' : isIssue ? '' : '-'}₿{tx.amount.toLocaleString()}
            </span>
            {tx.fee > 0 && <span className="font-mono text-label-tag text-on-surface-variant mt-0.5 block">Fee: ₿{tx.fee}</span>}
          </div>
        </div>

        <div className={`divider-dashed my-3 ${isInflow && tx.status === 'Success' ? 'border-primary/20' : ''}`}></div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-label-caps font-label-caps">
          <div className={`flex items-center gap-2 w-full md:w-auto justify-between md:justify-start ${
            tx.status === 'Pending' ? 'text-primary' :
            tx.status === 'Success' ? 'text-secondary' :
            tx.status === 'FailedMintError' ? 'text-error' :
            'text-on-surface-variant'
          }`}>
            <div className="flex items-center gap-1.5">
              {tx.status === 'Pending' && <AlertCircle className="w-4 h-4" />}
              {tx.status === 'Success' && <CheckCircle className="w-4 h-4" />}
              {tx.status === 'Failed' && <XCircle className="w-4 h-4" />}
              {tx.status === 'FailedMintError' && <AlertCircle className="w-4 h-4" />}
              <span className="font-semibold tracking-wider">{tx.status === 'FailedMintError' ? 'Mint Error' : tx.status}</span>
            </div>
            <span className="font-mono text-on-surface-variant md:hidden">
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
                <button onClick={(e) => { e.stopPropagation(); onCheckMelt(tx.id); }} className="w-full md:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors border border-primary/30 text-label-caps font-label-caps">
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
