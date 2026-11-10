import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MomoTransferModal } from '../components/home/MomoTransferModal';
import { PageHeader } from '../components/shared/PageHeader';
import { useWalletStore } from '../store/wallet';

function MobileMoneyPage({ cashout }: { cashout: boolean }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const balances = useWalletStore(s => s.mintBalances);
  const mints = Object.keys(balances);
  const preferred = state?.mintUrl || localStorage.getItem('preferred_mint_url');
  const mint = mints.includes(preferred) ? preferred : mints[0] || '';
  const back = () => window.history.state?.idx > 0 ? navigate(-1) : navigate('/');
  if (!mint) return <main className="momo-page flex flex-col">
    <PageHeader title={cashout ? 'Cash out' : 'Top up'} sticky={false} onBack={back} />
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      <p className="text-on-surface-variant">Add a mint to use Mobile Money.</p>
      <Link to="/mints" className="min-h-11 px-6 py-3 rounded-2xl bg-primary text-on-primary font-semibold">Manage mints</Link>
    </div>
  </main>;
  return <MomoTransferModal key={cashout ? 'cashout' : 'topup'} page mintUrl={mint} initialTab={cashout ? 'send' : 'receive'} onClose={back} />;
}
export function TopUpPage() { return <MobileMoneyPage cashout={false} />; }
export function CashOutPage() { return <MobileMoneyPage cashout />; }
