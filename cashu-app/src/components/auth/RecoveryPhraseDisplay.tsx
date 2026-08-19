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
      <div className="w-full max-w-sm bg-surface-container-high border border-outline-variant rounded-3xl p-8 shadow-2xl my-auto">
        <div className="flex justify-center mb-6 text-primary">
          <KeyRound size={48} strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-center text-red-500">Recovery Phrases</h1>
        <p className="text-on-surface-variant text-center text-sm mb-6">
          Write down these words and keep them somewhere safe. You will need them to recover your funds if you lose your device or forget your passphrase.
        </p>
        
        <div className="text-sm font-bold text-on-surface mb-2">Cashu Wallet (24 words)</div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-sm font-mono text-center mb-6 break-words text-white select-all">
          {mnemonic}
        </div>

        {barkMnemonic && (
          <>
            <div className="text-sm font-bold text-on-surface mb-2">Bitcoin Wallet (12 words)</div>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-sm font-mono text-center mb-6 break-words text-white select-all">
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
          className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors mt-2"
        >
          I have saved them securely
        </button>
      </div>
    </div>
  );
};
