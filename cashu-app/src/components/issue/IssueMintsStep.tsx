import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import { useWalletStore } from '../../store/wallet';

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
  
  const trustedMintUrls = Object.keys(mintBalances).filter(url => !mintUrls.includes(url));

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
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding py-6 flex flex-col">
      <PageHeader title="Select Mints" subtitle="Step 2 of 3" />

      <div className="flex-1 flex flex-col gap-6">
        {/* Added mints */}
        <div className="flex flex-col gap-2">
          {mintUrls.length === 0 && (
            <div className="text-center text-on-surface-variant py-8 bg-surface-container-high rounded-2xl border border-outline-variant/10 text-body-md font-body-md">
              No mints added yet. Add at least one mint to continue.
            </div>
          )}
          {mintUrls.map((url, i) => (
            <div key={i} className="bg-surface-container-high rounded-2xl p-4 flex items-center gap-3 border border-outline-variant/10 relative overflow-hidden group">
              <div className="absolute inset-0 texture-overlay opacity-20"></div>
              <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 relative z-10">
                <span className="text-primary text-[12px] font-bold">{new URL(url).hostname.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <p className="text-body-md font-body-md text-on-surface text-[14px] truncate">{new URL(url).hostname}</p>
                <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{url}</p>
              </div>
              <button
                onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))}
                className="w-8 h-8 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center transition-colors flex-shrink-0 relative z-10"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Add mint input */}
        {mintUrls.length < 3 && (
          <div className="flex gap-2">
            <div className="flex-1 relative glow-effect rounded-xl">
              <input
                type="text"
                value={newMint}
                onChange={(e) => setNewMint(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 text-on-surface text-[14px] shadow-inner focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-on-surface-variant/50"
                placeholder="https://mint.example.com"
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
        {mintUrls.length >= 3 && (
          <div className="text-xs text-on-surface-variant text-center font-label-caps">Maximum of 3 mints allowed</div>
        )}

        {/* Trusted Mints suggestions */}
        {trustedMintUrls.length > 0 && mintUrls.length < 3 && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider">Or select from Trusted Mints</p>
            <div className="flex flex-col gap-2">
              {(showAllMints ? trustedMintUrls : trustedMintUrls.slice(0, 3)).map((url, i) => (
                <button
                  key={i}
                  onClick={() => setMintUrls([...mintUrls, url])}
                  className="bg-surface-container-low hover:bg-surface-container rounded-xl p-3 flex items-center gap-3 border border-outline-variant/10 text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary text-[10px] font-bold">{new URL(url).hostname.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md font-body-md text-on-surface text-[14px] truncate">{new URL(url).hostname}</p>
                    <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{url}</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Plus size={14} />
                  </div>
                </button>
              ))}
              {trustedMintUrls.length > 3 && (
                <button
                  onClick={() => setShowAllMints(!showAllMints)}
                  className="mt-2 text-primary text-[14px] font-bold self-center hover:underline py-2"
                >
                  {showAllMints ? 'View less' : `View ${trustedMintUrls.length - 3} more`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="grid grid-cols-2 gap-3 mt-8">
        <button
          onClick={onBack}
          className="py-4 rounded-full bg-surface-container-high text-on-surface font-bold text-[16px] border border-outline-variant/30 hover:bg-surface-container-highest active:scale-[0.97] transition-all flex items-center justify-center gap-2"
        >
          <ChevronLeft size={20} />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={mintUrls.length === 0}
          className="py-4 rounded-full btn-gradient text-on-primary font-bold text-[16px] shadow-lg hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          Next
          <ChevronRight size={20} />
        </button>
      </div>
    </main>
  );
};
