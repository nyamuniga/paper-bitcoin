import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const RecoveryPhraseSection = () => {
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const toggleMnemonic = async () => {
    if (!showMnemonic) {
      try {
        const m = await invoke<string>('get_mnemonic');
        setMnemonic(m);
        setShowMnemonic(true);
      } catch (e) {
        toast.error('Failed to get mnemonic');
      }
    } else {
      setShowMnemonic(false);
      setMnemonic('');
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
          {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showMnemonic ? 'Hide' : 'Reveal'}
        </button>
      </div>
      
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
