import { PageHeader } from '../components/shared/PageHeader';
import { TrustedMintsList } from '../components/home/TrustedMintsList';
import { useWalletStore } from '../store/wallet';
import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function Mints() {
  const { mintBalances } = useWalletStore();
  const navigate = useNavigate();

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <PageHeader 
          title="Trusted Mints" 
          subtitle="Manage and view all your connected mints."
        />
        <button 
          onClick={() => navigate('/discover')}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2.5 rounded-xl font-bold transition-colors shadow-sm"
        >
          <Compass size={18} />
          Discover Mints
        </button>
      </div>
      <div className="mt-6">
        <TrustedMintsList mintBalances={mintBalances} showAll={true} />
      </div>
    </main>
  );
}
