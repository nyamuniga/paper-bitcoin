import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MorphingButtonContent, ButtonAuthStatus } from './MorphingButtonContent';

interface LoginFormProps {
  onRestore: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
  onLogin: (passphrase: string, rememberMe: boolean, onUnlocked?: () => void) => Promise<boolean>;
  isCompact?: boolean;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onRestore, onReset, onError, onLogin, isCompact = false }) => {
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [authStatus, setAuthStatus] = useState<ButtonAuthStatus>('idle');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return onError('Please enter your passphrase');

    setAuthStatus('loading');
    const success = await onLogin(passphrase, rememberMe, () => {
      setAuthStatus('unlocked');
    });
    if (!success) {
      setAuthStatus('idle');
    }
  };

  return (
    <form onSubmit={handleLogin} className={`flex flex-col ${isCompact ? 'gap-2.5 sm:gap-4.5' : 'gap-3.5 sm:gap-4.5'}`}>
      {/* Passphrase field */}
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="enter your passphrase"
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
          id="remember"
          checked={rememberMe}
          onChange={e => setRememberMe(e.target.checked)}
          className="rounded bg-[#101c16] border-[#1a3829] text-primary focus:ring-primary h-4 w-4 cursor-pointer accent-[#f2a93b]"
        />
        <label htmlFor="remember" className="text-[12px] sm:text-[13px] text-[#8b9e94] hover:text-[#f7f4eb] cursor-pointer select-none transition-colors">
          Remember me
        </label>
      </div>

      {/* Unlock button */}
      <button
        type="submit"
        disabled={authStatus !== 'idle'}
        className={`w-full ${isCompact ? 'h-10 sm:h-12 mt-0.5 sm:mt-1.5' : 'h-11 sm:h-12 mt-1 sm:mt-1.5'} rounded-xl bg-gradient-to-r from-primary to-[#e09b35] hover:brightness-105 active:scale-[0.98] text-[#08140e] font-display-hero text-[14px] sm:text-[15px] font-bold shadow-[0_4px_16px_rgba(242,169,59,0.3)] transition-all flex justify-center items-center cursor-pointer disabled:opacity-90 overflow-hidden relative`}
      >
        <MorphingButtonContent
          status={authStatus}
          label="Unlock Wallet"
        />
      </button>

      {/* Action links */}
      <div className={`flex flex-col items-center ${isCompact ? 'mt-1.5 sm:mt-2.5 gap-1.5 sm:gap-3' : 'mt-2 sm:mt-2.5 gap-2.5 sm:gap-3'}`}>
        <button
          type="button"
          onClick={onRestore}
          className="text-[12px] sm:text-[13.5px] text-[#8b9e94] hover:text-primary transition-colors cursor-pointer font-medium py-0.5 sm:py-1 px-2"
        >
          Restore from passphrase
        </button>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] sm:text-[12.5px] text-error/80 hover:text-error transition-colors cursor-pointer py-0.5 sm:py-1 px-2"
        >
          Lost everything? Delete wallet & start fresh
        </button>
      </div>
    </form>
  );
};
