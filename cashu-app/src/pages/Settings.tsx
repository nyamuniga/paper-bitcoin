import { RecoveryPhraseSection } from '../components/settings/RecoveryPhraseSection';
import { PageHeader } from '../components/shared/PageHeader';

export const Settings = () => {

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col gap-6">
      <PageHeader title="Settings & Security" subtitle="Manage your wallet keys and app preferences." />

      <RecoveryPhraseSection />
    </main>
  );
};
