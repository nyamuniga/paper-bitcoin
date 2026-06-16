import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, ScanLine, Send, Clock, Settings as SettingsIcon, Loader2, Bell } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from './store/wallet';
import { Settings } from './pages/Settings';
import { Issue } from './pages/Issue';
import History from './pages/History';
import { Auth } from './pages/Auth';
import { Scan } from './pages/Scan';
import './App.css';

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
    } catch (e: any) {
      toast.error(`Payment failed: ${e}`);
    } finally {
      await refreshWallet();
      setPaying(false);
    }
  };

  return (
    <main className="relative z-10 px-container-padding max-w-[1200px] mx-auto pt-6 grid grid-cols-1 md:grid-cols-12 gap-card-gap md:gap-12 pb-8">
      <div className="md:col-span-7 flex flex-col gap-card-gap">
        {pendingTxs > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 p-4 rounded-xl mb-2 flex justify-between items-center shadow-lg">
            <div>
              <div className="font-bold">Pending Transactions</div>
              <div className="text-sm opacity-90">You have {pendingTxs} pending transaction(s).</div>
            </div>
            <Link to="/history" className="bg-amber-500/20 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-500/30 transition-colors">
              Check Status
            </Link>
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Wallet Balance</h2>
          <div className="bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 flex flex-col items-center justify-center min-h-[160px]">
            <div className="absolute inset-0 texture-overlay opacity-50"></div>
            <div className="relative z-10 flex items-baseline gap-2">
              <span className="text-display-lg font-display-lg text-primary tracking-tight">{balance}</span>
              <span className="text-label-caps font-label-caps text-on-surface-variant">sats</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2 mt-4 md:mt-0">
          <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Pay Lightning Invoice</h2>
          <div className="bg-surface-container-high rounded-xl p-6 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 flex flex-col gap-4">
            <div className="absolute inset-0 texture-overlay opacity-30"></div>
            <p className="text-body-md font-body-md text-on-surface-variant relative z-10">Pay any lightning invoice directly from your E-Cash balance.</p>
            <div className="relative z-10 flex flex-col gap-4">
              <div className="relative glow-effect transition-shadow duration-300 rounded-lg">
                <textarea 
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  className="w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none resize-none placeholder:text-on-surface-variant/50" 
                  placeholder="lnbc..." 
                  rows={2}
                />
              </div>
              <button 
                onClick={handlePay}
                disabled={paying || !invoice}
                className="btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center disabled:opacity-50"
              >
                {paying ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay Invoice'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="md:col-span-5 flex flex-col gap-card-gap mt-4 md:mt-0">
        <section className="flex flex-col gap-2">
          <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">Trusted Mints</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(mintBalances).length === 0 ? (
              <div className="text-center text-on-surface-variant py-4 bg-surface-container-high rounded-xl border border-outline-variant/10">No mints connected yet</div>
            ) : (
              Object.entries(mintBalances).map(([mint, amt]) => (
                <div key={mint} className="bg-surface-container-high rounded-xl p-4 flex justify-between items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-outline-variant/10 relative overflow-hidden group hover:bg-surface-container-highest transition-colors cursor-pointer">
                  <div className="absolute inset-0 texture-overlay opacity-20"></div>
                  <span className="text-body-md font-body-md text-on-surface relative z-10 truncate mr-4" title={mint}>{new URL(mint).hostname}</span>
                  <div className="flex items-baseline gap-1 relative z-10 whitespace-nowrap">
                    <span className="text-headline-lg-mobile text-[20px] font-headline-lg-mobile text-on-surface">{amt as React.ReactNode}</span>
                    <span className="text-label-caps font-label-caps text-on-surface-variant">sats</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

const TopNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface transition-colors';

  return (
    <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className="bg-background/80 backdrop-blur-xl docked full-width top-0 z-40 sticky border-b border-outline-variant/10">
      <div className="flex justify-between items-center w-full px-container-padding py-base max-w-[1200px] mx-auto h-16 relative">
        <div className="flex items-center gap-3">
          <img alt="BitNotes Logo" className="w-8 h-8 rounded-full border border-outline-variant/30 shadow-sm object-cover" src="/logo.png"/>
          <span className="text-headline-lg-mobile font-headline-lg-mobile text-primary tracking-tighter hidden sm:block">BitNotes</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2 h-full">
          <Link to="/" className={`flex flex-col items-center justify-center h-full relative ${isActive('/')} ${location.pathname === '/' ? "after:content-[''] after:absolute after:bottom-0 after:w-full after:h-0.5 after:bg-primary after:shadow-[0_0_8px_rgba(255,184,116,0.8)]" : ""}`}>
            <div className="flex items-center gap-2">
              <Wallet size={16} fill={location.pathname === '/' ? "currentColor" : "none"} strokeWidth={location.pathname === '/' ? 0 : 2} />
              <span className="text-label-caps font-label-caps text-[12px]">Wallet</span>
            </div>
          </Link>
          <Link to="/history" className={`flex items-center gap-2 h-full ${isActive('/history')}`}>
            <Clock size={16} />
            <span className="text-label-caps font-label-caps text-[12px]">History</span>
          </Link>
          <Link to="/issue" className={`flex items-center gap-2 h-full ${isActive('/issue')}`}>
            <Send size={16} />
            <span className="text-label-caps font-label-caps text-[12px]">Issue</span>
          </Link>
          <Link to="/settings" className={`flex items-center gap-2 h-full ${isActive('/settings')}`}>
            <SettingsIcon size={16} />
            <span className="text-label-caps font-label-caps text-[12px]">Settings</span>
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/scan" className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors border border-primary/20">
            <ScanLine size={16} />
            <span className="text-label-caps font-bold">Scan</span>
          </Link>
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:opacity-80 active:scale-95 duration-200">
            <Bell size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

const BottomNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'text-primary' : 'text-on-secondary-container opacity-60';

  return (
    <nav className="md:hidden bg-secondary-container/70 dark:bg-secondary-container/70 docked full-width bottom-0 rounded-t-xl backdrop-blur-xl border-t border-outline-variant/30 shadow-lg fixed left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3">
      <Link to="/" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/')}`}>
        {location.pathname === '/' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Wallet size={24} className="mb-1 group-hover:scale-110 transition-transform" fill={location.pathname === '/' ? "currentColor" : "none"} strokeWidth={location.pathname === '/' ? 0 : 2} />
        <span className="text-label-caps font-label-caps text-[10px]">Wallet</span>
      </Link>

      <Link to="/history" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/history')}`}>
        {location.pathname === '/history' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Clock size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">History</span>
      </Link>

      <Link to="/scan" className="flex flex-col items-center justify-center -mt-8 relative group">
        <div className="bg-primary w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(255,184,116,0.4)] group-hover:scale-105 transition-transform border-4 border-background">
          <ScanLine size={28} className="text-on-primary" />
        </div>
        <span className={`text-label-caps font-label-caps text-[10px] mt-1 hover:opacity-100 transition-opacity ${isActive('/scan')}`}>Scan</span>
      </Link>

      <Link to="/issue" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/issue')}`}>
        {location.pathname === '/issue' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Send size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">Issue</span>
      </Link>

      <Link to="/settings" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/settings')}`}>
        {location.pathname === '/settings' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <SettingsIcon size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">Settings</span>
      </Link>
    </nav>
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
      <div className="fixed inset-0 texture-overlay z-0 pointer-events-none"></div>
      <div className="min-h-screen bg-background md:pb-8 pb-28 relative z-10 flex flex-col">
        <TopNav />
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

