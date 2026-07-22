import { useState, useCallback, useRef, useEffect } from 'react';
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

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  // Keep mutable refs for state values needed inside native event listeners
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => { pullingRef.current = pulling; }, [pulling]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  const doRefresh = useCallback(async () => {
    if (pullingRef.current && !refreshingRef.current) {
      setRefreshing(true);
      setPullDistance(50); // Hold the spinner at 50px

      try {
        await Promise.all([claimNow(), refreshWallet()]);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
        setPulling(false);
        startYRef.current = 0;
      }
    } else {
      setPullDistance(0);
      setPulling(false);
      startYRef.current = 0;
    }
  }, [claimNow, refreshWallet]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // --- Touch events (Android / mobile) ---
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 5) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (window.scrollY <= 5 && startYRef.current > 0) {
        const clientY = e.touches[0].clientY;
        const dist = clientY - startYRef.current;

        if (dist > 0) {
          // Prevent the browser/WebView from handling this as a scroll/overscroll
          e.preventDefault();

          const dampened = Math.min(dist * 0.5, 80);
          setPullDistance(dampened);
          if (dist > 60) {
            setPulling(true);
          } else {
            setPulling(false);
          }
        } else if (dist < -10) {
          // If they swipe up, they want to scroll normally. Abort pull-to-refresh.
          startYRef.current = 0;
          setPullDistance(0);
          setPulling(false);
        }
      }
    };

    const onTouchEnd = () => {
      doRefresh();
    };

    // --- Pointer events (macOS / desktop / web with mouse) ---
    let pointerActive = false;

    const onPointerDown = (e: PointerEvent) => {
      // Only handle mouse/pen – touch pointers are handled by touch events above
      if (e.pointerType === 'touch') return;
      if (window.scrollY <= 5) {
        startYRef.current = e.clientY;
        pointerActive = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!pointerActive || startYRef.current <= 0) return;

      const dist = e.clientY - startYRef.current;

      if (dist > 0) {
        const dampened = Math.min(dist * 0.5, 80);
        setPullDistance(dampened);
        if (dist > 60) {
          setPulling(true);
        } else {
          setPulling(false);
        }
      } else if (dist < -10) {
        startYRef.current = 0;
        setPullDistance(0);
        setPulling(false);
        pointerActive = false;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (pointerActive) {
        pointerActive = false;
        doRefresh();
      }
    };

    // Touch: use { passive: false } on touchmove so we can call preventDefault()
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Pointer: for desktop mouse/trackpad (macOS Tauri, web browser)
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [doRefresh]);

  return (
    <div 
      ref={containerRef}
      className={`w-full relative min-h-screen ${startYRef.current > 0 ? 'select-none' : ''}`}
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

