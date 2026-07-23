import { PageHeader } from '../components/shared/PageHeader';
import { TrustedMintsList } from '../components/home/TrustedMintsList';
import { useWalletStore } from '../store/wallet';

export default function Mints() {
  const { mintBalances } = useWalletStore();

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader 
        title="Trusted Mints" 
        subtitle="Manage and view all your connected mints."
      />
      <div className="mt-6">
        <TrustedMintsList mintBalances={mintBalances} showAll={true} />
      </div>
    </main>
  );
}
