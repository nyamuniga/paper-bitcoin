import React, { useState } from 'react';
import { RefreshCw, PlusCircle, Eye, EyeOff } from 'lucide-react';

interface CreateWalletFormProps {
  onRestore: () => void;
  onError: (msg: string) => void;
  onCreate: (passphrase: string, rememberMe: boolean) => Promise<string | null>;
  onSuccess: (mnemonic: string) => void;
  isCompact?: boolean;
}

export const CreateWalletForm: React.FC<CreateWalletFormProps> = ({ onRestore, onError, onCreate, onSuccess, isCompact = false }) => {
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <form onSubmit={handleCreate} className={`flex flex-col ${isCompact ? 'gap-2.5 sm:gap-4.5' : 'gap-3.5 sm:gap-4.5'}`}>
      {/* Passphrase field */}
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Choose a strong passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          className={`w-full bg-[#101c16] border border-[#1a3829] focus:border-primary/80 focus:ring-1 focus:ring-primary/40 rounded-xl px-4 ${isCompact ? 'py-2.5 sm:py-3.5' : 'py-3 sm:py-3.5'} pr-11 text-on-surface focus:outline-none transition-colors font-mono text-[13px] sm:text-[14px]`}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b9e94] hover:text-[#f7f4eb] transition-colors p-1 cursor-pointer"
          tabIndex={-1}
          aria-label={showPassword ? 'Hide passphrase' : 'Show passphrase'}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {/* Remember me */}
      <div className="flex items-center gap-2.5 px-0.5 pt-0.5">
        <input
          type="checkbox"
          id="remember-create"
          checked={rememberMe}
          onChange={e => setRememberMe(e.target.checked)}
          className="rounded bg-[#101c16] border-[#1a3829] text-primary focus:ring-primary h-4 w-4 cursor-pointer accent-[#f2a93b]"
        />
        <label htmlFor="remember-create" className="text-[12px] sm:text-[13px] text-[#8b9e94] hover:text-[#f7f4eb] cursor-pointer select-none transition-colors">
          Remember me
        </label>
      </div>

      {/* Generate button */}
      <button
        type="submit"
        disabled={loading}
        className={`w-full ${isCompact ? 'h-10 sm:h-12 mt-0.5 sm:mt-1.5' : 'h-11 sm:h-12 mt-1 sm:mt-1.5'} rounded-xl bg-gradient-to-r from-primary to-[#e09b35] hover:brightness-105 active:scale-[0.98] text-[#08140e] font-display-hero text-[14px] sm:text-[15px] font-bold shadow-[0_4px_16px_rgba(242,169,59,0.3)] transition-all flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50`}
      >
        {loading ? (
          <RefreshCw className="animate-spin" size={18} />
        ) : (
          <>
            <PlusCircle size={18} className="stroke-[2.25]" />
            <span>Generate New Wallet</span>
          </>
        )}
      </button>

      {/* Switch to restore */}
      <div className={`flex flex-col items-center ${isCompact ? 'mt-1.5 sm:mt-2.5' : 'mt-2 sm:mt-2.5'}`}>
        <button
          type="button"
          onClick={onRestore}
          className="text-[12px] sm:text-[13.5px] text-[#8b9e94] hover:text-primary transition-colors cursor-pointer font-medium py-0.5 sm:py-1 px-2 text-center"
        >
          Already have a recovery phrase? Restore from passphrase
        </button>
      </div>
    </form>
  );
};
