import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Zap, Coins, Info, Plus } from 'lucide-react';
import { AddMintModal } from '../navigation/AddMintModal';
import { EcashModal } from './EcashModal';
import { BitcoinModal } from './BitcoinModal';

import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { MintInfoModal } from './MintInfoModal';

const REVEAL_WIDTH = 210;

interface SwipeableMintCardProps {
  mint: string;
  amt: number;
  isRevealed: boolean;
  onRevealChange: (revealed: boolean) => void;
  onSelectEcash: () => void;
  onSelectBitcoin: () => void;
  onSelectInfo: () => void;
  className?: string;
}

const SwipeableMintCard: React.FC<SwipeableMintCardProps> = ({
  mint,
  amt,
  isRevealed,
  onRevealChange,
  onSelectEcash,
  onSelectBitcoin,
  onSelectInfo,
  className = '',
}) => {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const startTimeRef = useRef(0);
  const directionLockRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const justSwipedRef = useRef(false);
  const isRevealedAtStartRef = useRef(false);

  const handleStart = (clientX: number, clientY: number) => {
    startXRef.current = clientX;
    startYRef.current = clientY;
    currentXRef.current = clientX;
    startTimeRef.current = Date.now();
    directionLockRef.current = 'none';
    isRevealedAtStartRef.current = isRevealed;
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (directionLockRef.current === 'vertical') return;

    const deltaX = clientX - startXRef.current;
    const deltaY = clientY - startYRef.current;

    if (directionLockRef.current === 'none') {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 7) return;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        directionLockRef.current = 'vertical';
        return;
      } else {
        directionLockRef.current = 'horizontal';
      }
    }

    if (directionLockRef.current === 'horizontal') {
      currentXRef.current = clientX;
      const baseOffset = isRevealedAtStartRef.current ? REVEAL_WIDTH : 0;
      let target = baseOffset + deltaX;

      // Elastic resistance when dragging beyond bounds
      if (target < 0) {
        target = target * 0.15;
      } else if (target > REVEAL_WIDTH) {
        target = REVEAL_WIDTH + (target - REVEAL_WIDTH) * 0.2;
      }

      setDragOffset(target);
      if (Math.abs(deltaX) > 6) {
        justSwipedRef.current = true;
      }
    }
  };

  const handleEnd = () => {
    if (directionLockRef.current === 'horizontal') {
      const deltaX = currentXRef.current - startXRef.current;
      const timeDelta = Math.max(Date.now() - startTimeRef.current, 1);
      const velocity = deltaX / timeDelta; // px/ms

      const startState = isRevealedAtStartRef.current;
      let shouldReveal = startState;

      if (!startState) {
        // Dragging from closed -> open if dragged > 60px or flicked right
        if (deltaX > 60 || (deltaX > 20 && velocity > 0.3)) {
          shouldReveal = true;
        } else {
          shouldReveal = false;
        }
      } else {
        // Dragging from open -> close if dragged left < -45px or flicked left
        if (deltaX < -45 || (deltaX < -15 && velocity < -0.3)) {
          shouldReveal = false;
        } else {
          shouldReveal = true;
        }
      }

      setDragOffset(null);
      directionLockRef.current = 'none';
      onRevealChange(shouldReveal);

      // Block click event trigger
      setTimeout(() => {
        justSwipedRef.current = false;
      }, 200);
    } else {
      setDragOffset(null);
      directionLockRef.current = 'none';
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchEnd = () => {
    handleEnd();
  };

  const onTouchCancel = () => {
    setDragOffset(null);
    directionLockRef.current = 'none';
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    handleStart(e.clientX, e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = () => {
      handleEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleClick = () => {
    if (justSwipedRef.current) return;
    onRevealChange(!isRevealed);
  };

  const isDragging = dragOffset !== null;
  const currentTranslateX = isDragging ? dragOffset : isRevealed ? REVEAL_WIDTH : 0;

  return (
    <div 
      data-mint-card="true"
      data-mint-url={mint}
      className={`relative rounded-2xl overflow-hidden bg-surface-container-low ${className}`}
    >
      {/* Background Action Buttons */}
      <div className="absolute inset-y-0 left-0 w-[210px] flex items-center justify-center gap-3 px-3">
        <button 
          onClick={(e) => { e.stopPropagation(); onSelectEcash(); }}
          className="flex flex-col items-center justify-center gap-1 transition-all duration-200 text-primary hover:text-primary/80 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Coins className="w-5 h-5" />
          <span className="text-[10px] font-label-caps uppercase tracking-wider">Ecash</span>
        </button>
        <div className="w-px h-8 bg-outline-variant"></div>
        <button 
          onClick={(e) => { e.stopPropagation(); onSelectBitcoin(); }}
          className="flex flex-col items-center justify-center gap-1 transition-all duration-200 text-primary hover:text-primary hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px] font-label-caps uppercase tracking-wider">Bitcoin</span>
        </button>
        <div className="w-px h-8 bg-outline-variant"></div>
        <button 
          onClick={(e) => { e.stopPropagation(); onSelectInfo(); }}
          className="flex flex-col items-center justify-center gap-1 transition-all duration-200 text-tertiary hover:text-tertiary/80 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Info className="w-5 h-5" />
          <span className="text-[10px] font-label-caps uppercase tracking-wider">Info</span>
        </button>
      </div>

      {/* Foreground Card */}
      <div 
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onMouseDown={onMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
        style={{
          transform: `translate3d(${currentTranslateX}px, 0, 0)`,
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'pan-y',
          willChange: isDragging ? 'transform' : 'auto',
        }}
        className="bg-surface-container-high rounded-2xl p-3.5 md:p-4 flex justify-between items-center border border-outline-variant relative z-10 group hover:bg-surface-container-highest transition-colors duration-200 cursor-pointer select-none"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        <div className="flex items-center gap-3 relative z-10 min-w-0 mr-4 pointer-events-none">
          <MintIcon mintUrl={mint} className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary/15 border border-primary/20 flex-shrink-0" textClassName="text-primary text-[12px] font-bold" />
          <div className="flex flex-col min-w-0">
            <MintName mintUrl={mint} className="text-body-md font-body-md text-on-surface truncate text-[14px]" />
            <p className="text-label-caps font-label-caps text-on-surface-variant text-[10px] truncate">{mint}</p>
          </div>
        </div>
        <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap pointer-events-none">
          <span className="text-body-md font-body-md font-bold text-white">₿{amt.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

interface TrustedMintsListProps {
  mintBalances: Record<string, number>;
  showAll?: boolean;
  topAction?: React.ReactNode;
  hideAddCard?: boolean;
}

export const TrustedMintsList: React.FC<TrustedMintsListProps> = ({ mintBalances, showAll = false, topAction, hideAddCard = false }) => {
  const sortedMints = Object.entries(mintBalances).sort((a, b) => b[1] - a[1]);
  const displayMints = showAll ? sortedMints : sortedMints.slice(0, 6);

  const [revealedMint, setRevealedMint] = useState<string | null>(null);
  const [ecashMint, setEcashMint] = useState<string | null>(null);
  const [bitcoinMint, setBitcoinMint] = useState<string | null>(null);
  const [infoMint, setInfoMint] = useState<string | null>(null);
  const [showAddMint, setShowAddMint] = useState(false);

  // Close revealed mint card when clicking outside
  useEffect(() => {
    if (!revealedMint) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const cardContainer = target?.closest('[data-mint-card]');
      if (cardContainer && cardContainer.getAttribute('data-mint-url') === revealedMint) {
        return;
      }
      setRevealedMint(null);
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleDocumentClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [revealedMint]);

  return (
    <section className="flex flex-col gap-4">
      {topAction}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-label-caps font-label-caps text-on-surface-variant tracking-widest">TRUSTED MINTS</h2>
          <div className="flex items-center gap-2">
            {!showAll && sortedMints.length > 0 && (
              <Link to="/mints" className="text-label-caps font-label-caps text-primary hover:opacity-80 transition-opacity flex items-center gap-1">
                VIEW ALL
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>
        <div className={showAll ? "grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden px-1 -mx-1 py-1 -my-1" : "flex flex-col gap-2 overflow-hidden px-1 -mx-1 py-1 -my-1"}>
        {!hideAddCard && (
          <div 
            onClick={() => setShowAddMint(true)}
            className={`bg-surface-container-lowest rounded-2xl p-3.5 md:p-4 flex items-center justify-center gap-3 border border-dashed border-primary/50 relative group hover:bg-surface-container-low hover:border-primary/80 transition-all duration-300 cursor-pointer ${showAll ? 'md:col-span-2' : ''}`}
          >
            <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 relative z-10 pointer-events-none group-hover:scale-105 transition-transform border border-primary/30">
              <Plus className="text-primary w-5 h-5" />
            </div>
            <span className="text-body-md font-body-md text-primary font-bold relative z-10 pointer-events-none tracking-wide">Add New Mint</span>
          </div>
        )}

        {sortedMints.length === 0 ? (
          <div className="text-center text-on-surface-variant py-6 bg-surface-container-high rounded-2xl border border-outline-variant text-body-md font-body-md">No mints connected yet</div>
        ) : (
          displayMints.map(([mint, amt], index) => {
            const isRevealed = revealedMint === mint;
            return (
              <SwipeableMintCard
                key={mint}
                mint={mint}
                amt={amt}
                isRevealed={isRevealed}
                onRevealChange={(revealed) => {
                  if (revealed) {
                    setRevealedMint(mint);
                  } else if (revealedMint === mint) {
                    setRevealedMint(null);
                  }
                }}
                onSelectEcash={() => {
                  setEcashMint(mint);
                  setRevealedMint(null);
                }}
                onSelectBitcoin={() => {
                  setBitcoinMint(mint);
                  setRevealedMint(null);
                }}
                onSelectInfo={() => {
                  setInfoMint(mint);
                  setRevealedMint(null);
                }}
                className={!showAll && index >= 3 ? 'hidden md:block' : 'block'}
              />
            );
          })
        )}
      </div>

      {ecashMint && (
        <EcashModal
          mintUrl={ecashMint}
          onClose={() => setEcashMint(null)}
        />
      )}

      {bitcoinMint && (
        <BitcoinModal
          mintUrl={bitcoinMint}
          onClose={() => setBitcoinMint(null)}
        />
      )}

      {infoMint && (
        <MintInfoModal
          mintUrl={infoMint}
          onClose={() => setInfoMint(null)}
        />
      )}

      {showAddMint && (
        <AddMintModal onClose={() => setShowAddMint(false)} />
      )}
      </div>
    </section>
  );
};

