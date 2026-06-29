import { useState } from 'react';
import { RecoveryPhraseSection } from '../components/settings/RecoveryPhraseSection';
import { BiometricToggle } from '../components/settings/BiometricToggle';
import { VaultStatusPanel } from '../components/settings/VaultStatusPanel';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';

export const Settings = () => {
  const [isBackedUp, setIsBackedUp] = useState(true); // Default true for mock

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-headline-lg font-headline-lg text-primary mb-2">Settings & Security</h1>
        <p className="text-on-surface-variant text-body-md font-body-md">Manage your wallet keys and app preferences.</p>
      </div>

      <VaultStatusPanel isBackedUp={isBackedUp} setIsBackedUp={setIsBackedUp} />
      <BiometricToggle />
      <RecoveryPhraseSection />

      <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/30 mt-6">
        <h2 className="text-body-md font-body-md font-bold text-error mb-4">Danger Zone</h2>
        <div className="flex justify-between items-center bg-error-container/10 p-4 rounded-lg border border-error/20">
          <div>
            <h3 className="font-bold text-error">Reset Wallet</h3>
            <p className="text-sm text-on-surface-variant max-w-sm">This will permanently delete your local wallet data. Make sure you have your recovery phrase written down.</p>
          </div>
          <button 
            onClick={async () => {
              const confirm = await window.confirm("Are you sure you want to reset your wallet? THIS CANNOT BE UNDONE.");
              if (confirm) {
                try {
                  await invoke('reset_wallet');
                  toast.success("Wallet reset successfully.");
                  window.location.reload();
                } catch (e: any) {
                  toast.error("Failed to reset: " + e.toString());
                }
              }
            }}
            className="px-4 py-2 bg-error hover:bg-error/90 text-on-error rounded-lg font-bold transition-colors"
          >
            Reset
          </button>
        </div>
      </section>
    </main>
  );
};
