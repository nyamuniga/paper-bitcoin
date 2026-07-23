import { useState, useEffect } from 'react';
import { getVersion, getName } from '@tauri-apps/api/app';
import { RecoveryPhraseSection } from '../components/settings/RecoveryPhraseSection';
import { WalletManagementSection } from '../components/settings/WalletManagementSection';
import { NostrSection } from '../components/settings/NostrSection';
import { PageHeader } from '../components/shared/PageHeader';

export const Settings = () => {
  const [appInfo, setAppInfo] = useState({ name: '', version: '' });

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const name = await getName();
        const version = await getVersion();
        // Capitalize the first letter of the name
        const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
        setAppInfo({ name: formattedName, version });
      } catch (e) {
        console.error("Failed to fetch app info", e);
      }
    };
    fetchInfo();
  }, []);

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col gap-6">
      <PageHeader title="Settings & Security" subtitle="Manage your wallet keys and app preferences." />

      <RecoveryPhraseSection />
      <NostrSection />
      <WalletManagementSection />

      {appInfo.name && appInfo.version && (
        <div className="text-center mt-8 pb-4">
          <p className="text-xs text-on-surface-variant/50 font-bold uppercase tracking-wider">
            {appInfo.name} v{appInfo.version}
          </p>
        </div>
      )}
    </main>
  );
};
