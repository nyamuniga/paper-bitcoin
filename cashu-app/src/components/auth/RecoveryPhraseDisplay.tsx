import React from 'react';
import { KeyRound } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

interface RecoveryPhraseDisplayProps {
  mnemonic: string;
  barkMnemonic?: string;
  onSaved: () => void;
}

export const RecoveryPhraseDisplay: React.FC<RecoveryPhraseDisplayProps> = ({ mnemonic, barkMnemonic, onSaved }) => {
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background overflow-y-auto py-12">
      <div className="w-full max-w-sm bg-surface-container/90 backdrop-blur-xl border border-primary/25 rounded-3xl p-8 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] my-auto relative">
        <div className="flex justify-center mb-5 text-primary">
          <div className="w-16 h-16 rounded-full bg-[#0e2e20] border border-primary/40 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(229,168,59,0.2)]">
            <KeyRound size={32} strokeWidth={1.75} />
          </div>
        </div>
        <h1 className="font-display-hero text-2xl font-semibold mb-2 text-center text-primary">Recovery Phrases</h1>
        <p className="text-on-surface-variant text-center text-sm mb-6 leading-relaxed">
          Write down these words and keep them somewhere safe. You will need them to recover your funds if you lose your device.
        </p>
        
        <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 font-mono">Cashu Wallet (24 words)</div>
        <div className="bg-[#07100c] border border-outline-variant/50 rounded-xl p-4 text-sm font-mono text-center mb-5 break-words text-[#f7f4eb] select-all leading-relaxed shadow-inner">
          {mnemonic}
        </div>

        {barkMnemonic && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 font-mono">Bitcoin Wallet (12 words)</div>
            <div className="bg-[#07100c] border border-outline-variant/50 rounded-xl p-4 text-sm font-mono text-center mb-6 break-words text-[#f7f4eb] select-all leading-relaxed shadow-inner">
              {barkMnemonic}
            </div>
          </>
        )}
        <button
          onClick={async () => {
            window.history.replaceState(null, '', '/');
            onSaved();
            await refreshWallet();
          }}
          className="btn-primary w-full py-3.5 rounded-xl font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all mt-2 cursor-pointer"
        >
          I have saved them securely
        </button>
      </div>
    </div>
  );
};
