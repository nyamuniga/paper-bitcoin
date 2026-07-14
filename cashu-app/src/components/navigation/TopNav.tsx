import { Link } from 'react-router-dom';
import { Clock, Settings as SettingsIcon, Plus, Landmark } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';
import { useState } from 'react';
import { AddMintModal } from './AddMintModal';

export const TopNav = () => {
  const pendingTxs = useWalletStore((s) => s.pendingTxs);
  const hasPending = pendingTxs > 0;
  const [showAddMint, setShowAddMint] = useState(false);

  return (
    <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className="bg-background/80 backdrop-blur-xl docked full-width top-0 z-40 sticky border-b border-outline-variant/10">
      <div className="flex justify-between items-center w-full px-container-padding py-base max-w-[1200px] mx-auto h-14 md:h-16 relative">
        <div className="flex items-center gap-3">
          <img alt="BitNotes Logo" className="w-8 h-8 rounded-full border border-outline-variant/30 shadow-sm object-cover" src="/logo.png" />
          <span className="text-headline-lg-mobile font-headline-lg-mobile text-primary tracking-tighter hidden sm:block">BitNotes</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddMint(true)}
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-container-high relative group"
            title="Add Mint"
          >
            <Landmark className="w-5 h-5 text-current" />
            <div className="absolute top-1.5 right-1.5 bg-surface rounded-full">
              <Plus size={10} className="text-primary" strokeWidth={3} />
            </div>
          </button>
          <Link
            to="/history"
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-container-high relative"
          >
            <Clock size={20} />
            {hasPending && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-amber-400 rounded-full border-[1.5px] border-surface shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span>
            )}
          </Link>
          <Link
            to="/settings"
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-container-high"
          >
            <SettingsIcon size={20} />
          </Link>

        </div>
      </div>
      
      {showAddMint && <AddMintModal onClose={() => setShowAddMint(false)} />}
    </header>
  );
};
