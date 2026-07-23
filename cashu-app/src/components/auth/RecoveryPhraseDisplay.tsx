import React from 'react';
import { KeyRound } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

interface RecoveryPhraseDisplayProps {
  mnemonic: string;
  onSaved: () => void;
}

export const RecoveryPhraseDisplay: React.FC<RecoveryPhraseDisplayProps> = ({ mnemonic, onSaved }) => {
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm bg-surface-container-high border border-gray-800 rounded-3xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6 text-primary">
          <KeyRound size={48} strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-center text-red-500">Recovery Phrase</h1>
        <p className="text-gray-300 text-center text-sm mb-6">
          Write down these 24 words and keep them somewhere safe. You will need them to recover your funds if you lose your device or forget your passphrase.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm font-mono text-center mb-8 break-words text-white select-all">
          {mnemonic}
        </div>
        <button
          onClick={async () => {
            window.history.replaceState(null, '', '/');
            onSaved();
            await refreshWallet();
          }}
          className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors"
        >
          I have saved it securely
        </button>
      </div>
    </div>
  );
};
