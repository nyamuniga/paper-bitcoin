import { useLocation, useNavigate } from 'react-router-dom';
import { EcashModal } from '../components/home/EcashModal';
import { useWalletStore } from '../store/wallet';

export function SendEcashPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const mintBalances = useWalletStore(s => s.mintBalances);
  const mints = Object.keys(mintBalances);
  const preferred = state?.mintUrl || localStorage.getItem('preferred_mint_url');
  const mintUrl = mints.includes(preferred) ? preferred : mints[0] || '';
  return <EcashModal page mintUrl={mintUrl} initialTab="send" initialRequest={state?.ecashRequest}
    onClose={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} />;
}
