import React, { useState } from 'react';
import { RefreshCw, Plus, X } from 'lucide-react';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';

interface RestoreWalletFormProps {
  onCancel: () => void;
  onError: (msg: string) => void;
  onRestore: (mnemonic: string, passphrase: string, rememberMe: boolean, mintUrls: string[]) => Promise<boolean>;
  restoreProgress?: string[];
  isCompact?: boolean;
}

export const RestoreWalletForm: React.FC<RestoreWalletFormProps> = ({ onCancel, onError, onRestore, restoreProgress = [], isCompact = false }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [mnemonic, setMnemonic] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [mintUrls, setMintUrls] = useState<string[]>([]);
  const [newMint, setNewMint] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mnemonic) return onError('Please enter your 24-word recovery phrase');
    if (!passphrase) return onError('Please choose a new passphrase for encryption');
    setStep(2);
  };

  const handleAddMint = () => {
    if (newMint) {
      let raw = newMint.trim();
      if (!/^https?:\/\//i.test(raw)) {
        raw = 'https://' + raw;
      }
      try {
        const url = new URL(raw);
        url.hostname = url.hostname.toLowerCase();
        const sanitized = url.toString().replace(/\/$/, '');

        if (!mintUrls.includes(sanitized)) {
          setMintUrls([...mintUrls, sanitized]);
        }
        setNewMint('');
      } catch {
        console.warn('Invalid URL');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddMint();
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    const success = await onRestore(mnemonic, passphrase, rememberMe, mintUrls);
    if (!success) {
      setLoading(false);
    }
  };

  if (step === 1) {
    return (
      <form onSubmit={handleNext} className={`flex flex-col ${isCompact ? 'gap-2.5 sm:gap-4.5' : 'gap-3.5 sm:gap-4.5'}`}>
        <textarea
          placeholder="Enter your 24-word recovery phrase..."
          value={mnemonic}
          onChange={e => setMnemonic(e.target.value)}
          className={`w-full bg-[#101c16] border border-[#1a3829] rounded-xl px-3.5 ${isCompact ? 'py-2 min-h-[60px] max-h-[72px]' : 'py-2.5 min-h-[76px] sm:min-h-[96px] max-h-[90px] sm:max-h-[120px]'} text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors resize-none text-[12px] sm:text-[13px] font-mono leading-relaxed`}
        />
        <input
          type="password"
          placeholder="Choose a new local passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          className={`w-full bg-[#101c16] border border-[#1a3829] rounded-xl px-3.5 ${isCompact ? 'py-2 sm:py-3.5' : 'py-2.5 sm:py-3.5'} text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors font-mono text-[13px] sm:text-[14px]`}
        />
        <div className="flex items-center gap-2.5 px-0.5 pt-0.5">
          <input
            type="checkbox"
            id="remember-restore"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="rounded bg-[#101c16] border-[#1a3829] text-primary focus:ring-primary h-4 w-4 cursor-pointer accent-[#f2a93b]"
          />
          <label htmlFor="remember-restore" className="text-[12px] sm:text-[13px] text-[#8b9e94] hover:text-[#f7f4eb] cursor-pointer select-none transition-colors">
            Remember me
          </label>
        </div>
        <button
          type="submit"
          className={`w-full ${isCompact ? 'h-10 sm:h-12 mt-0.5 sm:mt-1.5' : 'h-11 sm:h-12 mt-1 sm:mt-1.5'} rounded-xl bg-gradient-to-r from-primary to-[#e09b35] hover:brightness-105 active:scale-[0.98] text-[#08140e] font-display-hero text-[14px] sm:text-[15px] font-bold shadow-[0_4px_16px_rgba(242,169,59,0.3)] transition-all flex justify-center items-center cursor-pointer`}
        >
          Next
        </button>
        <div className={`flex flex-col items-center ${isCompact ? 'mt-1.5 sm:mt-2.5' : 'mt-2 sm:mt-2.5'}`}>
          <button
            type="button"
            onClick={onCancel}
            className="text-[12px] sm:text-[13.5px] text-[#8b9e94] hover:text-[#f7f4eb] transition-colors cursor-pointer font-medium text-center py-0.5 sm:py-1 px-2"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleRestoreSubmit} className="flex flex-col gap-3.5 sm:gap-4.5">
      <div className="text-[12px] sm:text-[13px] text-[#8b9e94] leading-snug">
        Optionally, add Mint URLs to restore historical tokens from. If left blank, the wallet will just be imported with a 0 balance.
      </div>
      
      <div className="flex flex-col gap-1.5 sm:gap-2 max-h-[130px] overflow-y-auto">
        {mintUrls.map((url, i) => (
          <div key={i} className="bg-[#10241b]/80 rounded-xl p-2.5 flex items-center justify-between border border-[#1a3828] relative overflow-hidden group">
            <div className="flex items-center gap-2.5 min-w-0 pr-2 relative z-10">
              <MintIcon mintUrl={url} className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
              <div className="flex flex-col min-w-0">
                <p className="text-[#f7f4eb] text-[12px] font-medium truncate">{formatMintUrl(url)}</p>
                <p className="font-mono text-[#8b9e94] text-[9px] truncate">{url}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))}
              className="w-6 h-6 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors flex-shrink-0 relative z-10 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="text"
            value={newMint}
            onChange={(e) => setNewMint(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-[#101c16] border border-[#1a3829] rounded-xl px-3 py-2 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors text-[12px] sm:text-[13px] placeholder:text-[#8b9e94]/50 h-[42px] sm:h-[48px] font-mono"
            placeholder="https://mint.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleAddMint}
            disabled={!newMint.trim()}
            className="w-10 sm:w-12 h-[42px] sm:h-[48px] rounded-xl bg-[#0e2e20] hover:bg-[#173628] text-primary flex items-center justify-center transition-colors border border-primary/30 disabled:opacity-40 cursor-pointer"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-2.5 w-full mt-2 sm:mt-2.5">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={loading}
          className="flex-1 h-11 sm:h-12 rounded-xl bg-[#12261d] hover:bg-[#162f24] text-[#8b9e94] hover:text-[#f7f4eb] border border-[#1e3c2e] font-display-hero text-[13px] sm:text-[14px] font-semibold transition-all cursor-pointer"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 h-11 sm:h-12 rounded-xl bg-gradient-to-r from-primary to-[#e09b35] hover:brightness-105 active:scale-[0.98] text-[#08140e] font-display-hero text-[13px] sm:text-[14px] font-bold shadow-[0_4px_16px_rgba(242,169,59,0.3)] transition-all flex justify-center items-center disabled:opacity-50 cursor-pointer"
        >
          {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Restore Wallet'}
        </button>
      </div>

      {loading && restoreProgress.length > 0 && (
        <div className="mt-4 p-3 bg-black/40 border border-outline-variant rounded-xl max-h-40 overflow-y-auto font-mono text-[10px] text-on-surface-variant flex flex-col gap-1">
          {restoreProgress.map((msg, i) => (
            <div key={i} className="whitespace-pre-wrap">{msg}</div>
          ))}
        </div>
      )}
    </form>
  );
};
