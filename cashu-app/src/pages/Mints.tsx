import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Plus } from 'lucide-react';
import { PageHeader } from '../components/shared/PageHeader';
import { TrustedMintsList } from '../components/home/TrustedMintsList';
import { AddMintModal } from '../components/navigation/AddMintModal';
import { useWalletStore } from '../store/wallet';

export default function Mints() {
  const { mintBalances } = useWalletStore();
  const navigate = useNavigate();
  const [showAddMint, setShowAddMint] = useState(false);

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      {/* Fixed Sticky Header with Title and the Two Action Buttons */}
      <PageHeader
        title="Mints"
        subtitle="Connected endpoints & balances"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 w-full pt-1">
          {/* Discover Mints Button */}
          <button
            onClick={() => navigate('/discover')}
            className="h-[46px] sm:h-[50px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-[#1e3c2e] hover:border-primary/50 flex items-center justify-center gap-2 text-primary font-display-hero text-[13px] sm:text-[14px] font-bold transition-all shadow-sm cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Compass size={15} className="text-primary" />
            </div>
            <span className="truncate">Discover Mints</span>
          </button>

          {/* Add New Mint Button */}
          <button
            onClick={() => setShowAddMint(true)}
            className="h-[46px] sm:h-[50px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-dashed border-primary/50 hover:border-primary flex items-center justify-center gap-2 text-primary font-display-hero text-[13px] sm:text-[14px] font-bold transition-all shadow-sm cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Plus size={15} className="text-primary stroke-[2.5]" />
            </div>
            <span className="truncate">Add New Mint</span>
          </button>
        </div>
      </PageHeader>

      {/* Scrollable list of mint cards */}
      <div className="mt-2">
        <TrustedMintsList
          mintBalances={mintBalances}
          showAll={true}
          hideAddCard={true}
        />
      </div>

      {showAddMint && <AddMintModal onClose={() => setShowAddMint(false)} />}
    </main>
  );
}
