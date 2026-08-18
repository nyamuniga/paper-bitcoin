import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, Copy, CheckCircle2, ChevronRight, ChevronDown, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';

export const RecoveryPhraseSection = () => {
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { unlockWallet } = useAuth();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);

    const success = await unlockWallet(passphrase, false);
    if (success) {
      try {
        const words = await invoke<string[]>('get_recovery_words');
        setMnemonic(words.join(' '));
        setShowMnemonic(true);
        setShowPrompt(false);
      } catch (err: any) {
        toast.error('Failed to get recovery words');
      }
    } else {
      toast.error('Incorrect passphrase');
    }
    setIsVerifying(false);
  };

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    toast.success('Recovery phrase copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden">
      <div
        className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-surface-container-highest transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
            <Shield size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Recovery Phrase</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">12-word wallet seed backup</p>
          </div>
        </div>

        <div className="text-on-surface-variant shrink-0">
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-2 border-t border-outline-variant space-y-4">
          {!showPrompt && !showMnemonic && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-surface-container-highest rounded-xl border border-outline-variant">
              <div>
                <div className="font-bold text-on-surface text-sm">Secret Seed Words</div>
                <div className="text-xs text-on-surface-variant mt-0.5">Enter passphrase to view your 12-word recovery phrase</div>
              </div>
              <button
                onClick={() => {
                  setShowPrompt(true);
                  setPassphrase('');
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary font-bold rounded-lg text-sm transition-opacity hover:opacity-90 active:scale-95 shrink-0 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Reveal Phrase</span>
              </button>
            </div>
          )}

          {showPrompt && !showMnemonic && (
            <form onSubmit={handleVerify} className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant flex flex-col gap-3">
              <label className="text-sm text-on-surface-variant font-bold">Enter passphrase to reveal</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="flex-1 bg-surface-container-high border border-outline-variant rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary"
                  placeholder="Wallet passphrase"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isVerifying || !passphrase}
                  className="px-6 py-3 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-50 transition-opacity whitespace-nowrap cursor-pointer"
                >
                  {isVerifying ? 'Verifying...' : 'Reveal'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrompt(false)}
                  className="px-4 py-3 bg-surface-container-highest hover:bg-surface-bright text-on-surface font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {showMnemonic && (
            <div className="space-y-3">
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant relative group">
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-2">
                  {mnemonic.split(' ').map((word, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant/50 w-4">{i + 1}.</span>
                      <span className="font-mono text-on-surface font-bold text-sm">{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="absolute top-2 right-2 p-2 bg-surface-container-high hover:bg-surface-bright rounded-md text-on-surface-variant transition-colors opacity-0 group-hover:opacity-100"
                  title="Copy phrase"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={copyMnemonic}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest hover:bg-surface-bright border border-outline-variant rounded-lg text-xs font-bold text-on-surface transition-colors cursor-pointer"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Words'}</span>
                </button>

                <button
                  onClick={() => {
                    setShowMnemonic(false);
                    setMnemonic('');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Phrase</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
