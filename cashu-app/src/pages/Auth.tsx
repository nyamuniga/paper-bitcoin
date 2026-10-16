import { LoginForm } from '../components/auth/LoginForm';
import { CreateWalletForm } from '../components/auth/CreateWalletForm';
import { RestoreWalletForm } from '../components/auth/RestoreWalletForm';
import { RecoveryPhraseDisplay } from '../components/auth/RecoveryPhraseDisplay';
import { ConfirmResetDialog } from '../components/auth/ConfirmResetDialog';
import { VaultLoader } from '../components/shared/VaultLoader';
import { AnimatedMedallion } from '../components/shared/AnimatedMedallion';
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
    return <VaultLoader />;
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
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 texture-overlay opacity-30 pointer-events-none"></div>
      <div className={`w-full max-w-sm bg-surface-container/90 backdrop-blur-xl border border-primary/25 rounded-3xl p-8 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] transition-transform duration-300 relative z-10 ${shake ? 'animate-shake' : ''}`}>

        <div className="flex flex-col items-center justify-center mb-5">
          <AnimatedMedallion
            size="md"
            className="mb-2.5"
          />
          <span className="font-mono text-[10px] font-semibold text-primary uppercase tracking-widest status-pill px-2.5 py-0.5 rounded-full">
            Sovereign Ecash Vault
          </span>
        </div>

        <h1 className="font-display-hero text-2xl font-semibold mb-1.5 text-center text-on-surface">
          {mode === 'login' ? 'Welcome Back' : mode === 'create' ? 'Create Wallet' : 'Restore Wallet'}
        </h1>

        <p className="text-on-surface-variant text-center text-sm mb-7 font-normal">
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
