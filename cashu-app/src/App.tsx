import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, ScanLine, Send, Clock, Settings as SettingsIcon, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from './store/wallet';
import { Settings } from './pages/Settings';
import { Issue } from './pages/Issue';
import History from './pages/History';
import './App.css';

import { Auth } from './pages/Auth';
const Home = () => {
  const balance = useWalletStore((s) => s.balanceSats);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const pendingTxs = useWalletStore((s) => s.pendingTxs);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const [invoice, setInvoice] = useState('');
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!invoice) return;
    setPaying(true);
    try {
      await invoke('pay_invoice', { invoice });
      toast.success('Invoice paid successfully!');
      setInvoice('');
      await refreshWallet();
    } catch (e: any) {
      toast.error(`Payment failed: ${e}`);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="p-4">
      {pendingTxs > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 p-4 rounded-xl mb-6 flex justify-between items-center shadow-lg">
          <div>
            <div className="font-bold">Pending Transactions</div>
            <div className="text-sm opacity-90">You have {pendingTxs} pending transaction(s).</div>
          </div>
          <Link to="/history" className="bg-amber-500/20 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-500/30 transition-colors">
            Check Status
          </Link>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-4 mt-8">Wallet Balance</h1>
      <div className="bg-surface rounded-2xl p-8 text-center shadow-lg border border-gray-800 mb-8">
        <div className="text-5xl text-primary font-bold">{balance} <span className="text-lg text-gray-400">sats</span></div>
      </div>

      <h2 className="text-xl font-bold mb-4 text-gray-300">Pay Lightning Invoice</h2>
      <div className="bg-surface rounded-2xl p-6 border border-gray-800 mb-8 flex flex-col gap-4">
        <p className="text-sm text-gray-400">Pay any lightning invoice directly from your E-Cash balance.</p>
        <input 
          type="text" 
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          className="w-full bg-background border border-gray-700 rounded-xl p-4 text-white text-sm font-mono break-all" 
          placeholder="lnbc..." 
        />
        <button 
          onClick={handlePay}
          disabled={paying || !invoice}
          className="w-full bg-primary text-background font-bold py-4 rounded-xl text-lg flex justify-center items-center disabled:opacity-50"
        >
          {paying ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay Invoice'}
        </button>
      </div>

      <h2 className="text-xl font-bold mb-4 text-gray-300">Trusted Mints</h2>
      <div className="space-y-3">
        {Object.entries(mintBalances).length === 0 ? (
          <div className="text-center text-gray-500 py-4 bg-surface rounded-xl border border-gray-800">No mints connected yet</div>
        ) : (
          Object.entries(mintBalances).map(([mint, amt]) => (
            <div key={mint} className="bg-surface p-4 rounded-xl border border-gray-800 flex justify-between items-center">
              <div className="truncate text-sm text-gray-300 mr-4" title={mint}>{new URL(mint).hostname}</div>
              <div className="font-bold whitespace-nowrap">{amt as React.ReactNode} sats</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
import { Scan } from './pages/Scan';

const BottomNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'text-primary' : 'text-gray-500 hover:text-gray-300';

  return (
    <div className="fixed bottom-0 w-full bg-surface border-t border-gray-800 pb-safe z-50">
      <div className="flex justify-around items-center p-4">
        <Link to="/" className={`flex flex-col items-center ${isActive('/')}`}>
          <Wallet size={24} />
          <span className="text-xs mt-1">Wallet</span>
        </Link>
        <Link to="/history" className={`flex flex-col items-center ${isActive('/history')}`}>
          <Clock size={24} />
          <span className="text-xs mt-1">History</span>
        </Link>
        <Link to="/scan" className={`flex flex-col items-center ${isActive('/scan')}`}>
          <div className="bg-primary text-background p-4 rounded-full -mt-10 shadow-lg border-4 border-background">
            <ScanLine size={32} />
          </div>
          <span className="text-xs mt-1">Scan</span>
        </Link>
        <Link to="/issue" className={`flex flex-col items-center ${isActive('/issue')}`}>
          <Send size={24} />
          <span className="text-xs mt-1">Issue</span>
        </Link>

        <Link to="/settings" className={`flex flex-col items-center ${isActive('/settings')}`}>
          <SettingsIcon size={24} />
          <span className="text-xs mt-1">Settings</span>
        </Link>
      </div>
    </div>
  );
};

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
      <div className="min-h-screen bg-background pb-28">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/issue" element={<Issue />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
