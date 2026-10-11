import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface CreateWalletFormProps {
  onRestore: () => void;
  onError: (msg: string) => void;
  onCreate: (passphrase: string, rememberMe: boolean) => Promise<string | null>;
  onSuccess: (mnemonic: string) => void;
}

export const CreateWalletForm: React.FC<CreateWalletFormProps> = ({ onRestore, onError, onCreate, onSuccess }) => {
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return onError('Please choose a passphrase');
    if (passphrase.length < 8) return onError('Passphrase must be at least 8 characters');

    setLoading(true);
    const mnemonic = await onCreate(passphrase, rememberMe);
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
        className="w-full bg-[#101c16] border border-outline-variant rounded-xl px-4 py-3.5 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors font-mono"
        autoFocus
      />
      <div className="flex items-center gap-2 px-1">
        <input type="checkbox" id="remember-create" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded bg-[#101c16] border-outline-variant text-primary focus:ring-primary h-4 w-4" />
        <label htmlFor="remember-create" className="text-sm text-on-surface-variant cursor-pointer">Remember me on this device</label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3.5 rounded-xl font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all flex justify-center items-center h-12 cursor-pointer"
      >
        {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Generate New Wallet'}
      </button>
      <button type="button" onClick={onRestore} className="text-sm text-on-surface-variant hover:text-primary transition-colors mt-2 cursor-pointer">
        Already have a recovery phrase?
      </button>
    </form>
  );
};
