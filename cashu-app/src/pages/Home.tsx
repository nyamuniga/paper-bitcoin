import { WalletBalanceCard } from '../components/home/WalletBalanceCard';
import { RecentTransactions } from '../components/home/RecentTransactions';
import { useHome } from '../hooks/useHome';

export const Home = () => {
  const { balance, mintBalances } = useHome();

  return (
    <main className="px-container-padding pt-4 md:pt-8 flex flex-col gap-6 pb-8 w-full">
      <WalletBalanceCard balance={balance} mintBalances={mintBalances} />
      <RecentTransactions />
    </main>
  );
};

export default Home;
