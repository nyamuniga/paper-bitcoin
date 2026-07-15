import { Lock, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { LoginForm } from '../components/auth/LoginForm';
import { CreateWalletForm } from '../components/auth/CreateWalletForm';
import { RestoreWalletForm } from '../components/auth/RestoreWalletForm';
import { RecoveryPhraseDisplay } from '../components/auth/RecoveryPhraseDisplay';
import { ConfirmResetDialog } from '../components/auth/ConfirmResetDialog';
import { useAuth } from '../hooks/useAuth';

export const Auth = () => {
  const {
    isSetup,
    setIsSetup,
    mode,
    setMode,
    errorMsg,
    shake,
    showConfirmReset,
    setShowConfirmReset,
    generatedMnemonic,
    setGeneratedMnemonic,
    triggerError,
    unlockWallet,
    createWallet,
    restoreWallet,
    resetWallet
  } = useAuth();

  if (isSetup === null) {
    return <div className="flex h-screen items-center justify-center bg-background"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
  }

  if (generatedMnemonic) {
    return (
      <RecoveryPhraseDisplay
        mnemonic={generatedMnemonic}
        onSaved={() => setGeneratedMnemonic('')}
      />
    );
  }

  if (showConfirmReset) {
    return (
      <ConfirmResetDialog
        onCancel={() => setShowConfirmReset(false)}
        onResetComplete={() => {
          setIsSetup(false);
          setMode('create');
          setShowConfirmReset(false);
        }}
        onConfirm={resetWallet}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
      <div className={`w-full max-w-sm bg-surface-container-high border border-gray-800 rounded-3xl p-8 shadow-2xl transition-transform duration-300 ${shake ? 'animate-shake' : ''}`}>

        <div className="flex justify-center mb-6 text-primary">
          {mode === 'login' && <Lock size={48} strokeWidth={1.5} />}
          {mode === 'create' && <Plus size={48} strokeWidth={1.5} />}
          {mode === 'restore' && <KeyRound size={48} strokeWidth={1.5} />}
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center">
          {mode === 'login' ? 'Welcome Back' : mode === 'create' ? 'Create Wallet' : 'Restore Wallet'}
        </h1>

        <p className="text-gray-300 text-center text-sm mb-8">
          {mode === 'login' ? 'Enter your passphrase to unlock your wallet' :
            mode === 'create' ? 'Secure your new wallet with a strong passphrase' :
              'Enter your recovery phrase and set a new local passphrase'}
        </p>

        {errorMsg && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded-xl text-sm text-center">
            {errorMsg}
          </div>
        )}

        {mode === 'login' && (
          <LoginForm
            onRestore={() => setMode('restore')}
            onReset={() => setShowConfirmReset(true)}
            onError={triggerError}
            onLogin={unlockWallet}
          />
        )}

        {mode === 'create' && (
          <CreateWalletForm
            onRestore={() => setMode('restore')}
            onError={triggerError}
            onCreate={createWallet}
            onSuccess={setGeneratedMnemonic}
          />
        )}

        {mode === 'restore' && (
          <RestoreWalletForm
            onCancel={() => setMode(isSetup ? 'login' : 'create')}
            onError={triggerError}
            onRestore={restoreWallet}
          />
        )}
      </div>
    </div>
  );
};
