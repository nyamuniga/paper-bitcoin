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

      <PageHeader
        title="Trusted Mints"
        subtitle="Manage and view all your connected mints."
      />
      <div className="mt-6">
        <TrustedMintsList
          mintBalances={mintBalances}
          showAll={true}
          topAction={
            <div
              onClick={() => navigate('/discover')}
              className="bg-primary/5 rounded-2xl p-3.5 md:p-4 flex items-center justify-center gap-3 shadow-inner border-2 border-primary/20 relative group hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 cursor-pointer"
            >
              <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 relative z-10 pointer-events-none group-hover:scale-105 transition-transform">
                <Compass className="text-primary w-5 h-5" />
              </div>
              <span className="text-body-md font-body-md text-primary font-bold relative z-10 pointer-events-none tracking-wide">Discover Mints</span>
            </div>
          }
        />
      </div>
    </main>
  );
}
