import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useAuth = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'create' | 'restore'>('login');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleClearError = () => setErrorMsg('');

  useEffect(() => {
    invoke('is_wallet_setup').then((setup) => {
      setIsSetup(setup as boolean);
      if (!setup) {
        setMode('create');
      } else {
        setMode('login');
      }
    }).catch(e => triggerError(String(e)));
  }, []);

  return {
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
    handleClearError
  };
};
