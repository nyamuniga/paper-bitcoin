import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Shield, Unlock, Fingerprint, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Settings = () => {
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [biometrics, setBiometrics] = useState(false);

  const handleReveal = async () => {
    setLoading(true);
    try {
      const res: string[] = await invoke('get_recovery_words');
      setWords(res);
    } catch (e) {
      toast.error("Failed to get words: " + e);
    }
    setLoading(false);
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 md:py-12 md:mt-10">
      <div className="mb-8">
        <h2 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-on-surface">Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-card-gap">
        <section className="md:col-span-8 flex flex-col gap-6">
          <article className="bg-surface-container-high shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] relative overflow-hidden rounded-xl p-6 flex flex-col gap-6">
            <div className="noise-overlay"></div>
            <div className="relative z-10">
              <header className="flex justify-between items-start">
                <div>
                  <h3 className="text-on-surface font-semibold text-lg mb-2 flex items-center gap-2">
                    <Key className="text-primary w-5 h-5" />
                    Recovery Phrase
                  </h3>
                  <p className="text-on-surface-variant text-sm md:text-base max-w-xl">
                    These 24 words can be used to recover your wallet if you lose your device. Do not share them with anyone.
                  </p>
                </div>
                <Shield className="text-outline-variant w-8 h-8 opacity-50 hidden sm:block" />
              </header>

              <div className="mt-4">
                {words.length === 0 ? (
                  <button
                    onClick={handleReveal}
                    disabled={loading}
                    className="w-full sm:w-auto bg-gradient-to-r from-primary to-tertiary-container text-on-primary font-bold py-3 px-8 rounded-full active-glow hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                    Reveal Recovery Phrase
                  </button>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {words.map((word, i) => (
                      <div key={i} className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 text-sm font-label-caps flex items-center shadow-inner">
                        <span className="text-on-surface-variant w-6 select-none opacity-50">{i + 1}.</span>
                        <span className="text-primary font-bold tracking-wider">{word}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="bg-surface-container-high shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] relative overflow-hidden rounded-xl p-6 flex flex-col gap-4 opacity-70 hover:opacity-100 transition-opacity">
            <div className="noise-overlay"></div>
            <div className="relative z-10">
              <h3 className="text-on-surface font-semibold text-lg flex items-center gap-2 mb-1">
                <Fingerprint className="w-5 h-5" />
                Biometric Authentication
              </h3>
              <div className="flex justify-between items-center">
                <p className="text-on-surface-variant text-sm">Require FaceID / TouchID to open wallet.</p>
                <div
                  onClick={() => setBiometrics(!biometrics)}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${biometrics ? 'bg-primary' : 'bg-surface-container-highest'}`}
                >
                  <div className={`absolute left-1 top-1 w-4 h-4 rounded-full transition-transform ${biometrics ? 'translate-x-6 bg-on-primary' : 'bg-on-surface-variant'}`}></div>
                </div>
              </div>
            </div>
          </article>
        </section>

        <aside className="hidden md:flex flex-col md:col-span-4 gap-card-gap">
          <div className="bg-surface-container-high shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] relative overflow-hidden rounded-xl p-6 border border-outline-variant/20">
            <div className="noise-overlay"></div>
            <div className="relative z-10">
              <h4 className="text-label-caps font-label-caps text-primary mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Vault Status
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-outline-variant/30 pb-2 border-dashed">
                  <span className="text-on-surface-variant text-sm">Network</span>
                  <span className="text-on-surface font-mono text-sm">Mainnet</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline-variant/30 pb-2 border-dashed">
                  <span className="text-on-surface-variant text-sm">Version</span>
                  <span className="text-on-surface font-mono text-sm">v2.4.1</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-on-surface-variant text-sm">Last Backup</span>
                  <span className="text-error text-sm font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Needs Backup
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};
