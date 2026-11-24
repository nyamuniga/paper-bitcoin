import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from './store/wallet';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { TopNav } from './components/navigation/TopNav';
import { PageTransition } from './components/navigation/PageTransition';
import { TransactionProcessor } from './hooks/useTransactionProcessor';
import { AppUpdatePrompt } from './components/shared/AppUpdatePrompt';
import { useNostr } from './hooks/useNostr';
import './App.css';

const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Issue = lazy(() => import('./pages/Issue').then((m) => ({ default: m.Issue })));
const History = lazy(() => import('./pages/History'));
const Scan = lazy(() => import('./pages/Scan').then((m) => ({ default: m.Scan })));
const Mints = lazy(() => import('./pages/Mints'));
const DiscoverMints = lazy(() => import('./pages/DiscoverMints'));
const Pay = lazy(() => import('./pages/Pay').then((m) => ({ default: m.Pay })));
const AddressBook = lazy(() => import('./pages/AddressBook').then((m) => ({ default: m.AddressBook })));
const TopUpPage = lazy(() => import('./pages/MobileMoney').then((m) => ({ default: m.TopUpPage })));
const CashOutPage = lazy(() => import('./pages/MobileMoney').then((m) => ({ default: m.CashOutPage })));
const SendBitcoinPage = lazy(() => import('./pages/Bitcoin').then((m) => ({ default: m.SendBitcoinPage })));
const ReceiveBitcoinPage = lazy(() => import('./pages/Bitcoin').then((m) => ({ default: m.ReceiveBitcoinPage })));
const ReceiveEcashPage = lazy(() => import('./pages/ReceiveEcash').then((m) => ({ default: m.ReceiveEcashPage })));
const SendEcashPage = lazy(() => import('./pages/SendEcash').then((m) => ({ default: m.SendEcashPage })));
const TransferFundsPage = lazy(() => import('./pages/TransferFunds').then((m) => ({ default: m.TransferFundsPage })));


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
    invoke<boolean>('is_wallet_unlocked').then(async (unlocked) => {
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
          <Suspense fallback={null}>
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
          </Suspense>
        </PageTransition>
      </AppFrame>
    </BrowserRouter>
  );
}
