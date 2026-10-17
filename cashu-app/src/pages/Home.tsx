import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { WalletBalanceCard } from '../components/home/WalletBalanceCard';
import { LightningAddressCard } from '../components/home/LightningAddressCard';
import { RecentTransactions } from '../components/home/RecentTransactions';
import { PendingNwcModal } from '../components/home/PendingNwcModal';
import { useHome } from '../hooks/useHome';
import { useNostr } from '../hooks/useNostr';
import { useWalletStore } from '../store/wallet';
import { useNwcStore } from '../store/nwcStore';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'react-hot-toast';
import { Zap } from 'lucide-react';

export const Home = () => {
  const { balance, mintBalances, isLoading } = useHome();
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

  const { pendingRequests, fetchPendingRequests } = useNwcStore();
  const [showPendingNwcModal, setShowPendingNwcModal] = useState(false);

  useEffect(() => {
    fetchPendingRequests();
    
    const unlisten1 = listen('nwc_delayed_request_added', () => {
      fetchPendingRequests();
      toast.success('New delayed Zap requires approval', { icon: '⚡' });
    });
    
    const unlisten2 = listen('nwc_queue_updated', () => {
      fetchPendingRequests();
    });
    
    return () => {
      unlisten1.then(f => f());
      unlisten2.then(f => f());
    };
  }, [fetchPendingRequests]);

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

    const getScrollTop = () => {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    };

    const isModalOrSheetActive = () => {
      return (
        document.body.classList.contains('has-bottom-sheet-open') ||
        document.documentElement.classList.contains('has-bottom-sheet-open') ||
        Boolean(document.querySelector('.fixed.inset-0.z-\\[100\\], [role="dialog"], [data-modal]'))
      );
    };

    const isValidPullTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      if (!containerRef.current || !containerRef.current.contains(target)) return false;
      if (target.closest('[role="dialog"], [data-bottom-sheet], [data-modal], .modal-container, .fixed')) {
        return false;
      }
      return true;
    };

    // --- Touch events (Android / mobile) ---
    const onTouchStart = (e: TouchEvent) => {
      if (isModalOrSheetActive() || !isValidPullTarget(e.target)) {
        startYRef.current = 0;
        return;
      }

      if (getScrollTop() <= 5) {
        startYRef.current = e.touches[0].clientY;
      } else {
        startYRef.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isModalOrSheetActive() || startYRef.current <= 0) {
        if (startYRef.current > 0) {
          startYRef.current = 0;
          setPullDistance(0);
          setPulling(false);
        }
        return;
      }

      if (getScrollTop() <= 5) {
        const clientY = e.touches[0].clientY;
        const dist = clientY - startYRef.current;

        if (dist > 0) {
          // Prevent browser pull/overscroll conflict when pulling down to refresh
          if (e.cancelable) {
            e.preventDefault();
          }

          const dampened = Math.min(dist * 0.5, 80);
          setPullDistance(dampened);
          if (dist > 50) {
            setPulling(true);
          } else {
            setPulling(false);
          }
        } else if (dist < -10) {
          // If swiping up to scroll normally: abort pull-to-refresh
          startYRef.current = 0;
          setPullDistance(0);
          setPulling(false);
        }
      }
    };

    const onTouchEnd = () => {
      if (isModalOrSheetActive() || startYRef.current <= 0) {
        startYRef.current = 0;
        setPullDistance(0);
        setPulling(false);
        return;
      }

      doRefresh();
    };

    // --- Pointer events (desktop / mouse / trackpad) ---
    let pointerActive = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (isModalOrSheetActive() || !isValidPullTarget(e.target)) {
        startYRef.current = 0;
        pointerActive = false;
        return;
      }

      if (getScrollTop() <= 5) {
        startYRef.current = e.clientY;
        pointerActive = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (isModalOrSheetActive() || !pointerActive || startYRef.current <= 0) {
        if (pointerActive) {
          pointerActive = false;
          startYRef.current = 0;
          setPullDistance(0);
          setPulling(false);
        }
        return;
      }

      const dist = e.clientY - startYRef.current;

      if (dist > 0) {
        const dampened = Math.min(dist * 0.5, 80);
        setPullDistance(dampened);
        if (dist > 50) {
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
      if (isModalOrSheetActive() || !pointerActive || startYRef.current <= 0) {
        pointerActive = false;
        startYRef.current = 0;
        setPullDistance(0);
        setPulling(false);
        return;
      }

      pointerActive = false;
      doRefresh();
    };

    // Touch: use { passive: false } on touchmove so we can call preventDefault()
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Pointer events for desktop testing
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [doRefresh]);

  return (
    <div 
      ref={containerRef}
      className={`w-full relative min-h-screen ${pullDistance > 0 ? 'select-none' : ''}`}
    >
      {/* Pull to refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div 
          className="absolute w-full flex justify-center left-0 top-2 z-40 pointer-events-none transition-transform duration-200 ease-out"
          style={{ 
            transform: `translateY(${refreshing ? 24 : Math.min(pullDistance, 55)}px)`,
            opacity: pullDistance > 5 || refreshing ? 1 : 0 
          }}
        >
          <div className="bg-[#0c1b14] rounded-full p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)] border border-[#1e3c2e] flex items-center justify-center">
            <Loader2 
              size={22} 
              className={`text-primary ${refreshing ? 'animate-spin' : ''}`} 
              style={{ transform: !refreshing ? `rotate(${pullDistance * 6}deg)` : 'none' }}
            />
          </div>
        </div>
      )}

      <main 
        className={`px-4 sm:px-6 md:px-8 pt-2 md:pt-5 pb-12 w-full max-w-[480px] md:max-w-[1200px] mx-auto flex flex-col gap-4 ${
          pullDistance > 0 || refreshing ? 'transition-transform duration-200 ease-out' : ''
        }`}
        style={pullDistance > 0 || refreshing ? { transform: `translateY(${refreshing ? 50 : pullDistance}px)` } : undefined}
      >
        {pendingRequests.length > 0 && (
          <div 
            onClick={() => setShowPendingNwcModal(true)}
            className="bg-primary/15 border border-primary/20 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-primary/25 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Zap size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-on-surface font-bold">Pending Zaps</h3>
                <p className="text-sm text-on-surface-variant">You have {pendingRequests.length} zap{pendingRequests.length > 1 ? 's' : ''} awaiting approval</p>
              </div>
            </div>
            <button className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-sm cursor-pointer">
              Review
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
          <div className="md:col-span-5 lg:col-span-5 flex flex-col gap-3.5 sm:gap-4">
            <WalletBalanceCard balance={balance} mintBalances={mintBalances} isLoading={isLoading} />
            <LightningAddressCard />
          </div>
          <div className="md:col-span-7 lg:col-span-7">
            <RecentTransactions />
          </div>
        </div>
      </main>

      {showPendingNwcModal && <PendingNwcModal onClose={() => setShowPendingNwcModal(false)} />}
    </div>
  );
};

export default Home;

