import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface CreateWalletFormProps {
  onRestore: () => void;
  onError: (msg: string) => void;
  onCreate: (passphrase: string) => Promise<string | null>;
  onSuccess: (mnemonic: string) => void;
}

export const CreateWalletForm: React.FC<CreateWalletFormProps> = ({ onRestore, onError, onCreate, onSuccess }) => {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return onError('Please choose a passphrase');
    if (passphrase.length < 8) return onError('Passphrase must be at least 8 characters');

    setLoading(true);
    const mnemonic = await onCreate(passphrase);
    if (mnemonic) {
      onSuccess(mnemonic);
    } else {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-4">
      <input
        type="password"
        placeholder="Choose a strong passphrase"
        value={passphrase}
        onChange={e => setPassphrase(e.target.value)}
        className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
        autoFocus
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
      >
        {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Generate New Wallet'}
      </button>
      <button type="button" onClick={onRestore} className="text-sm text-gray-500 hover:text-primary transition-colors mt-2">
        Already have a recovery phrase?
      </button>
    </form>
  );
};
