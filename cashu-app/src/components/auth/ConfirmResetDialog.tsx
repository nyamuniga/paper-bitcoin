import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw } from 'lucide-react';

interface ConfirmResetDialogProps {
  onCancel: () => void;
  onResetComplete: () => void;
  onError: (msg: string) => void;
}

export const ConfirmResetDialog: React.FC<ConfirmResetDialogProps> = ({ onCancel, onResetComplete, onError }) => {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      await invoke('reset_wallet');
      onResetComplete();
    } catch (e) {
      console.error(e);
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm bg-surface-container-high border border-red-900/50 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold mb-4 text-center text-red-500">Delete Wallet?</h1>
        <p className="text-gray-300 text-center text-sm mb-8">
          WARNING: This will permanently delete your existing wallet. If you do not have your 24-word recovery phrase, your funds will be lost forever. Are you absolutely sure?
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleReset}
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
          >
            {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Yes, Delete Wallet'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
