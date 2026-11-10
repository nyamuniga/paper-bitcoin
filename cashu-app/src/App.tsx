import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from './store/wallet';
import { Settings } from './pages/Settings';
import { Issue } from './pages/Issue';
import History from './pages/History';
import { Auth } from './pages/Auth';
import { Scan } from './pages/Scan';
import { Home } from './pages/Home';
import Mints from './pages/Mints';
import DiscoverMints from './pages/DiscoverMints';
import { Pay } from './pages/Pay';
import { AddressBook } from './pages/AddressBook';
import { TopUpPage, CashOutPage } from './pages/MobileMoney';
import { SendBitcoinPage, ReceiveBitcoinPage } from './pages/Bitcoin';
import { ReceiveEcashPage } from './pages/ReceiveEcash';
import { SendEcashPage } from './pages/SendEcash';
import { TransferFundsPage } from './pages/TransferFunds';
import { TopNav } from './components/navigation/TopNav';
import { PageTransition } from './components/navigation/PageTransition';
import { TransactionProcessor } from './hooks/useTransactionProcessor';
import { AppUpdatePrompt } from './components/shared/AppUpdatePrompt';
import { useNostr } from './hooks/useNostr';
import './App.css';


function AppFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isViewportForm = pathname === '/scan' || pathname === '/top-up' || pathname === '/cash-out' || pathname === '/send-bitcoin' || pathname === '/receive-bitcoin' || pathname === '/send-ecash' || pathname === '/receive-ecash' || pathname === '/convert';
  return <div className={`app-frame bg-background relative z-10 flex flex-col ${isViewportForm ? 'h-dvh min-h-0 overflow-hidden' : 'min-h-screen pb-8'}`}>
    {children}
  </div>;
}

export default function App() {
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isInitialized = useWalletStore((s) => s.isInitialized);

  useNostr();

  useEffect(() => {
    invoke('is_wallet_unlocked').then(async (unlocked) => {
      if (unlocked) {
        await refreshWallet();
      }
    }).catch(console.error);
  }, []);

  if (!isInitialized) {
    return <Auth />;
  }

  return (
    <BrowserRouter>
      <TransactionProcessor />
      <AppUpdatePrompt />
      <div className="fixed inset-0 texture-overlay z-0 pointer-events-none"></div>
      <AppFrame>
        <TopNav />
        <PageTransition>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/top-up" element={<TopUpPage />} />
            <Route path="/cash-out" element={<CashOutPage />} />
            <Route path="/send-bitcoin" element={<SendBitcoinPage />} />
            <Route path="/receive-bitcoin" element={<ReceiveBitcoinPage />} />
            <Route path="/receive-ecash" element={<ReceiveEcashPage />} />
            <Route path="/send-ecash" element={<SendEcashPage />} />
            <Route path="/convert" element={<TransferFundsPage />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/issue" element={<Issue />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/mints" element={<Mints />} />
            <Route path="/discover" element={<DiscoverMints />} />
            <Route path="/pay" element={<Pay />} />
            <Route path="/address-book" element={<AddressBook />} />
          </Routes>
        </PageTransition>
      </AppFrame>
    </BrowserRouter>
  );
}
