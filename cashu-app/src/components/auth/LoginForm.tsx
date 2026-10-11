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
        className="w-full bg-[#101c16] border border-outline-variant rounded-xl px-4 py-3.5 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors font-mono"
        autoFocus
      />
      <div className="flex items-center gap-2 px-1">
        <input type="checkbox" id="remember" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded bg-[#101c16] border-outline-variant text-primary focus:ring-primary h-4 w-4" />
        <label htmlFor="remember" className="text-sm text-on-surface-variant cursor-pointer">Remember me on this device</label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3.5 rounded-xl font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all flex justify-center items-center h-12 cursor-pointer"
      >
        {loading ? <RefreshCw className="animate-spin" size={20} /> : <span className="flex items-center gap-2"><Unlock size={18} /> Unlock Wallet</span>}
      </button>
      <div className="flex flex-col items-center mt-2 space-y-2">
        <button type="button" onClick={onRestore} className="text-sm text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
          Forgot passphrase? Restore from backup
        </button>
        <button type="button" onClick={onReset} className="text-sm text-error/80 hover:text-error transition-colors cursor-pointer">
          Lost everything? Delete wallet & start fresh
        </button>
      </div>
    </form>
  );
};
