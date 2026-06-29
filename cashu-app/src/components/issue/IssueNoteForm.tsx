import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface IssueNoteFormProps {
  sats: string;
  setSats: (sats: string) => void;
  mintUrls: string[];
  setMintUrls: (urls: string[]) => void;
  strategy: 'dynamic' | 'static';
  setStrategy: (strategy: 'dynamic' | 'static') => void;
  loading: boolean;
  onIssue: () => void;
  error: string;
  debugLogs: string[];
}

export const IssueNoteForm: React.FC<IssueNoteFormProps> = ({ 
  sats, setSats, mintUrls, setMintUrls, strategy, setStrategy, loading, onIssue, error, debugLogs
}) => {
  const [newMint, setNewMint] = useState<string>('');

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

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
      <div className="w-full max-w-2xl text-left mb-6">
        <h1 className="text-headline-lg font-headline-lg text-on-background">Issue Note</h1>
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-8">
        <div className="noise-overlay"></div>
        <div className="relative z-10 flex flex-col space-y-8 w-full">

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-2">AMOUNT (SATS)</label>
            <div className="relative glow-effect rounded-lg">
              <input
                type="number"
                value={sats}
                onChange={(e) => setSats(e.target.value)}
                className="w-full bg-surface-container-lowest text-on-surface text-center font-headline-lg-mobile text-[32px] p-6 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-on-surface-variant/50 transition-all"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-2">MINT URLS</label>
            <div className="space-y-2">
              {mintUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-4 text-on-surface text-sm overflow-x-hidden truncate shadow-inner">{url}</div>
                  <button onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))} className="bg-error/10 hover:bg-error/20 text-error px-4 rounded-lg transition-colors flex items-center justify-center">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {mintUrls.length < 3 && (
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={newMint}
                  onChange={(e) => setNewMint(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-4 text-on-surface text-sm shadow-inner focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-on-surface-variant/50"
                  placeholder="Add another mint URL..."
                />
                <button
                  onClick={handleAddMint}
                  className="bg-surface-container-highest hover:bg-surface-bright border border-outline-variant/30 text-on-surface px-6 rounded-lg font-bold transition-colors text-sm"
                >
                  Add
                </button>
              </div>
            )}
            {mintUrls.length >= 3 && (
              <div className="mt-3 text-xs text-on-surface-variant text-center font-label-caps">Maximum of 3 mints allowed</div>
            )}
          </div>

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-3">FEE RESERVE STRATEGY</label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setStrategy('dynamic')}
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col items-center text-center ${strategy === 'dynamic' ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/60'}`}
              >
                <div className="font-bold mb-1">Dynamic (Cheaper)</div>
                <div className="text-xs opacity-80">Best for immediate use. Data-driven estimates.</div>
              </div>
              <div
                onClick={() => setStrategy('static')}
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col items-center text-center ${strategy === 'static' ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-amber-500' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/60'}`}
              >
                <div className="font-bold mb-1">Static (Safer)</div>
                <div className="text-xs opacity-80">Best for long-term cold storage.</div>
              </div>
            </div>
          </div>

          {error && <div className="text-error text-sm text-center bg-error/10 p-3 rounded-lg border border-error/20">{error}</div>}

          {debugLogs.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto border border-outline-variant/30 shadow-inner">
              {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          <button
            onClick={onIssue}
            disabled={loading || !sats || mintUrls.length === 0}
            className="w-full btn-gradient text-on-primary font-bold py-4 rounded-full text-lg flex justify-center items-center shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Note'}
          </button>
        </div>
      </div>
    </main>
  );
};
