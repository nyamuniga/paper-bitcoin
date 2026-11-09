import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TransferFundsForm } from '../components/home/TransferFundsForm';
import { useWalletStore } from '../store/wallet';
import { useStableBalance } from '../hooks/useStableBalance';

export function TransferFundsPage() {
  const navigate = useNavigate();
  const mintBalances = useWalletStore(state => state.mintBalances);
  const balanceView = useWalletStore(state => state.balanceView);
  const refreshWallet = useWalletStore(state => state.refreshWallet);
  const stable = useStableBalance();
  const mints = Object.keys(mintBalances);
  const preferredMint = localStorage.getItem('preferred_mint_url');
  const mintUrl = preferredMint && mints.includes(preferredMint) ? preferredMint : mints[0] ?? '';
  useEffect(() => {void refreshWallet();}, [refreshWallet]);
  return <TransferFundsForm
    initialDirection={balanceView === 'usd' ? 'toSats' : 'toUsd'}
    mintUrl={mintUrl}
    cashuBalance={mintBalances[mintUrl] ?? 0}
    stableBalance={stable.balance}
    onClose={() => {if(window.history.state?.idx > 0) navigate(-1); else navigate('/');}}
    onDone={() => navigate('/')}
    onChange={stable.refresh}
  />;
}
