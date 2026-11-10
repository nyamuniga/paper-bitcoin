import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BitcoinModal } from '../components/home/BitcoinModal';
import { PageHeader } from '../components/shared/PageHeader';
import { useWalletStore } from '../store/wallet';

function BitcoinPage({ direction }: { direction: 'send' | 'receive' }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const balances = useWalletStore(s => s.mintBalances);
  const mints = Object.keys(balances);
  const preferred = state?.mintUrl || localStorage.getItem('preferred_mint_url');
  const mintUrl = mints.includes(preferred) ? preferred : mints[0] || '';
  if (!mintUrl) return <main className="bitcoin-page flex flex-col">
    <PageHeader title={direction === 'send' ? 'Send Bitcoin' : 'Receive Bitcoin'} sticky={false}
      onBack={() => navigate('/')} />
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      <p className="text-on-surface-variant">Add a mint to {direction} Bitcoin.</p>
      <Link to="/mints" className="min-h-11 px-6 py-3 rounded-2xl bg-primary text-on-primary font-semibold">Manage mints</Link>
    </div>
  </main>;
  return <BitcoinModal key={direction} page mintUrl={mintUrl} initialTab={direction}
    initialInvoice={state?.invoice} initialAmountSats={state?.amountSats}
    onClose={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} />;
}

export function SendBitcoinPage() { return <BitcoinPage direction="send" />; }
export function ReceiveBitcoinPage() { return <BitcoinPage direction="receive" />; }
