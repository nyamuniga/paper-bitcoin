import { Link, useLocation } from 'react-router-dom';
import { Clock, Settings as SettingsIcon, Landmark } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

export const TopNav = () => {
  const location = useLocation();
  const pendingTxs = useWalletStore((s) => s.pendingTxs);
  const hasPending = pendingTxs > 0;

  return (
    <header 
      style={{ paddingTop: 'env(safe-area-inset-top)' }} 
      className="bg-background top-0 left-0 w-full z-40 sticky"
    >
      <div className="flex justify-between items-center w-full px-4 sm:px-6 md:px-8 max-w-[1200px] mx-auto h-16 relative">
        <Link
          to="/"
          className="group hover:opacity-90 active:scale-95 transition-all duration-200 flex items-center gap-3"
          title="BitNotes Home"
        >
          <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-[#f2a93b]/15 blur-md pointer-events-none group-hover:bg-[#f2a93b]/30 transition-all"></div>
            <img
              alt="BitNotes"
              className="w-full h-full object-contain relative z-10 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              src="/logo.png"
            />
          </div>
          <span className="font-display-hero text-lg font-bold text-[#f7f4eb] tracking-tight hidden sm:inline">
            BitNotes
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5 bg-[#0c1b14] border border-[#142d20] rounded-full p-1 shadow-sm">
          <Link
            to="/"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all ${
              location.pathname === '/'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            Wallet
          </Link>
          <Link
            to="/issue"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all ${
              location.pathname === '/issue'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            Issue
          </Link>
          <Link
            to="/scan"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all ${
              location.pathname === '/scan'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            Scan
          </Link>
          <Link
            to="/mints"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all ${
              location.pathname === '/mints' || location.pathname === '/discover'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            Mints
          </Link>
          <Link
            to="/history"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all relative ${
              location.pathname === '/history'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            History
            {hasPending && (
              <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full ml-1.5 align-middle animate-pulse"></span>
            )}
          </Link>
          <Link
            to="/settings"
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-all ${
              location.pathname === '/settings'
                ? 'bg-[#183626] text-primary border border-[#2b563e]'
                : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]'
            }`}
          >
            Settings
          </Link>
        </nav>

        {/* Mobile Navigation Icons */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            to="/mints"
            className="p-2 text-[#8b9e94] hover:text-primary transition-colors active:scale-95 duration-150 rounded-full"
            title="Trusted Mints"
          >
            <Landmark className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </Link>
          <Link
            to="/history"
            className="p-2 text-[#8b9e94] hover:text-primary transition-colors active:scale-95 duration-150 rounded-full relative"
            title="History"
          >
            <Clock className="w-[22px] h-[22px]" strokeWidth={1.75} />
            {hasPending && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(242,169,59,0.9)]"></span>
            )}
          </Link>
          <Link
            to="/settings"
            className="p-2 text-[#8b9e94] hover:text-primary transition-colors active:scale-95 duration-150 rounded-full"
            title="Settings"
          >
            <SettingsIcon className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </header>
  );
};

