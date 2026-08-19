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
    generatedBarkMnemonic,
    setGeneratedBarkMnemonic,
    triggerError,
    unlockWallet,
    createWallet,
    restoreWallet,
    resetWallet,
    restoreProgress
  } = useAuth();

  if (isSetup === null) {
    return <div className="flex h-screen items-center justify-center bg-background"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
  }

  if (generatedMnemonic) {
    return (
      <RecoveryPhraseDisplay
        mnemonic={generatedMnemonic}
        barkMnemonic={generatedBarkMnemonic}
        onSaved={() => {
          setGeneratedMnemonic('');
          setGeneratedBarkMnemonic('');
        }}
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
      <div className={`w-full max-w-sm bg-surface-container-high/90 backdrop-blur-xl border border-outline-variant rounded-3xl p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.4)] transition-transform duration-300 ${shake ? 'animate-shake' : ''}`}>

        <div className="flex justify-center mb-6 text-primary">
          {mode === 'login' && <Lock size={48} strokeWidth={1.5} />}
          {mode === 'create' && <Plus size={48} strokeWidth={1.5} />}
          {mode === 'restore' && <KeyRound size={48} strokeWidth={1.5} />}
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center">
          {mode === 'login' ? 'Welcome Back' : mode === 'create' ? 'Create Wallet' : 'Restore Wallet'}
        </h1>

        <p className="text-on-surface-variant text-center text-sm mb-8">
          {mode === 'login' ? 'Enter your passphrase to unlock your wallet' :
            mode === 'create' ? 'Secure your new wallet with a strong passphrase' :
              'Enter your recovery phrase and set a new local passphrase'}
        </p>

        {errorMsg && (
          <div className="mb-6 bg-error/10 border border-error/30 text-error p-3 rounded-xl text-sm text-center">
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
            restoreProgress={restoreProgress}
          />
        )}
      </div>
    </div>
  );
};
