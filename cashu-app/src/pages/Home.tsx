import { WalletBalanceCard } from '../components/home/WalletBalanceCard';
import { TrustedMintsList } from '../components/home/TrustedMintsList';
import { RecentTransactions } from '../components/home/RecentTransactions';
import { useHome } from '../hooks/useHome';

export const Home = () => {
  const {
    balance,
    mintBalances,
  } = useHome();

  return (
    <main className="relative z-10 px-container-padding max-w-[480px] md:max-w-[1200px] mx-auto pt-4 md:pt-8 flex flex-col gap-6 pb-8 w-full">

      {/* Desktop: two-column layout / Mobile: single column */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
        {/* Left column — balance + actions + recent activity (desktop) */}
        <div className="md:col-span-7 flex flex-col gap-6">
          <WalletBalanceCard balance={balance} />
          <div className="hidden md:block">
            <RecentTransactions />
          </div>
        </div>

        {/* Right column — mints */}
        <div className="md:col-span-5 flex flex-col gap-6">
          <TrustedMintsList mintBalances={mintBalances} />
        </div>
      </div>

      {/* Mobile only — recent activity below mints */}
      <div className="md:hidden">
        <RecentTransactions />
      </div>
    </main>
  );
};

export default Home;
