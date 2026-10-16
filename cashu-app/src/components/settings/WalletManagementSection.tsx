import { useState, useEffect } from 'react';
import { Lock, Trash2, AlertTriangle, ChevronDown, Wallet, Terminal } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import { useWalletStore } from '../../store/wallet';
import { useAuth } from '../../hooks/useAuth';
import { CleanWalletModal, CleanWalletResult } from './CleanWalletModal';

interface WalletManagementSectionProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const WalletManagementSection: React.FC<WalletManagementSectionProps> = ({
  isExpanded: isExpandedProp,
  onToggle,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const clearWalletState = useWalletStore((s) => s.clearWalletState);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const { lockWallet, resetWallet } = useAuth();
  const [isCleaning, setIsCleaning] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const toggleExpanded = onToggle || (() => setInternalExpanded((prev) => !prev));

  // Live Clean Logs & Modal State
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleanLogs, setCleanLogs] = useState<string[]>([]);
  const [cleanResult, setCleanResult] = useState<CleanWalletResult | null>(null);
  const [cleanError, setCleanError] = useState<string | null>(null);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<string>('clean-wallet-progress', (event) => {
      setCleanLogs((prev) => [...prev, event.payload]);
    }).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

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
    setShowCleanModal(true);
    setIsCleaning(true);
    setCleanLogs([]);
    setCleanResult(null);
    setCleanError(null);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res: any = await invoke('clean_wallet');
      await refreshWallet();

      const resultData: CleanWalletResult = {
        removed_sats: typeof res === 'number' ? res : res?.removed_sats ?? 0,
        restored_sats: res?.restored_sats ?? 0,
        derivation_index: res?.derivation_index ?? 0,
        cleaned_txs: res?.cleaned_txs ?? 0,
      };
      setCleanResult(resultData);

      const details: string[] = [];
      if (resultData.removed_sats > 0) details.push(`${resultData.removed_sats} spent sats removed`);
      if (resultData.restored_sats > 0) details.push(`${resultData.restored_sats} sats restored`);
      if (resultData.cleaned_txs > 0) details.push(`${resultData.cleaned_txs} stuck txs cleared`);
      if (resultData.derivation_index !== undefined) details.push(`counter reset to ${resultData.derivation_index}`);

      if (details.length > 0) {
        toast.success(`Wallet cleaned: ${details.join(', ')}.`);
      } else {
        toast.success('Wallet is clean and counters are synchronized.');
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      setCleanError(msg);
      toast.error(`Failed to clean wallet: ${msg}`);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden">
      <div
        className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-surface-container-highest transition-colors select-none"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <Wallet size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Wallet Management</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">Clean, lock & reset</p>
          </div>
        </div>

        <div className="text-on-surface-variant shrink-0">
          <ChevronDown
            size={20}
            className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded ? 'rotate-180 text-primary' : 'text-on-surface-variant'
            }`}
          />
        </div>
      </div>

      <div className={isExpanded ? 'accordion-content-expand' : 'accordion-content-collapse'}>
        <div className={`accordion-inner-content ${isExpanded ? 'accordion-inner-content-open' : 'accordion-inner-content-closed'}`}>
          <div className="px-6 pb-6 pt-2 border-t border-outline-variant flex flex-col gap-4">

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
            className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-bold text-on-surface text-sm flex items-center gap-2">
                  <span>Clean Wallet</span>
                  {isCleaning && (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      In Progress
                    </span>
                  )}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {isCleaning
                    ? 'Syncing mint proofs... Click to view live terminal'
                    : 'Purge spent proofs & fix output collisions'}
                </div>
              </div>
            </div>
            {cleanLogs.length > 0 && (
              <span className="text-[11px] font-mono text-primary flex items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20">
                <Terminal size={12} />
                <span>Logs ({cleanLogs.length})</span>
              </span>
            )}
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
      </div>
    </div>

      {/* Real-time Clean & Restore Logs Modal */}
      <CleanWalletModal
        isOpen={showCleanModal}
        onClose={() => setShowCleanModal(false)}
        isCleaning={isCleaning}
        logs={cleanLogs}
        result={cleanResult}
        error={cleanError}
        onRunAgain={handleCleanWallet}
      />
    </section>
  );
};
