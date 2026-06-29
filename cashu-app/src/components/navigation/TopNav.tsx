import { Link, useLocation } from 'react-router-dom';
import { Wallet, ScanLine, Send, Clock, Settings as SettingsIcon, Bell } from 'lucide-react';

export const TopNav = () => {
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
