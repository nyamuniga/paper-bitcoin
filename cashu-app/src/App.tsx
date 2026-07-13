import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from './store/wallet';
import { Settings } from './pages/Settings';
import { Issue } from './pages/Issue';
import History from './pages/History';
import { Auth } from './pages/Auth';
import { Scan } from './pages/Scan';
import { Home } from './pages/Home';
import { TopNav } from './components/navigation/TopNav';
import './App.css';

export default function App() {
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const isInitialized = useWalletStore((s) => s.isInitialized);

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
      <div className="fixed inset-0 texture-overlay z-0 pointer-events-none"></div>
      <div className="min-h-screen bg-background pb-8 relative z-10 flex flex-col">
        <TopNav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/issue" element={<Issue />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
