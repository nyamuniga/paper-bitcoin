import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { Lock, Unlock, KeyRound, Plus, RefreshCw } from 'lucide-react';

export const Auth = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'create' | 'restore'>('login');
  
  const [passphrase, setPassphrase] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');

  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  useEffect(() => {
    // Check if wallet is already setup
    invoke('is_wallet_setup').then((setup) => {
      setIsSetup(setup as boolean);
      if (!setup) {
        setMode('create');
      } else {
        setMode('login');
      }
    }).catch(e => setErrorMsg(String(e)));
  }, []);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return triggerError('Please enter your passphrase');
    
    setLoading(true);
    setErrorMsg('');
    try {
      await invoke('unlock_wallet', { passphrase });
      await refreshWallet();
    } catch (e) {
      console.error(e);
      triggerError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return triggerError('Please choose a passphrase');
    if (passphrase.length < 8) return triggerError('Passphrase must be at least 8 characters');

    setLoading(true);
    setErrorMsg('');
    try {
      const res: any = await invoke('create_wallet', { passphrase });
      setGeneratedMnemonic(res.mnemonic);
    } catch (e) {
      console.error(e);
      triggerError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mnemonic) return triggerError('Please enter your 24-word recovery phrase');
    if (!passphrase) return triggerError('Please choose a new passphrase for encryption');

    setLoading(true);
    setErrorMsg('');
    try {
      await invoke('restore_wallet', { mnemonic, passphrase });
      await refreshWallet();
    } catch (e) {
      console.error(e);
      triggerError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      await invoke('reset_wallet');
      setIsSetup(false);
      setMode('create');
      setPassphrase('');
      setMnemonic('');
    } catch (e) {
      console.error(e);
      triggerError(String(e));
    } finally {
      setLoading(false);
      setShowConfirmReset(false);
    }
  };

  if (isSetup === null) {
    return <div className="flex h-screen items-center justify-center bg-background"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
  }

  if (generatedMnemonic) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm bg-surface/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6 text-primary">
            <KeyRound size={48} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-center text-red-500">Recovery Phrase</h1>
          <p className="text-gray-400 text-center text-sm mb-6">
            Write down these 24 words and keep them somewhere safe. You will need them to recover your funds if you lose your device or forget your passphrase.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm font-mono text-center mb-8 break-words text-white select-all">
            {generatedMnemonic}
          </div>
          <button
            onClick={async () => {
              setGeneratedMnemonic('');
              await refreshWallet();
            }}
            className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors"
          >
            I have saved it securely
          </button>
        </div>
      </div>
    );
  }

  if (showConfirmReset) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm bg-surface/50 backdrop-blur-xl border border-red-900/50 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold mb-4 text-center text-red-500">Delete Wallet?</h1>
          <p className="text-gray-300 text-center text-sm mb-8">
            WARNING: This will permanently delete your existing wallet. If you do not have your 24-word recovery phrase, your funds will be lost forever. Are you absolutely sure?
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleReset}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Yes, Delete Wallet'}
            </button>
            <button
              onClick={() => setShowConfirmReset(false)}
              disabled={loading}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-background">
      <div className={`w-full max-w-sm bg-surface/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl transition-transform duration-300 ${shake ? 'animate-shake' : ''}`}>
        
        <div className="flex justify-center mb-6 text-primary">
          {mode === 'login' && <Lock size={48} strokeWidth={1.5} />}
          {mode === 'create' && <Plus size={48} strokeWidth={1.5} />}
          {mode === 'restore' && <KeyRound size={48} strokeWidth={1.5} />}
        </div>
        
        <h1 className="text-3xl font-bold mb-2 text-center">
          {mode === 'login' ? 'Welcome Back' : mode === 'create' ? 'Create Wallet' : 'Restore Wallet'}
        </h1>
        
        <p className="text-gray-400 text-center text-sm mb-8">
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
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <span className="flex items-center gap-2"><Unlock size={18} /> Unlock Wallet</span>}
            </button>
            <div className="flex flex-col items-center mt-2 space-y-2">
              <button type="button" onClick={() => setMode('restore')} className="text-sm text-gray-500 hover:text-primary transition-colors">
                Forgot passphrase? Restore from backup
              </button>
              <button type="button" onClick={() => setShowConfirmReset(true)} className="text-sm text-red-500/70 hover:text-red-500 transition-colors">
                Lost everything? Delete wallet & start fresh
              </button>
            </div>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Choose a strong passphrase"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Generate New Wallet'}
            </button>
            <button type="button" onClick={() => setMode('restore')} className="text-sm text-gray-500 hover:text-primary transition-colors mt-2">
              Already have a recovery phrase?
            </button>
          </form>
        )}

        {mode === 'restore' && (
          <form onSubmit={handleRestore} className="flex flex-col gap-4">
            <textarea
              placeholder="Enter your 24-word recovery phrase..."
              value={mnemonic}
              onChange={e => setMnemonic(e.target.value)}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors min-h-[100px] resize-none text-sm"
              autoFocus
            />
            <input
              type="password"
              placeholder="Choose a new local passphrase"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-background font-bold py-3 rounded-xl transition-colors flex justify-center items-center h-12"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Restore Wallet'}
            </button>
            <button type="button" onClick={() => setMode(isSetup ? 'login' : 'create')} className="text-sm text-gray-500 hover:text-primary transition-colors mt-2">
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
