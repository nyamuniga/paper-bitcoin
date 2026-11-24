import React, { useState, useEffect, useRef, useId } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { QrCode, ArrowDownLeft, ArrowUpRight, Coins, Bitcoin, Banknote, Phone, Eye, EyeOff } from 'lucide-react';
import { ActionMenuModal } from './ActionMenuModal';
import { WalletMintDropdown } from './WalletMintDropdown';
import { useWalletStore } from '../../store/wallet';
import { useStableBalance } from '../../hooks/useStableBalance';
import { useAnimatedFiatBalance } from '../../hooks/useAnimatedFiatBalance';
import { dollarAmount, dollarFiatValue } from '../../services/transferAmount';
import { balanceTabAfterSwipe, isHorizontalSwipe } from '../../utils/balanceCardGesture';
import type { BalanceTab } from '../../utils/balanceCardGesture';
import { Skeleton } from '../shared/Skeleton';
import { SlidingSegmentedControl } from '../shared/SlidingSegmentedControl';

const balanceSymbolClass = 'text-[#f2a93b] text-[34px] sm:text-[42px] md:text-[48px] font-extrabold leading-none select-none flex-shrink-0';

interface HomeRouteState {
  ecashRequest?: string;
  ecashToken?: string;
  lnbcInvoice?: string;
  onchainAmountSats?: number;
}

interface WalletBalanceCardProps {
  balance: number;
  mintBalances?: Record<string, number>;
  isLoading?: boolean;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance, mintBalances, isLoading = false }) => {
  const stable = useStableBalance();
  const balanceTab = useWalletStore((s) => s.balanceView);
  const setBalanceTab = useWalletStore((s) => s.setBalanceView);
  const balanceTabsId = useId();
  const balanceCardRef = useRef<HTMLDivElement>(null);
  const wheelSwipe = useRef({ delta: 0, last: 0, switched: false });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressSwipeClick = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showMintDropdown, setShowMintDropdown] = useState(false);
  const [isClosingDropdown, setIsClosingDropdown] = useState(false);

  const selectBalanceTab = (tab: BalanceTab) => {
    setBalanceTab(tab);
    setShowMintDropdown(false);
    setIsClosingDropdown(false);
  };

  const startBalanceSwipe = (x: number, y: number, target: EventTarget | null) => {
    suppressSwipeClick.current = 0;
    swipeStart.current =
      !showMintDropdown && target instanceof Element && !target.closest('button, a, input, [data-modal]') ? { x, y } : null;
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
        gesture.delta = 0;
        gesture.switched = false;
      }
      gesture.last = now;
      gesture.delta += delta;
      if (!gesture.switched && Math.abs(gesture.delta) >= 48) {
        const next = balanceTabAfterSwipe(balanceTab, -gesture.delta, 0);
        if (next !== balanceTab) selectBalanceTab(next);
        gesture.switched = true;
      }
    };
    card.addEventListener('wheel', onWheel, { passive: false });
    return () => card.removeEventListener('wheel', onWheel);
  }, [balanceTab, showMintDropdown]);

  const mintUrls = Object.keys(mintBalances || {});
  const [selectedMint, setSelectedMint] = useState<string | null>(() => localStorage.getItem('preferred_mint_url'));
  const activeMint = selectedMint && mintUrls.includes(selectedMint) ? selectedMint : mintUrls.length > 0 ? mintUrls[0] : null;

  const {
    preferredCurrency,
    rates,
    currentMeta,
    isInitialLoadingRate,
    targetFiatValue,
    displayedFiatValue,
    isNumberAnimating,
    formatFiatValue,
  } = useAnimatedFiatBalance(balance);

  const dollarEquivalent = stable.balance === null ? null : dollarFiatValue(stable.balance, preferredCurrency, rates);
  const dollarBalanceLoading = stable.balance === null || Boolean(stable.error);
  const dollarRateLoading = isInitialLoadingRate || dollarBalanceLoading || dollarEquivalent === null;
  const bitcoinRateLoading = isInitialLoadingRate && preferredCurrency !== 'BTC';

  const [hideBalance, setHideBalance] = useState<boolean>(() => localStorage.getItem('hide_balance') === 'true');
  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      localStorage.setItem('hide_balance', String(next));
      return next;
    });
  };

  const dollarEquivalentDisplay =
    preferredCurrency === 'USD' && stable.balance !== null
      ? `${dollarAmount(stable.balance)} USD`
      : dollarEquivalent !== null
        ? formatFiatValue(dollarEquivalent)
        : null;

  useEffect(() => {
    if (new URLSearchParams(location.search).has('convert')) {
      navigate('/convert', { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const state = location.state as HomeRouteState;
      if (state.ecashRequest) {
        navigate('/send-ecash', { replace: true, state: { mintUrl: activeMint, ecashRequest: state.ecashRequest } });
      } else if (state.ecashToken) {
        navigate('/receive-ecash', { replace: true, state: { mintUrl: activeMint, ecashToken: state.ecashToken } });
      } else if (state.lnbcInvoice) {
        navigate('/send-bitcoin', {
          replace: true,
          state: { mintUrl: activeMint, invoice: state.lnbcInvoice, amountSats: state.onchainAmountSats },
        });
      }
    }
  }, [location, navigate, activeMint]);

  return (
    <section className={`flex flex-col gap-4 md:gap-5 relative ${showMintDropdown ? 'z-30' : 'z-10'}`}>
      <div
        data-wallet-balance-card
        ref={balanceCardRef}
        className="relative p-5 sm:p-6 md:p-8 flex flex-col items-center justify-center gap-4 min-h-[220px] sm:min-h-[235px] md:min-h-[260px] z-10 bg-[#0c1b14] rounded-[24px] sm:rounded-[28px] border border-[#142d20] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        style={{ touchAction: 'pan-y pinch-zoom' }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (event.touches.length === 1 && touch) startBalanceSwipe(touch.clientX, touch.clientY, event.target);
          else swipeStart.current = null;
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) swipeStart.current = null;
        }}
        onTouchEnd={(event) => {
          const touch = event.changedTouches[0];
          if (touch) endBalanceSwipe(touch.clientX, touch.clientY);
        }}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch' && event.button === 0) startBalanceSwipe(event.clientX, event.clientY, event.target);
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch' && event.buttons === 0) {
            swipeStart.current = null;
            return;
          }
          const start = swipeStart.current;
          if (
            event.pointerType !== 'touch' &&
            start &&
            isHorizontalSwipe(event.clientX - start.x, event.clientY - start.y, 12) &&
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== 'touch') endBalanceSwipe(event.clientX, event.clientY);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch' && !event.currentTarget.hasPointerCapture(event.pointerId)) swipeStart.current = null;
        }}
        onClickCapture={(event) => {
          if (performance.now() < suppressSwipeClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressSwipeClick.current = 0;
          }
        }}
      >
        <SlidingSegmentedControl<BalanceTab>
          compact
          tabListId={balanceTabsId}
          ariaLabel="Wallet balance currency"
          options={[
            { id: 'btc', label: 'BTC' },
            { id: 'usd', label: 'USD' },
          ]}
          value={balanceTab}
          onChange={selectBalanceTab}
        />

        <div
          role="tabpanel"
          id={`${balanceTabsId}-btc-panel`}
          aria-labelledby={`${balanceTabsId}-btc`}
          hidden={balanceTab !== 'btc'}
          className={`wallet-balance-panel w-full min-h-[132px] flex-col items-center justify-center ${
            balanceTab === 'btc' ? 'flex animate-tab-from-left' : 'hidden'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-2 w-full select-none">
              <Skeleton className="h-7 w-32 sm:w-36 rounded-full mb-3.5 sm:mb-4 opacity-80" />
              <div className="flex items-center justify-center my-1 sm:my-2">
                <Skeleton className="h-10 sm:h-12 md:h-14 w-44 sm:w-56 md:w-64 rounded-2xl" />
              </div>
              <Skeleton className="h-3.5 sm:h-4 w-20 sm:w-24 rounded-md mt-1.5 opacity-60" />
            </div>
          ) : (
            <>
              <WalletMintDropdown
                activeMint={activeMint}
                mintUrls={mintUrls}
                mintBalances={mintBalances}
                hideBalance={hideBalance}
                open={showMintDropdown}
                closing={isClosingDropdown}
                onOpenChange={(open, closing = false) => {
                  setShowMintDropdown(open);
                  setIsClosingDropdown(closing);
                }}
                onSelectMint={(mint) => {
                  setSelectedMint(mint);
                  localStorage.setItem('preferred_mint_url', mint);
                  invoke<void>('set_app_default_mint', { mintUrl: mint }).catch(console.error);
                }}
              />

              <div
                className={`relative z-10 flex flex-col items-center gap-1.5 max-w-full transition-all duration-200 ${
                  showMintDropdown && !isClosingDropdown ? 'opacity-25 filter blur-[1px]' : 'opacity-100'
                }`}
              >
                <div className="flex items-center justify-center gap-2 sm:gap-2.5 max-w-full">
                  <span data-balance-symbol="btc" className={balanceSymbolClass} aria-hidden="true">
                    ₿
                  </span>
                  <span
                    data-balance-amount="btc"
                    role="button"
                    tabIndex={0}
                    onClick={toggleHideBalance}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleHideBalance();
                      }
                    }}
                    className="text-[#f7f4eb] text-[40px] sm:text-[50px] md:text-[58px] leading-none font-display-hero font-extrabold tracking-tight cursor-pointer select-none truncate"
                    title={hideBalance ? 'Click to show balance' : 'Click to hide balance'}
                  >
                    {hideBalance ? '••••••' : balance.toLocaleString()}
                  </span>
                  <button
                    onClick={toggleHideBalance}
                    className="text-[#627d70] hover:text-[#f7f4eb] p-1.5 sm:p-2 rounded-full hover:bg-[#12261d] transition-all active:scale-95 cursor-pointer ml-0.5 sm:ml-1 flex-shrink-0"
                    title={hideBalance ? 'Show balance' : 'Hide balance'}
                    aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
                  >
                    {hideBalance ? (
                      <EyeOff size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" />
                    ) : (
                      <Eye size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" />
                    )}
                  </button>
                </div>
                {(displayedFiatValue !== null || targetFiatValue > 0 || bitcoinRateLoading || preferredCurrency === 'BTC') && (
                  <span
                    className={`text-[13px] sm:text-[14px] font-medium mt-0.5 tracking-tight select-none truncate max-w-full transition-all duration-300 animate-rwf-in ${
                      bitcoinRateLoading
                        ? 'animate-rwf-shimmer'
                        : isNumberAnimating
                          ? 'animate-rwf-updating font-semibold'
                          : 'text-[#6f887b]'
                    }`}
                    title={bitcoinRateLoading ? 'Refreshing estimated rate...' : undefined}
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

        <div
          role="tabpanel"
          id={`${balanceTabsId}-usd-panel`}
          aria-labelledby={`${balanceTabsId}-usd`}
          hidden={balanceTab !== 'usd'}
          className={`wallet-balance-panel w-full min-h-[132px] flex-col items-center justify-center ${
            balanceTab === 'usd' ? 'flex animate-tab-from-right' : 'hidden'
          }`}
        >
          <p className="text-[#a3b5aa] text-xs font-medium h-[34px] shrink-0 mb-3 flex items-center">Dollar balance</p>
          <div className="relative z-10 flex flex-col items-center gap-1.5 max-w-full">
            <div className="flex items-center justify-center gap-2 sm:gap-2.5 max-w-full">
              <span data-balance-symbol="usd" className={balanceSymbolClass} aria-hidden="true">
                $
              </span>
              <span
                data-balance-amount="usd"
                role="button"
                tabIndex={0}
                onClick={toggleHideBalance}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleHideBalance();
                  }
                }}
                title={hideBalance ? 'Click to show balance' : 'Click to hide balance'}
                className={`min-w-0 truncate font-display-hero font-extrabold tracking-tight leading-none select-none cursor-pointer text-[40px] sm:text-[50px] md:text-[58px] ${
                  !hideBalance && dollarBalanceLoading ? 'animate-rwf-shimmer' : 'text-[#f7f4eb]'
                }`}
                aria-busy={!hideBalance && dollarBalanceLoading}
              >
                {hideBalance ? (
                  '••••••'
                ) : (
                  <>
                    {stable.balance === null ? <span aria-hidden="true">••••</span> : dollarAmount(stable.balance).replace('$', '')}
                    {dollarBalanceLoading && (
                      <span className="sr-only">
                        {stable.balance === null
                          ? 'Loading dollar balance'
                          : 'Refreshing dollar balance; showing last known amount'}
                      </span>
                    )}
                  </>
                )}
              </span>
              <button
                onClick={toggleHideBalance}
                className="text-[#627d70] hover:text-[#f7f4eb] p-1.5 sm:p-2 rounded-full hover:bg-[#12261d] transition-all active:scale-95 cursor-pointer ml-0.5 sm:ml-1 flex-shrink-0"
                title={hideBalance ? 'Show balance' : 'Hide balance'}
                aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
              >
                {hideBalance ? (
                  <EyeOff size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" />
                ) : (
                  <Eye size={20} className="sm:w-[22px] sm:h-[22px] stroke-[2.25]" />
                )}
              </button>
            </div>
            <span
              data-dollar-equivalent
              className={`text-[13px] sm:text-[14px] font-medium mt-0.5 tracking-tight select-none truncate max-w-full animate-rwf-in ${
                dollarRateLoading && !hideBalance ? 'animate-rwf-shimmer' : 'text-[#6f887b]'
              }`}
              aria-busy={!hideBalance && dollarRateLoading}
              title={dollarRateLoading ? 'Refreshing estimated rate…' : `Estimated value in ${currentMeta.code}`}
            >
              {hideBalance
                ? `≈ •••••• ${currentMeta.code}`
                : dollarEquivalentDisplay !== null
                  ? `≈ ${dollarEquivalentDisplay}`
                  : `≈ ••• ${currentMeta.code}`}
            </span>
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
              },
            },
            {
              label: 'Bitcoin',
              icon: <Bitcoin size={25} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/receive-bitcoin', { state: { mintUrl: activeMint } });
              },
            },
            {
              label: 'Top Up',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                navigate('/top-up', { state: { mintUrl: activeMint } });
              },
            },
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
              onClick: () => {
                navigate('/issue');
              },
            },
            {
              label: 'Ecash',
              icon: <Coins size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/send-ecash', { state: { mintUrl: activeMint } });
              },
            },
            {
              label: 'Bitcoin',
              icon: <Bitcoin size={25} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                navigate('/send-bitcoin', { state: { mintUrl: activeMint } });
              },
            },
            {
              label: 'Cash Out',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                navigate('/cash-out', { state: { mintUrl: activeMint } });
              },
            },
          ]}
        />
      )}
    </section>
  );
};
