import { RefreshCw } from 'lucide-react';
import { TransactionCard } from '../components/history/TransactionCard';
import { useHistory } from '../hooks/useHistory';

export default function History() {
  const {
    transactions,
    loading,
    fetchHistory,
    handleRetryMint,
    handleCheckMelt,
    handleCheckIssue,
    handleDownloadNote
  } = useHistory();

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
          {transactions.map((tx) => (
            <TransactionCard 
              key={tx.id} 
              tx={tx} 
              onRetryMint={handleRetryMint}
              onCheckMelt={handleCheckMelt}
              onCheckIssue={handleCheckIssue}
              onDownloadNote={handleDownloadNote}
            />
          ))}
        </div>
      )}
    </main>
  );
}
