import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

interface RestoreWalletFormProps {
  onCancel: () => void;
  onError: (msg: string) => void;
  onClearError: () => void;
}

export const RestoreWalletForm: React.FC<RestoreWalletFormProps> = ({ onCancel, onError, onClearError }) => {
  const [mnemonic, setMnemonic] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mnemonic) return onError('Please enter your 24-word recovery phrase');
    if (!passphrase) return onError('Please choose a new passphrase for encryption');

    setLoading(true);
    onClearError();
    try {
      await invoke('restore_wallet', { mnemonic, passphrase });
      await refreshWallet();
    } catch (e) {
      console.error(e);
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRestore} className="flex flex-col gap-4">
      <textarea
        placeholder="Enter your 24-word recovery phrase..."
        value={mnemonic}
        onChange={e => setMnemonic(e.target.value)}
        className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors min-h-[100px] resize-none text-sm"
        autoFocus
      />
      <input
        type="password"
        placeholder="Choose a new local passphrase"
        value={passphrase}
        onChange={e => setPassphrase(e.target.value)}
        className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
      >
        {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Restore Wallet'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-gray-300 hover:text-primary transition-colors mt-2">
        Cancel
      </button>
    </form>
  );
};
