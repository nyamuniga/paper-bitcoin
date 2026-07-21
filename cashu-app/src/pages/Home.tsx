import React, { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { WalletBalanceCard } from '../components/home/WalletBalanceCard';
import { LightningAddressCard } from '../components/home/LightningAddressCard';
import { RecentTransactions } from '../components/home/RecentTransactions';
import { useHome } from '../hooks/useHome';
import { useNostr } from '../hooks/useNostr';
import { useWalletStore } from '../store/wallet';

export const Home = () => {
  const { balance, mintBalances } = useHome();
  // Initialize Nostr identity and background token claim loop
  const { claimNow } = useNostr();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const [startY, setStartY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (window.scrollY === 0 && startY > 0) {
      const currentY = e.clientY;
      const dist = currentY - startY;
      
      if (dist > 0) {
        setPullDistance(Math.min(dist * 0.5, 80)); // Dampen the pull
        if (dist > 60) {
          setPulling(true);
        } else {
          setPulling(false);
        }
      }
    }
  };

  const handlePointerUp = useCallback(async () => {
    if (pulling && !refreshing) {
      setRefreshing(true);
      setPullDistance(50); // Hold the spinner at 50px
      
      try {
        await Promise.all([claimNow(), refreshWallet()]);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
        setPulling(false);
        setStartY(0);
      }
    } else {
      setPullDistance(0);
      setPulling(false);
      setStartY(0);
    }
  }, [pulling, refreshing, claimNow, refreshWallet]);

  return (
    <div 
      className={`w-full relative min-h-screen ${startY > 0 ? 'select-none' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Pull to refresh indicator */}
      <div 
        className="absolute w-full flex justify-center left-0 top-0 z-50 pointer-events-none transition-transform duration-200 ease-out"
        style={{ 
          transform: `translateY(${refreshing ? 20 : pullDistance - 40}px)`,
          opacity: pullDistance > 10 || refreshing ? 1 : 0 
        }}
      >
        <div className="bg-surface-variant rounded-full p-2 shadow-lg border border-outline-variant/30 flex items-center justify-center">
          <Loader2 
            size={24} 
            className={`text-amber-500 ${refreshing ? 'animate-spin' : ''}`} 
            style={{ transform: !refreshing ? `rotate(${pullDistance * 5}deg)` : 'none' }}
          />
        </div>
      </div>

      <main 
        className="px-container-padding pt-4 md:pt-8 flex flex-col gap-6 pb-8 w-full transition-transform duration-200 ease-out"
        style={{ transform: `translateY(${refreshing ? 50 : pullDistance}px)` }}
      >
        <WalletBalanceCard balance={balance} mintBalances={mintBalances} />
        <LightningAddressCard />
        <RecentTransactions />
      </main>
    </div>
  );
};

export default Home;
