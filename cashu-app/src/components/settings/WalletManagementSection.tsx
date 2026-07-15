import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Lock, Trash2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';

export const WalletManagementSection = () => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const setInitialized = useWalletStore((s) => s.setInitialized);

  const handleLock = async () => {
    try {
      await invoke('lock_wallet');
      setInitialized(false);
      toast.success('Wallet locked');
    } catch (e: any) {
      toast.error(e.toString());
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await invoke('reset_wallet');
      setInitialized(false);
      toast.success('Wallet deleted');
    } catch (e: any) {
      toast.error(e.toString());
      setIsDeleting(false);
      setShowDeleteConfirm(false);
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
