import { RefreshCw } from 'lucide-react';
import { TransactionCard } from '../components/history/TransactionCard';
import { PageHeader } from '../components/shared/PageHeader';
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
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader 
        title="Transaction History" 
        subtitle="Track your past and pending payments."
        rightAction={
          <button
            onClick={fetchHistory}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-bright transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        }
      />

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
