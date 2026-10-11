import React, { useState } from 'react';
import { RefreshCw, Plus, X } from 'lucide-react';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';

interface RestoreWalletFormProps {
  onCancel: () => void;
  onError: (msg: string) => void;
  onRestore: (mnemonic: string, passphrase: string, rememberMe: boolean, mintUrls: string[]) => Promise<boolean>;
  restoreProgress?: string[];
}

export const RestoreWalletForm: React.FC<RestoreWalletFormProps> = ({ onCancel, onError, onRestore, restoreProgress = [] }) => {
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
      <form onSubmit={handleNext} className="flex flex-col gap-4">
        <textarea
          placeholder="Enter your 24-word recovery phrase..."
          value={mnemonic}
          onChange={e => setMnemonic(e.target.value)}
          className="w-full bg-[#101c16] border border-outline-variant rounded-xl px-4 py-3.5 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors min-h-[100px] resize-none text-sm font-mono"
          autoFocus
        />
        <input
          type="password"
          placeholder="Choose a new local passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          className="w-full bg-[#101c16] border border-outline-variant rounded-xl px-4 py-3.5 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors font-mono"
        />
        <div className="flex items-center gap-2 px-1">
          <input type="checkbox" id="remember-restore" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded bg-[#101c16] border-outline-variant text-primary focus:ring-primary h-4 w-4" />
          <label htmlFor="remember-restore" className="text-sm text-on-surface-variant cursor-pointer">Remember me on this device</label>
        </div>
        <button
          type="submit"
          className="btn-primary w-full py-3.5 rounded-xl font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all flex justify-center items-center h-12 cursor-pointer"
        >
          Next
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-on-surface-variant hover:text-primary transition-colors mt-2 cursor-pointer">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRestoreSubmit} className="flex flex-col gap-4">
      <div className="text-sm text-on-surface-variant text-center mb-2">
        Optionally, add Mint URLs to restore historical tokens from. If left blank, the wallet will just be imported with a 0 balance.
      </div>
      
      <div className="flex flex-col gap-2">
        {mintUrls.map((url, i) => (
          <div key={i} className="bg-surface-container-high rounded-2xl p-4 flex items-center justify-between border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute inset-0 texture-overlay opacity-20"></div>
            <div className="flex items-center gap-3 min-w-0 pr-4 relative z-10">
              <MintIcon mintUrl={url} className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[12px] font-bold" />
              <div className="flex flex-col min-w-0">
                <p className="text-body-md font-body-md text-white text-[14px] truncate">{formatMintUrl(url)}</p>
                <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{url}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))}
              className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center transition-colors flex-shrink-0 relative z-10"
            >
              <X size={16} />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <div className="flex-1 relative glow-effect rounded-xl">
            <input
              type="text"
              value={newMint}
              onChange={(e) => setNewMint(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#101c16] border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors text-sm placeholder:text-on-surface-variant/50 h-[54px] font-mono"
              placeholder="https://mint.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            onClick={handleAddMint}
            disabled={!newMint.trim()}
            className="w-12 h-[54px] rounded-xl bg-[#0e2e20] hover:bg-[#173628] text-primary flex items-center justify-center transition-colors border border-primary/30 disabled:opacity-40 cursor-pointer"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 w-full mt-4">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={loading}
          className="btn-secondary flex-1 py-3.5 rounded-xl font-display-hero text-[15px] font-medium transition-all h-12 cursor-pointer"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 py-3.5 rounded-xl font-display-hero text-[15px] font-semibold transition-all flex justify-center items-center h-12 disabled:opacity-50 cursor-pointer"
        >
          {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Restore Wallet'}
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
