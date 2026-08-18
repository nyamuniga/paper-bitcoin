import { useState } from 'react';
import { Lock, Trash2, AlertTriangle, ChevronRight, ChevronDown, Wallet, Moon, Sun } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useAuth } from '../../hooks/useAuth';
import { useThemeStore } from '../../store/themeStore';

export const WalletManagementSection = () => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const clearWalletState = useWalletStore((s) => s.clearWalletState);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const { lockWallet, resetWallet } = useAuth();
  const [isCleaning, setIsCleaning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { theme, setTheme } = useThemeStore();

  const handleLock = async () => {
    const success = await lockWallet();
    if (success) {
      clearWalletState();
      toast.success('Wallet locked');
    } else {
      toast.error('Failed to lock wallet');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const success = await resetWallet();
    if (success) {
      clearWalletState();
      toast.success('Wallet deleted');
    } else {
      toast.error('Failed to delete wallet');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCleanWallet = async () => {
    setIsCleaning(true);
    const toastId = toast.loading('Scanning for spent proofs...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const removedSats = await invoke<number>('clean_wallet');
      await refreshWallet();
      if (removedSats > 0) {
        toast.success(`Cleaned up ${removedSats} spent sats from wallet balance.`, { id: toastId });
      } else {
        toast.success('Wallet is already clean. No spent proofs found.', { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Failed to clean wallet: ${e}`, { id: toastId });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden">
      <div
        className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-surface-container-highest transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <Wallet size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Wallet & Theme</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">Preferences, lock & reset</p>
          </div>
        </div>

        <div className="text-on-surface-variant">
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-2 border-t border-outline-variant flex flex-col gap-4">
          {/* Theme Mode Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 bg-surface-container-highest rounded-xl border border-outline-variant transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </div>
              <div className="text-left min-w-0">
                <div className="font-bold text-on-surface text-sm">Theme Mode</div>
                <div className="text-xs text-on-surface-variant">
                  {theme === 'dark' ? 'Obsidian Gold' : 'Cream Gold'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  theme === 'dark'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Moon size={14} />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Sun size={14} />
                <span>Light</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleLock}
            className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Lock className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-bold text-on-surface text-sm">Lock Wallet</div>
                <div className="text-xs text-on-surface-variant">Lock with passphrase</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleCleanWallet}
            disabled={isCleaning}
            className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant transition-colors group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-bold text-on-surface text-sm">Clean Wallet</div>
                <div className="text-xs text-on-surface-variant">Purge spent proofs</div>
              </div>
            </div>
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-error/10 rounded-xl border border-outline-variant hover:border-error/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-error/10 text-error rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-error text-sm">Delete Wallet</div>
                  <div className="text-xs text-on-surface-variant group-hover:text-error/70 transition-colors">Erase local wallet data</div>
                </div>
              </div>
            </button>
          ) : (
            <div className="p-4 bg-error/10 border border-error/30 rounded-xl flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-error text-sm">Are you absolutely sure?</div>
                  <div className="text-xs text-error/80 mt-1">
                    This will permanently delete your wallet data from this device. If you haven't backed up your recovery phrase, your funds will be lost forever.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-error hover:bg-error/90 text-on-error font-bold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Wallet'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 bg-surface-container-highest hover:bg-surface-bright text-on-surface font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
