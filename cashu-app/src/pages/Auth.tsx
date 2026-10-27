import { useState, useEffect } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { CreateWalletForm } from '../components/auth/CreateWalletForm';
import { RestoreWalletForm } from '../components/auth/RestoreWalletForm';
import { RecoveryPhraseDisplay } from '../components/auth/RecoveryPhraseDisplay';
import { ConfirmResetDialog } from '../components/auth/ConfirmResetDialog';
import { VaultLoader } from '../components/shared/VaultLoader';
import { AnimatedMedallion } from '../components/shared/AnimatedMedallion';
import { useAuth } from '../hooks/useAuth';

export const Auth = () => {
  const [viewport, setViewport] = useState(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      return {
        height: window.visualViewport.height,
        offsetTop: window.visualViewport.offsetTop,
      };
    }
    return {
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
      offsetTop: 0,
    };
  });

  useEffect(() => {
    // Lock document scroll while Auth screen is active so keyboard never scrolls window
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const originalHtmlHeight = document.documentElement.style.height;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100%';
    document.documentElement.style.height = '100%';

    const updateViewport = () => {
      if (window.visualViewport) {
        setViewport({
          height: window.visualViewport.height,
          offsetTop: window.visualViewport.offsetTop,
        });
      } else {
        setViewport({
          height: window.innerHeight,
          offsetTop: 0,
        });
      }
    };

    updateViewport();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }
    window.addEventListener('resize', updateViewport);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.height = originalBodyHeight;
      document.documentElement.style.height = originalHtmlHeight;

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      }
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const isCompact = viewport.height < 620;

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
        onSaved={() => {
          setGeneratedMnemonic('');
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
    <div
      style={{
        position: 'fixed',
        top: `${viewport.offsetTop}px`,
        left: 0,
        right: 0,
        height: `${viewport.height}px`,
        paddingTop: 'max(env(safe-area-inset-top), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
      }}
      className="w-full bg-[#06110c] text-on-surface overflow-hidden flex flex-col justify-between sm:justify-center sm:items-center p-0 sm:p-6 select-none"
    >
      {/* Background Texture & Ambient Glow */}
      <div className="absolute inset-0 texture-overlay opacity-25 pointer-events-none" />
      <div className="absolute top-0 left-0 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none -translate-x-1/4 -translate-y-1/4" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none translate-x-1/4 translate-y-1/4" />

      {/* Main Container: Mobile full-height split (hero top, card bottom) | Desktop side-by-side */}
      <div className="relative z-10 w-full flex-1 min-h-0 flex flex-col justify-between sm:justify-center sm:flex-row sm:items-center sm:gap-14 sm:max-w-5xl sm:mx-auto">

        {/* ── Top / Left Hero Section (All Left Aligned) ── */}
        <div className={`flex-1 min-h-0 flex flex-col justify-center px-6 ${isCompact ? 'py-2 sm:py-0' : 'py-4 sm:py-0'} sm:p-0 sm:max-w-lg text-left items-start auth-hero-section transition-all duration-200`}>
          {/* Logo with shine animation matching loader page */}
          <div className={`flex items-center auth-hero-logo transition-all duration-200 ${isCompact ? 'mb-1.5 sm:mb-5' : 'mb-3 sm:mb-5'}`}>
            <AnimatedMedallion
              size="custom"
              className={`shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all duration-200 ${isCompact ? 'w-9 h-9 sm:w-20 sm:h-20' : 'w-14 h-14 sm:w-20 sm:h-20'}`}
            />
          </div>

          {/* Heading from website hero */}
          <h1 className={`font-display-hero font-extrabold text-[#f7f4eb] tracking-tight transition-all duration-200 auth-hero-title ${isCompact ? 'text-[18px] sm:text-[38px] leading-tight mb-1 sm:mb-3.5' : 'text-[27px] sm:text-[38px] leading-[1.12] mb-2.5 sm:mb-3.5'}`}>
            The wallet that bridges<br />
            your <span className="hero-italic">financial sovereignty</span>
          </h1>

          {/* Subtitle from website hero */}
          <p className={`text-[13.5px] sm:text-[15px] text-[#8b9e94] leading-relaxed max-w-none sm:max-w-lg font-normal auth-hero-desc transition-all duration-200 ${isCompact ? 'hidden sm:block' : 'block'}`}>
            Print and verify physical bearer notes backed by multiple independent mints simultaneously. A unified wallet bringing together ecash, Lightning, on-chain Bitcoin, and Mobile Money.
          </p>
        </div>

        {/* ── Bottomsheet Looking Card ── */}
        <div
          className={`w-full sm:w-[440px] bg-[#0c1b14]/98 backdrop-blur-2xl border-t border-x sm:border border-[#1a3829] rounded-t-[28px] sm:rounded-3xl ${
            isCompact ? 'px-5 pt-3.5 pb-3.5 sm:p-8' : 'px-5 pt-5 pb-6 sm:p-8'
          } shadow-[0_-16px_48px_rgba(0,0,0,0.85)] sm:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.8)] relative shrink-0 transition-all duration-200 overflow-y-auto max-h-[88vh] ${shake ? 'animate-shake' : ''}`}
        >

          {/* Card Header (Welcome Back for login, full header for create & restore) */}
          <div className={`${isCompact ? 'mb-2.5 sm:mb-5' : 'mb-3.5 sm:mb-5'} text-left`}>
            <h2 className={`${isCompact ? 'text-[17px] sm:text-[22px]' : 'text-[18px] sm:text-[22px]'} font-display-hero font-bold text-[#f7f4eb] tracking-tight`}>
              {mode === 'login' ? 'Welcome Back!' : mode === 'create' ? 'Create Wallet' : 'Restore Wallet'}
            </h2>
            {mode !== 'login' && (
              <p className="text-[12px] sm:text-[13px] text-[#8b9e94] mt-0.5 sm:mt-1 font-normal">
                {mode === 'create'
                  ? 'Secure your new wallet with a strong passphrase'
                  : 'Enter your recovery phrase and set a new local passphrase'}
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="mb-2.5 sm:mb-3 bg-error/10 border border-error/30 text-error p-2 sm:p-2.5 rounded-xl text-xs sm:text-sm text-center">
              {errorMsg}
            </div>
          )}

          {mode === 'login' && (
            <LoginForm
              onRestore={() => setMode('restore')}
              onReset={() => setShowConfirmReset(true)}
              onError={triggerError}
              onLogin={unlockWallet}
              isCompact={isCompact}
            />
          )}

          {mode === 'create' && (
            <CreateWalletForm
              onRestore={() => setMode('restore')}
              onError={triggerError}
              onCreate={createWallet}
              onSuccess={setGeneratedMnemonic}
              isCompact={isCompact}
            />
          )}

          {mode === 'restore' && (
            <RestoreWalletForm
              onCancel={() => setMode(isSetup ? 'login' : 'create')}
              onError={triggerError}
              onRestore={restoreWallet}
              restoreProgress={restoreProgress}
              isCompact={isCompact}
            />
          )}
        </div>
      </div>
    </div>
  );
};
