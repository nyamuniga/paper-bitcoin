import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const RecoveryPhraseSection = () => {
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const toggleMnemonic = () => {
    if (!showMnemonic) {
      if (!showPrompt) {
        setShowPrompt(true);
        setPassphrase('');
      } else {
        setShowPrompt(false);
      }
    } else {
      setShowMnemonic(false);
      setMnemonic('');
      setShowPrompt(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    try {
      await invoke('unlock_wallet', { passphrase });
      const words = await invoke<string[]>('get_recovery_words');
      setMnemonic(words.join(' '));
      setShowMnemonic(true);
      setShowPrompt(false);
    } catch (err: any) {
      toast.error('Incorrect passphrase');
    } finally {
      setIsVerifying(false);
    }
  };

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    toast.success('Recovery phrase copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/30">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1">Recovery Phrase</h2>
          <p className="text-sm text-on-surface-variant">View your 12-word seed phrase. Keep this secure!</p>
        </div>
        <button
          onClick={toggleMnemonic}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest hover:bg-surface-bright rounded-lg text-primary transition-colors text-sm font-bold"
        >
          {showMnemonic || showPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showMnemonic ? 'Hide' : showPrompt ? 'Cancel' : 'Reveal'}
        </button>
      </div>

      {showPrompt && !showMnemonic && (
        <form onSubmit={handleVerify} className="mt-4 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/50 flex flex-col gap-3">
          <label className="text-sm text-on-surface-variant font-bold">Enter passphrase to reveal</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="flex-1 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              placeholder="Wallet passphrase"
              autoFocus
            />
            <button
              type="submit"
              disabled={isVerifying || !passphrase}
              className="px-4 py-2 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-50 transition-opacity"
            >
              {isVerifying ? 'Verifying...' : 'Reveal'}
            </button>
          </div>
        </form>
      )}
      
      {showMnemonic && (
        <div className="mt-4 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/50 relative group">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-2">
            {mnemonic.split(' ').map((word, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant/50 w-4">{i + 1}.</span>
                <span className="font-mono text-on-surface font-bold">{word}</span>
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
      )}
    </section>
  );
};
