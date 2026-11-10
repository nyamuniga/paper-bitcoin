import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { QrCode, ArrowDownLeft, ArrowUpRight, Coins, Bitcoin, Banknote, ChevronDown, Phone, Check, Eye, EyeOff } from 'lucide-react';
import { ActionMenuModal } from './ActionMenuModal';
import { useWalletStore } from '../../store/wallet';
import { useStableBalance } from '../../hooks/useStableBalance';
import { dollarAmount, dollarFiatValue } from '../../services/transferAmount';
import { balanceTabAfterSwipe, isHorizontalSwipe } from '../../utils/balanceCardGesture';
import type { BalanceTab } from '../../utils/balanceCardGesture';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { Skeleton } from '../shared/Skeleton';
import { SlidingSegmentedControl } from '../shared/SlidingSegmentedControl';
import { registerBottomSheetOpen, registerBottomSheetClose } from '../../hooks/useBottomSheet';
import { useCurrencyStore } from '../../store/currencyStore';

const balanceSymbolClass = 'text-[#f2a93b] text-[34px] sm:text-[42px] md:text-[48px] font-extrabold leading-none select-none flex-shrink-0';

interface WalletBalanceCardProps {
  balance: number;
  mintBalances?: Record<string, number>;
  isLoading?: boolean;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance, mintBalances, isLoading = false }) => {
  const stable = useStableBalance();
  const balanceTab = useWalletStore(s => s.balanceView);
  const setBalanceTab = useWalletStore(s => s.setBalanceView);
  const balanceTabsId = useId();
  const balanceCardRef = useRef<HTMLDivElement>(null);
  const wheelSwipe = useRef({delta:0, last:0, switched:false});
  const swipeStart = useRef<{x:number; y:number} | null>(null);
  const suppressSwipeClick = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const mintTriggerRef = useRef<HTMLButtonElement>(null);
  const [mintMenuPosition, setMintMenuPosition] = useState({top:0, left:0, maxHeight:300, triggerTop:0, triggerLeft:0, triggerWidth:0});
  const [showMintDropdown, setShowMintDropdown] = useState(false);
  const [isClosingDropdown, setIsClosingDropdown] = useState(false);

  const selectBalanceTab = (tab: BalanceTab) => {
    setBalanceTab(tab);
    setShowMintDropdown(false);
    setIsClosingDropdown(false);
  };
  const startBalanceSwipe = (x: number, y: number, target: EventTarget | null) => {
    suppressSwipeClick.current = 0;
    swipeStart.current = !showMintDropdown && target instanceof Element && !target.closest('button, a, input, [data-modal]') ? {x,y} : null;
  };
  const endBalanceSwipe = (x: number, y: number) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const next = balanceTabAfterSwipe(balanceTab, x - start.x, y - start.y);
    if (next !== balanceTab) {
      suppressSwipeClick.current = performance.now() + 350;
      selectBalanceTab(next);
    }
  };


  useEffect(() => {
    const card = balanceCardRef.current;
    if (!card) return;
    const onWheel = (event: WheelEvent) => {
      if (showMintDropdown || event.ctrlKey || !isHorizontalSwipe(event.deltaX, event.deltaY, 1)) return;
      if (event.cancelable) event.preventDefault();
      const gesture = wheelSwipe.current;
      const now = performance.now();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? card.clientWidth : 1;
      const delta = event.deltaX * multiplier;
      if (now - gesture.last > 180 || Math.sign(delta) !== Math.sign(gesture.delta)) {
        gesture.delta = 0; gesture.switched = false;
      }
      gesture.last = now;
      gesture.delta += delta;
      if (!gesture.switched && Math.abs(gesture.delta) >= 48) {
        const next = balanceTabAfterSwipe(balanceTab, -gesture.delta, 0);
        if (next !== balanceTab) selectBalanceTab(next);
        gesture.switched = true;
      }
    };
    card.addEventListener('wheel', onWheel, {passive:false});
    return () => card.removeEventListener('wheel', onWheel);
  }, [balanceTab, showMintDropdown]);

  const closeMintDropdown = () => {
    setIsClosingDropdown(true);
    setTimeout(() => {
      setShowMintDropdown(false);
      setIsClosingDropdown(false);
    }, 160);
  };

  const positionMintMenu = () => {
    const rect = mintTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(256, window.innerWidth - 48);
    const top = Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - 156));
    setMintMenuPosition({
      top,
      triggerTop:rect.top, triggerLeft:rect.left, triggerWidth:rect.width,
      left: Math.max(24, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 24)),
      maxHeight: Math.min(300, window.innerHeight - top - 12),
    });
  };

  useEffect(() => {
    if (!showMintDropdown) return;
    window.addEventListener('resize', positionMintMenu);
    return () => window.removeEventListener('resize', positionMintMenu);
  }, [showMintDropdown]);

  const toggleMintDropdown = () => {
    if (showMintDropdown) {
      closeMintDropdown();
    } else {
      positionMintMenu();
      setShowMintDropdown(true);
    }
  };


  const mintUrls = Object.keys(mintBalances || {});
  const [selectedMint, setSelectedMint] = useState<string | null>(() => localStorage.getItem('preferred_mint_url'));

  // Multi-currency support from currencyStore
  const preferredCurrency = useCurrencyStore((s) => s.preferredCurrency);
  const rates = useCurrencyStore(s => s.rates);
  const fetchRates = useCurrencyStore((s) => s.fetchRates);
  const convert = useCurrencyStore((s) => s.convert);
  const getCurrencyMeta = useCurrencyStore((s) => s.getCurrencyMeta);
  const currentMeta = getCurrencyMeta(preferredCurrency);

  const [isInitialLoadingRate, setIsInitialLoadingRate] = useState<boolean>(true);
  const conversion = useMemo(() => convert(balance), [balance, preferredCurrency, rates, convert]);
  const targetFiatValue = conversion.value;
  const dollarEquivalent = stable.balance === null ? null : dollarFiatValue(stable.balance, preferredCurrency, rates);
  const dollarBalanceLoading = stable.balance === null || Boolean(stable.error);
  const dollarRateLoading = isInitialLoadingRate || dollarBalanceLoading || dollarEquivalent === null;
  const bitcoinRateLoading = isInitialLoadingRate && preferredCurrency !== 'BTC';

  const [displayedFiatValue, setDisplayedFiatValue] = useState<number | null>(() => targetFiatValue || null);
  const [isNumberAnimating, setIsNumberAnimating] = useState<boolean>(false);
  const currentDisplayRef = useRef<number | null>(displayedFiatValue);
  const prevCurrencyRef = useRef<string>(preferredCurrency);
  const animationFrameRef = useRef<number | null>(null);

  const [hideBalance, setHideBalance] = useState<boolean>(() => localStorage.getItem('hide_balance') === 'true');

  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      localStorage.setItem('hide_balance', String(next));
      return next;
    });
  };

  const activeMint = (selectedMint && mintUrls.includes(selectedMint)) ? selectedMint : (mintUrls.length > 0 ? mintUrls[0] : null);

  // Background ticker polling
  useEffect(() => {
    let isMounted = true;

    const poll = async (isInitial = false) => {
      if (!isInitial && typeof document !== 'undefined' && document.hidden) return;
      try {
        await fetchRates();
      } catch (e) {
        console.error("Failed to fetch exchange rates", e);
      } finally {
        if (isMounted && isInitial) {
          setIsInitialLoadingRate(false);
        }
      }
    };

    poll(true);
    const interval = setInterval(() => poll(false), 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchRates]);

  // Smooth numeric counter animation
  useEffect(() => {
    if (targetFiatValue === null || isNaN(targetFiatValue)) return;

    // When currency changed, immediately show the new currency value without animating across scales
    if (prevCurrencyRef.current !== preferredCurrency) {
      prevCurrencyRef.current = preferredCurrency;
      setDisplayedFiatValue(targetFiatValue);
      currentDisplayRef.current = targetFiatValue;
      return;
    }

    const startVal = currentDisplayRef.current !== null ? currentDisplayRef.current : 0;
    const endVal = targetFiatValue;

    if (startVal === endVal && currentDisplayRef.current !== null) {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setIsNumberAnimating(true);
    const startTime = performance.now();
    const duration = 650; // ms

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const nextVal = currentMeta.decimals === 0
        ? Math.round(startVal + (endVal - startVal) * eased)
        : Number((startVal + (endVal - startVal) * eased).toFixed(currentMeta.decimals));

      setDisplayedFiatValue(nextVal);
      currentDisplayRef.current = nextVal;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayedFiatValue(endVal);
        currentDisplayRef.current = endVal;
        setIsNumberAnimating(false);
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetFiatValue, preferredCurrency, currentMeta.decimals]);

  const formatFiatValue = (val: number | null) => {
    if (val === null || isNaN(val)) return `••• ${currentMeta.code}`;
    const formattedNum = currentMeta.decimals === 0
      ? Math.round(val).toLocaleString()
      : val.toLocaleString(undefined, {
          minimumFractionDigits: currentMeta.decimals,
          maximumFractionDigits: currentMeta.decimals,
        });
    return currentMeta.symbol !== currentMeta.code
      ? `${currentMeta.symbol}${formattedNum} ${currentMeta.code}`
      : `${formattedNum} ${currentMeta.code}`;
  };
  // USD is the same holding, so use the balance's exact cent formatting rather
  // than rounding its floating-point fiat equivalent up to a different amount.
  const dollarEquivalentDisplay = preferredCurrency === 'USD' && stable.balance !== null
    ? `${dollarAmount(stable.balance)} USD`
    : dollarEquivalent !== null ? formatFiatValue(dollarEquivalent) : null;

  React.useEffect(() => {
    if (new URLSearchParams(location.search).has('convert')) {
      navigate('/convert', {replace:true});
    }
  }, [location.search, location.pathname, navigate]);

  React.useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.ecashRequest) {
        navigate('/send-ecash', { replace: true, state: { mintUrl: activeMint, ecashRequest: state.ecashRequest } });
      } else if (state.ecashToken) {
        navigate('/receive-ecash', { replace: true, state: { mintUrl: activeMint, ecashToken: state.ecashToken } });
      } else if (state.lnbcInvoice) {
        navigate('/send-bitcoin', { replace: true, state: {
          mintUrl: activeMint, invoice: state.lnbcInvoice, amountSats: state.onchainAmountSats,
        } });
      }
    }
  }, [location, navigate]);

  React.useEffect(() => {
    if (showMintDropdown) {
      registerBottomSheetOpen();
      return () => {
        registerBottomSheetClose();
      };
    }
  }, [showMintDropdown]);

  React.useEffect(() => {
    if (!showMintDropdown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMintDropdown();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMintDropdown]);

  const renderMintSelector = (floating = false) => (
    <button
      ref={floating ? undefined : mintTriggerRef}
      style={floating ? {position:'fixed', top:mintMenuPosition.triggerTop, left:mintMenuPosition.triggerLeft, width:mintMenuPosition.triggerWidth, zIndex:10, pointerEvents:'auto'} : showMintDropdown ? {visibility:'hidden'} : undefined}
      aria-expanded={showMintDropdown && !isClosingDropdown}
      aria-controls="wallet-mint-selector"
      onClick={toggleMintDropdown}
      className={`flex items-center gap-2 bg-[#12261d] hover:bg-[#162f24] px-3 sm:px-3.5 py-1.5 rounded-full transition-all mb-3 border shadow-sm active:scale-95 max-w-[calc(100vw-64px)] sm:max-w-none cursor-pointer ${showMintDropdown && !isClosingDropdown
        ? 'border-primary/50 shadow-[0_0_16px_rgba(242,169,59,0.2)] bg-[#163024]'
        : 'border-[#1e3c2e]'
        }`}
    >
      {activeMint ? (
        <>
          <MintIcon mintUrl={activeMint} className="w-5 h-5 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[9px] font-bold" />
          <MintName
            mintUrl={activeMint}
            className="font-mono text-[10px] sm:text-[11px] font-bold text-[#8b9e94] tracking-wider uppercase truncate max-w-[120px] sm:max-w-[150px]"
          />
        </>
      ) : (
        <span className="font-mono text-[10px] sm:text-[11px] font-bold text-primary px-1 tracking-wider uppercase">ALL MINTS</span>
      )}
      <ChevronDown
        size={14}
        className={`flex-shrink-0 transition-transform duration-300 ease-out ${showMintDropdown && !isClosingDropdown ? 'rotate-180 text-primary' : 'text-[#8b9e94]'
          }`}
      />
    </button>
  );

  return (
    <section className={`flex flex-col gap-4 md:gap-5 relative ${showMintDropdown ? 'z-30' : 'z-10'}`}>
      {/* Balance display */}
      <div
        data-wallet-balance-card
        ref={balanceCardRef}
        className="relative p-5 sm:p-6 md:p-8 flex flex-col items-center justify-center gap-4 min-h-[220px] sm:min-h-[235px] md:min-h-[260px] z-10 bg-[#0c1b14] rounded-[24px] sm:rounded-[28px] border border-[#142d20] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        style={{touchAction:'pan-y pinch-zoom'}}
        onTouchStart={event => {
          const touch = event.touches[0];
          if (event.touches.length === 1 && touch) startBalanceSwipe(touch.clientX, touch.clientY, event.target);
          else swipeStart.current = null;
        }}
        onTouchMove={event => {if (event.touches.length !== 1) swipeStart.current = null;}}
        onTouchEnd={event => {const touch = event.changedTouches[0]; if(touch) endBalanceSwipe(touch.clientX,touch.clientY);}}
        onTouchCancel={() => {swipeStart.current = null;}}
        onPointerDown={event => {if(event.pointerType !== 'touch' && event.button === 0) startBalanceSwipe(event.clientX,event.clientY,event.target);}}
        onPointerMove={event => {
          if (event.pointerType !== 'touch' && event.buttons === 0) {swipeStart.current = null; return;}
          const start = swipeStart.current;
          if (event.pointerType !== 'touch' && start && isHorizontalSwipe(event.clientX-start.x,event.clientY-start.y,12) && !event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={event => {
          if(event.pointerType !== 'touch') endBalanceSwipe(event.clientX,event.clientY);
          if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {swipeStart.current = null;}}
        onPointerLeave={event => {if(event.pointerType !== 'touch' && !event.currentTarget.hasPointerCapture(event.pointerId)) swipeStart.current = null;}}
        onClickCapture={event => {if(performance.now() < suppressSwipeClick.current) {event.preventDefault(); event.stopPropagation(); suppressSwipeClick.current = 0;}}}
      >
        <SlidingSegmentedControl<BalanceTab>
          compact tabListId={balanceTabsId} ariaLabel="Wallet balance currency"
          options={[{id:'btc',label:'BTC'},{id:'usd',label:'USD'}]}
          value={balanceTab} onChange={selectBalanceTab}
        />
        <div role="tabpanel" id={`${balanceTabsId}-btc-panel`} aria-labelledby={`${balanceTabsId}-btc`} hidden={balanceTab !== 'btc'} className={`wallet-balance-panel w-full min-h-[132px] flex-col items-center justify-center ${balanceTab === 'btc' ? 'flex animate-tab-from-left' : 'hidden'}`}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-2 w-full select-none">
            {/* Mint pill badge skeleton */}
            <Skeleton className="h-7 w-32 sm:w-36 rounded-full mb-3.5 sm:mb-4 opacity-80" />

            {/* Big balance placeholder skeleton */}
            <div className="flex items-center justify-center my-1 sm:my-2">
              <Skeleton className="h-10 sm:h-12 md:h-14 w-44 sm:w-56 md:w-64 rounded-2xl" />
            </div>

            {/* Fiat subtitle skeleton */}
            <Skeleton className="h-3.5 sm:h-4 w-20 sm:w-24 rounded-md mt-1.5 opacity-60" />
          </div>
        ) : (
          <>
            <div className="relative z-30 flex flex-col items-center max-w-full">
              {renderMintSelector()}

              {showMintDropdown && createPortal(
                <div className="fixed inset-0 z-[100] pointer-events-none">
                  {renderMintSelector(true)}
                  <div
                    className={`absolute inset-0 pointer-events-auto cursor-pointer ${isClosingDropdown ? 'animate-mint-backdrop-out' : 'animate-mint-backdrop-in'
                      }`}
                    onClick={closeMintDropdown}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => {
                      e.stopPropagation();
                      if (e.cancelable) e.preventDefault();
                    }}
                    onWheel={(e) => {
                      e.stopPropagation();
                      if (e.cancelable) e.preventDefault();
                    }}
                    aria-label="Close mint selector"
                  />
                  <div
                    id="wallet-mint-selector"
                    data-modal="mint-selector"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    className="fixed z-10 pointer-events-auto"
                    style={{top:mintMenuPosition.top, left:mintMenuPosition.left}}
                  >
                    <div
                      className={`w-64 max-w-[calc(100vw-48px)] bg-[#0c1b14]/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] border border-[#1e422f] overflow-hidden flex flex-col max-h-[300px] overflow-y-auto overscroll-contain touch-pan-y ${isClosingDropdown ? 'animate-dropdown-collapse' : 'animate-dropdown-expand'
                        }`}
                      style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', maxHeight:mintMenuPosition.maxHeight }}
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {/* Golden top highlight */}
                      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
                      {mintUrls.map((mint, index) => (
                        <button
                          key={mint}
                          style={{ animationDelay: `${index * 30}ms` }}
                          onClick={() => {
                            setSelectedMint(mint);
                            localStorage.setItem('preferred_mint_url', mint);
                            invoke('set_app_default_mint', { mintUrl: mint }).catch(console.error);
                            closeMintDropdown();
                          }}
                          className="flex items-center justify-between p-3 sm:p-3.5 hover:bg-[#12261d] transition-colors text-left border-b border-[rgba(247,244,235,0.04)] last:border-b-0 animate-dropdown-item cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <MintIcon mintUrl={mint} className="w-6 h-6 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                            <MintName mintUrl={mint} className="text-body-sm font-body-sm text-on-surface truncate" />
                            {activeMint === mint && <Check size={14} className="text-primary flex-shrink-0" />}
                          </div>
                          <span className="font-mono text-body-sm font-semibold text-primary flex-shrink-0">
                            {hideBalance ? '••••••' : `₿${(mintBalances![mint] || 0).toLocaleString()}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>, document.body
              )}
            </div>

            <div className={`relative z-10 flex flex-col items-center gap-1.5 max-w-full transition-all duration-200 ${showMintDropdown && !isClosingDropdown ? 'opacity-25 filter blur-[1px]' : 'opacity-100'
              }`}>
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 max-w-full">
                <span data-balance-symbol="btc" className={balanceSymbolClass} aria-hidden="true">₿</span>
                <span
                  data-balance-amount="btc" role="button" tabIndex={0}
                  onClick={toggleHideBalance}
                  onKeyDown={event => {if(event.key === 'Enter' || event.key === ' ') {event.preventDefault(); toggleHideBalance();}}}
                  className="text-[#f7f4eb] text-[40px] sm:text-[50px] md:text-[58px] leading-none font-display-hero font-extrabold tracking-tight cursor-pointer select-none truncate"
                  title={hideBalance ? "Click to show balance" : "Click to hide balance"}
                >
                  {hideBalance ? '••••••' : balance.toLocaleString()}
                </span>
                <button
                  onClick={toggleHideBalance}
                  className="text-[#627d70] hover:text-[#f7f4eb] p-1.5 sm:p-2 rounded-full hover:bg-[#12261d] transition-all active:scale-95 cursor-pointer ml-0.5 sm:ml-1 flex-shrink-0"
                  title={hideBalance ? "Show balance" : "Hide balance"}
                  aria-label={hideBalance ? "Show balance" : "Hide balance"}
                >
                  {hideBalance ? <EyeOff size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" /> : <Eye size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" />}
                </button>
              </div>
              {(displayedFiatValue !== null || targetFiatValue > 0 || bitcoinRateLoading || preferredCurrency === 'BTC') && (
                <span
                  className={`text-[13px] sm:text-[14px] font-medium mt-0.5 tracking-tight select-none truncate max-w-full transition-all duration-300 animate-rwf-in ${bitcoinRateLoading
                    ? 'animate-rwf-shimmer'
                    : isNumberAnimating
                      ? 'animate-rwf-updating font-semibold'
                      : 'text-[#6f887b]'
                    }`}
                  title={bitcoinRateLoading ? "Refreshing estimated rate..." : undefined}
                >
                  {hideBalance
                    ? `≈ •••••• ${currentMeta.code}`
                    : displayedFiatValue !== null
                      ? `≈ ${formatFiatValue(displayedFiatValue)}`
                      : targetFiatValue > 0
                        ? `≈ ${formatFiatValue(targetFiatValue)}`
                        : `≈ ••• ${currentMeta.code}`}
                </span>
              )}
            </div>
          </>
        )}
        </div>
        <div role="tabpanel" id={`${balanceTabsId}-usd-panel`} aria-labelledby={`${balanceTabsId}-usd`} hidden={balanceTab !== 'usd'} className={`wallet-balance-panel w-full min-h-[132px] flex-col items-center justify-center ${balanceTab === 'usd' ? 'flex animate-tab-from-right' : 'hidden'}`}>
          <p className="text-[#a3b5aa] text-xs font-medium h-[34px] shrink-0 mb-3 flex items-center">Dollar balance</p>
          <div className="relative z-10 flex flex-col items-center gap-1.5 max-w-full">
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 max-w-full">
            <span data-balance-symbol="usd" className={balanceSymbolClass} aria-hidden="true">$</span>
            <span
              data-balance-amount="usd" role="button" tabIndex={0}
              onClick={toggleHideBalance}
              onKeyDown={event => {if(event.key === 'Enter' || event.key === ' ') {event.preventDefault(); toggleHideBalance();}}}
              title={hideBalance ? 'Click to show balance' : 'Click to hide balance'}
              className={`min-w-0 truncate font-display-hero font-extrabold tracking-tight leading-none select-none cursor-pointer text-[40px] sm:text-[50px] md:text-[58px] ${!hideBalance && dollarBalanceLoading ? 'animate-rwf-shimmer' : 'text-[#f7f4eb]'}`}
              aria-busy={!hideBalance && dollarBalanceLoading}
            >{hideBalance ? '••••••' : <>
              {stable.balance === null ? <span aria-hidden="true">••••</span> : dollarAmount(stable.balance).replace('$','')}
              {dollarBalanceLoading && <span className="sr-only">{stable.balance === null ? 'Loading dollar balance' : 'Refreshing dollar balance; showing last known amount'}</span>}
            </>}</span>
            <button onClick={toggleHideBalance} className="text-[#627d70] hover:text-[#f7f4eb] p-1.5 sm:p-2 rounded-full hover:bg-[#12261d] transition-all active:scale-95 cursor-pointer ml-0.5 sm:ml-1 flex-shrink-0" title={hideBalance ? 'Show balance' : 'Hide balance'} aria-label={hideBalance ? 'Show balance' : 'Hide balance'}>{hideBalance ? <EyeOff size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]"/> : <Eye size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]"/>}</button>
          </div>
          <span
            data-dollar-equivalent
            className={`text-[13px] sm:text-[14px] font-medium mt-0.5 tracking-tight select-none truncate max-w-full animate-rwf-in ${dollarRateLoading && !hideBalance ? 'animate-rwf-shimmer' : 'text-[#6f887b]'}`}
            aria-busy={!hideBalance && dollarRateLoading}
            title={dollarRateLoading ? 'Refreshing estimated rate…' : `Estimated value in ${currentMeta.code}`}
          >{hideBalance ? `≈ •••••• ${currentMeta.code}` : dollarEquivalentDisplay !== null ? `≈ ${dollarEquivalentDisplay}` : `≈ ••• ${currentMeta.code}`}</span>
          </div>
        </div>
      </div>



      {/* Action buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setShowReceive(true)}
          className="flex-1 h-[48px] sm:h-[54px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] border border-[#183325] flex items-center justify-center gap-1.5 sm:gap-2 text-[#f7f4eb] font-display-hero text-[13px] sm:text-[15px] font-bold active:scale-95 transition-all duration-200 cursor-pointer tracking-wide"
        >
          <ArrowDownLeft size={16} className="sm:w-[18px] sm:h-[18px] text-[#f2a93b] stroke-[2.5] flex-shrink-0" />
          <span className="font-bold">Receive</span>
        </button>
        <Link
          to="/scan"
          className="w-[50px] h-[50px] sm:w-[58px] sm:h-[58px] rounded-full bg-[#f2a93b] hover:bg-[#fbb94d] text-[#06110c] shadow-[0_0_24px_rgba(242,169,59,0.45)] flex items-center justify-center active:scale-95 transition-all duration-200 flex-shrink-0"
        >
          <QrCode size={20} className="sm:w-[23px] sm:h-[23px] stroke-[2.5]" />
        </Link>
        <button
          onClick={() => setShowSend(true)}
          className="flex-1 h-[48px] sm:h-[54px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] border border-[#183325] flex items-center justify-center gap-1.5 sm:gap-2 text-[#f7f4eb] font-display-hero text-[13px] sm:text-[15px] font-bold active:scale-95 transition-all duration-200 cursor-pointer tracking-wide"
        >
          <ArrowUpRight size={16} className="sm:w-[18px] sm:h-[18px] text-[#f2a93b] stroke-[2.5] flex-shrink-0" />
          <span className="font-bold">Send</span>
        </button>
      </div>

      {showReceive && (
        <ActionMenuModal
          title="Receive"
          onClose={() => setShowReceive(false)}
          options={[

            {
              label: 'Ecash',
              icon: <Coins size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/receive-ecash', { state: { mintUrl: activeMint } });
              }
            },
            {
              label: 'Bitcoin',
              icon: <Bitcoin size={25} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/receive-bitcoin', { state: { mintUrl: activeMint } });
              }
            },
            {
              label: 'Top Up',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                navigate('/top-up', { state: { mintUrl: activeMint } });
              }
            }
          ]}
        />
      )}

      {showSend && (
        <ActionMenuModal
          title="Send"
          onClose={() => setShowSend(false)}
          options={[
            {
              label: 'Printable Note',
              icon: <Banknote size={22} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => { navigate('/issue'); }
            },
            {
              label: 'Ecash',
              icon: <Coins size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/send-ecash', { state: { mintUrl: activeMint } });
              }
            },
            {
              label: 'Bitcoin',
              icon: <Bitcoin size={25} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/send-bitcoin', { state: { mintUrl: activeMint } });
              }
            },
            {
              label: 'Cash Out',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                navigate('/cash-out', { state: { mintUrl: activeMint } });
              }
            }
          ]}
        />
      )}


    </section>
  );
};
