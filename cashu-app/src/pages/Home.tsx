import { PendingTxAlert } from '../components/home/PendingTxAlert';
import { WalletBalanceCard } from '../components/home/WalletBalanceCard';
import { PayInvoiceCard } from '../components/home/PayInvoiceCard';
import { TrustedMintsList } from '../components/home/TrustedMintsList';
import { useHome } from '../hooks/useHome';

export const Home = () => {
  const {
    balance,
    mintBalances,
    pendingTxs,
    invoice,
    setInvoice,
    paying,
    handlePay
  } = useHome();

  return (
    <main className="relative z-10 px-container-padding max-w-[1200px] mx-auto pt-6 grid grid-cols-1 md:grid-cols-12 gap-card-gap md:gap-12 pb-8">
      <div className="md:col-span-7 flex flex-col gap-card-gap">
        <PendingTxAlert pendingTxs={pendingTxs} />
        <WalletBalanceCard balance={balance} />
        <PayInvoiceCard 
          invoice={invoice} 
          setInvoice={setInvoice} 
          paying={paying} 
          onPay={handlePay} 
        />
      </div>

      <div className="md:col-span-5 flex flex-col gap-card-gap mt-4 md:mt-0">
        <TrustedMintsList mintBalances={mintBalances} />
      </div>
    </main>
  );
};

export default Home;
