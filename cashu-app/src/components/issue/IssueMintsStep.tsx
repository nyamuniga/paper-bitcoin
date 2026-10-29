import React, { useState } from 'react';
import { X, ChevronRight, Plus } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import { useWalletStore } from '../../store/wallet';
import { formatMintUrl } from '../../utils/format';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';

interface IssueMintsStepProps {
  mintUrls: string[];
  setMintUrls: (urls: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const IssueMintsStep: React.FC<IssueMintsStepProps> = ({ mintUrls, setMintUrls, onNext, onBack }) => {
  const [newMint, setNewMint] = useState<string>('');
  const [showAllMints, setShowAllMints] = useState<boolean>(false);
  const mintBalances = useWalletStore((s) => s.mintBalances);

  // Filter out already added mints and sort by highest balance first
  const trustedMintUrls = Object.keys(mintBalances)
    .filter(url => !mintUrls.includes(url))
    .sort((a, b) => {
      const balA = mintBalances[a] || 0;
      const balB = mintBalances[b] || 0;
      if (balB !== balA) return balB - balA;
      return a.localeCompare(b);
    });

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

  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding pt-6 pb-0 -mb-8 flex flex-col">
      <PageHeader title="Select Mints" subtitle="Step 2 of 3" onBack={onBack} />

      <div className="flex-1 flex flex-col gap-6 pb-6">
        {/* Added mints */}
        <div className="flex flex-col gap-2">
          {mintUrls.length === 0 && (
            <div className="text-center text-on-surface-variant py-8 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">
              No mints added yet. Add at least one mint to continue.
            </div>
          )}
          {mintUrls.map((url, i) => (
            <div key={i} className="bg-surface-container-high rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 border border-outline-variant/10 relative overflow-hidden group">
              <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
              <div className="flex items-center gap-3 min-w-0 flex-1 relative z-10">
                <MintIcon mintUrl={url} className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[12px] font-bold" />
                <div className="flex flex-col min-w-0">
                  <MintName mintUrl={url} className="text-body-md font-body-md text-on-surface text-[14px] truncate" />
                  <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{formatMintUrl(url)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
                {mintBalances[url] !== undefined && (
                  <span className="font-mono text-[13px] font-bold text-white">
                    ₿{mintBalances[url].toLocaleString()}
                  </span>
                )}
                <button
                  onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))}
                  className="w-7 h-7 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
                  title="Remove mint"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add mint input */}
        {mintUrls.length < 5 && (
          <div className="flex gap-2">
            <div className="flex-1 relative glow-effect rounded-xl">
              <input
                type="text"
                value={newMint}
                onChange={(e) => setNewMint(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-[#0c1b14] border border-[#142d20] rounded-xl p-4 text-on-surface text-[14px] focus:ring-1 focus:ring-primary focus:border-primary/50 focus:outline-none placeholder:text-on-surface-variant/50 transition-colors"
                placeholder="https://mint.example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              onClick={handleAddMint}
              disabled={!newMint.trim()}
              className="w-12 h-[54px] rounded-xl bg-primary/15 hover:bg-primary/25 text-primary flex items-center justify-center transition-colors border border-primary/20 disabled:opacity-40"
            >
              <Plus size={20} />
            </button>
          </div>
        )}
        {mintUrls.length >= 5 && (
          <div className="text-xs text-on-surface-variant text-center font-label-caps">Maximum of 5 mints allowed</div>
        )}

        {/* Trusted Mints suggestions */}
        {trustedMintUrls.length > 0 && mintUrls.length < 5 && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider">Or select from Trusted Mints</p>
            <div className="flex flex-col gap-2">
              {(showAllMints ? trustedMintUrls : trustedMintUrls.slice(0, 5)).map((url, i) => (
                <button
                  key={i}
                  onClick={() => setMintUrls([...mintUrls, url])}
                  className="bg-surface-container-low hover:bg-surface-container rounded-xl p-3 flex items-center justify-between gap-3 border border-outline-variant/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <MintIcon mintUrl={url} className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                    <div className="flex flex-col min-w-0">
                      <MintName mintUrl={url} className="text-body-md font-body-md text-on-surface text-[14px] truncate" />
                      <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{formatMintUrl(url)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-mono text-[13px] font-bold text-white">
                      ₿{(mintBalances[url] || 0).toLocaleString()}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center flex-shrink-0 transition-colors">
                      <Plus size={14} />
                    </div>
                  </div>
                </button>
              ))}
              {trustedMintUrls.length > 5 && (
                <button
                  onClick={() => setShowAllMints(!showAllMints)}
                  className="mt-2 text-primary text-[14px] font-bold self-center hover:underline py-2 cursor-pointer"
                >
                  {showAllMints ? 'View less' : `View ${trustedMintUrls.length - 5} more`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Navigation */}
      <div className="sticky bottom-0 z-30 mt-auto bg-[#06110c]/95 backdrop-blur-md -mx-container-padding px-container-padding md:-mx-10 md:px-10 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[rgba(247,244,235,0.08)] shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <button
          onClick={onNext}
          disabled={mintUrls.length === 0}
          className="w-full py-3.5 sm:py-4 rounded-2xl btn-gradient text-[#06110c] font-extrabold text-[15px] sm:text-[16px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
        >
          Next
          <ChevronRight size={18} />
        </button>
      </div>
    </main>
  );
};
