import { useState, useEffect } from 'react';
import { getVersion, getName } from '@tauri-apps/api/app';
import { RecoveryPhraseSection } from '../components/settings/RecoveryPhraseSection';
import { WalletManagementSection } from '../components/settings/WalletManagementSection';
import { NostrSection } from '../components/settings/NostrSection';
import { LockedEcashSection } from '../components/settings/LockedEcashSection';
import { NWCSection } from '../components/settings/NWCSection';
import { PageHeader } from '../components/shared/PageHeader';

export const Settings = () => {
  const [appInfo, setAppInfo] = useState({ name: '', version: '' });
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (sectionId: string) => {
    setActiveSection((prev) => (prev === sectionId ? null : sectionId));
  };

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
      <PageHeader title="Settings" subtitle="Keys, connections & preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
          <RecoveryPhraseSection
            isExpanded={activeSection === 'recovery'}
            onToggle={() => toggleSection('recovery')}
          />
          <NWCSection
            isExpanded={activeSection === 'nwc'}
            onToggle={() => toggleSection('nwc')}
          />
        </div>
        <div className="flex flex-col gap-6">
          <NostrSection
            isExpanded={activeSection === 'nostr'}
            onToggle={() => toggleSection('nostr')}
          />
          <LockedEcashSection
            isExpanded={activeSection === 'locked-ecash'}
            onToggle={() => toggleSection('locked-ecash')}
          />
          <WalletManagementSection
            isExpanded={activeSection === 'wallet'}
            onToggle={() => toggleSection('wallet')}
          />
        </div>
      </div>

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
