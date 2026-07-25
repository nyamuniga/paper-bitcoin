import React, { useState } from 'react';
import { RefreshCw, Unlock } from 'lucide-react';

interface LoginFormProps {
  onRestore: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
  onLogin: (passphrase: string, rememberMe: boolean) => Promise<boolean>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onRestore, onReset, onError, onLogin }) => {
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return onError('Please enter your passphrase');

    setLoading(true);
    const success = await onLogin(passphrase, rememberMe);
    if (!success) {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
      <input
        type="password"
        placeholder="Passphrase"
        value={passphrase}
        onChange={e => setPassphrase(e.target.value)}
        className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
        autoFocus
      />
      <div className="flex items-center gap-2 px-1">
        <input type="checkbox" id="remember" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded bg-background border-gray-700 text-primary focus:ring-primary h-4 w-4" />
        <label htmlFor="remember" className="text-sm text-gray-300">Remember me on this device</label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
      >
        {loading ? <RefreshCw className="animate-spin" size={20} /> : <span className="flex items-center gap-2"><Unlock size={18} /> Unlock Wallet</span>}
      </button>
      <div className="flex flex-col items-center mt-2 space-y-2">
        <button type="button" onClick={onRestore} className="text-sm text-gray-300 hover:text-primary transition-colors">
          Forgot passphrase? Restore from backup
        </button>
        <button type="button" onClick={onReset} className="text-sm text-red-400 hover:text-red-500 transition-colors">
          Lost everything? Delete wallet & start fresh
        </button>
      </div>
    </form>
  );
};
