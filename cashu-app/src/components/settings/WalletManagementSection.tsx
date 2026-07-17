import { useState } from 'react';
import { Lock, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useAuth } from '../../hooks/useAuth';

export const WalletManagementSection = () => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const setInitialized = useWalletStore((s) => s.setInitialized);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);
  const { lockWallet, resetWallet } = useAuth();
  const [isCleaning, setIsCleaning] = useState(false);

  const handleLock = async () => {
    const success = await lockWallet();
    if (success) {
      setInitialized(false);
      toast.success('Wallet locked');
    } else {
      toast.error('Failed to lock wallet');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const success = await resetWallet();
    if (success) {
      setInitialized(false);
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
    <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/30">
      <div className="mb-6">
        <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1">Wallet Management</h2>
        <p className="text-sm text-on-surface-variant">Lock your wallet or permanently delete it from this device.</p>
      </div>

      <div className="flex flex-col gap-4">
        <button
          onClick={handleLock}
          className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant/20 transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="font-bold text-on-surface text-sm">Lock Wallet</div>
              <div className="text-xs text-on-surface-variant">Require passphrase to access again</div>
            </div>
          </div>
        </button>

        <button
          onClick={handleCleanWallet}
          disabled={isCleaning}
          className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant/20 transition-colors group cursor-pointer disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="font-bold text-on-surface text-sm">Clean Wallet</div>
              <div className="text-xs text-on-surface-variant">Remove ghost spent proofs from balance</div>
            </div>
          </div>
        </button>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-between p-4 bg-surface-container-highest hover:bg-error/10 rounded-xl border border-outline-variant/20 hover:border-error/30 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-error/10 text-error rounded-lg">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-bold text-error text-sm">Delete Wallet</div>
                <div className="text-xs text-on-surface-variant group-hover:text-error/70 transition-colors">Permanently remove wallet data</div>
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
    </section>
  );
};
