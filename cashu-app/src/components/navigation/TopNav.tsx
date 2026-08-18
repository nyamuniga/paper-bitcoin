import { Link } from 'react-router-dom';
import { Clock, Settings as SettingsIcon, Landmark } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

export const TopNav = () => {
  const pendingTxs = useWalletStore((s) => s.pendingTxs);
  const hasPending = pendingTxs > 0;

  return (
    <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className="bg-surface/80 backdrop-blur-xl docked full-width top-0 z-40 sticky">
      <div className="flex justify-between items-center w-full px-container-padding py-base max-w-[1200px] mx-auto h-14 md:h-16 relative">
        <Link
          to="/"
          className="flex items-center gap-3 group hover:opacity-85 active:scale-95 transition-all duration-200"
          title="BitNotes Home"
        >
          <img alt="BitNotes Logo" className="w-8 h-8 rounded-full border border-outline-variant shadow-sm object-cover group-hover:border-primary/50 transition-colors" src="/logo.png" />
          <span className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface tracking-tighter hidden sm:block" style={{ fontWeight: 600 }}>BitNotes</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            to="/mints"
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-dim relative group"
            title="Trusted Mints"
          >
            <Landmark className="w-5 h-5 text-current" />
          </Link>
          <Link
            to="/history"
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-dim relative"
          >
            <Clock size={20} />
            {hasPending && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-[1.5px] border-surface shadow-[0_0_8px_rgba(158,124,56,0.6)]"></span>
            )}
          </Link>
          <Link
            to="/settings"
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-dim"
          >
            <SettingsIcon size={20} />
          </Link>

        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-outline-variant to-transparent"></div>
    </header>
  );
};

