import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Fingerprint } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const BiometricToggle = () => {
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  useEffect(() => {
    invoke<boolean>('is_biometrics_enabled')
      .then(setBiometricsEnabled)
      .catch(console.error);
  }, []);

  const toggleBiometrics = async () => {
    try {
      if (biometricsEnabled) {
        await invoke('disable_biometrics');
        setBiometricsEnabled(false);
        toast.success('Biometric login disabled');
      } else {
        await invoke('enable_biometrics');
        setBiometricsEnabled(true);
        toast.success('Biometric login enabled');
      }
    } catch (e: any) {
      toast.error('Failed: ' + e);
    }
  };

  return (
    <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/30 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-primary-container/20 rounded-full flex items-center justify-center border border-primary/20">
          <Fingerprint className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1">Biometric Authentication</h2>
          <p className="text-sm text-on-surface-variant">Require Touch ID / Face ID to open app</p>
        </div>
      </div>
      <button 
        onClick={toggleBiometrics}
        className={`w-14 h-7 rounded-full p-1 transition-colors ${biometricsEnabled ? 'bg-primary' : 'bg-surface-container-highest border border-outline-variant/30'}`}
      >
        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${biometricsEnabled ? 'translate-x-7' : 'translate-x-0'}`}></div>
      </button>
    </section>
  );
};
