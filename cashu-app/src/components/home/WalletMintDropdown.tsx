import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { registerBottomSheetOpen, registerBottomSheetClose } from '../../hooks/useBottomSheet';

export interface WalletMintDropdownProps {
  activeMint: string | null;
  mintUrls: string[];
  mintBalances?: Record<string, number>;
  hideBalance: boolean;
  open: boolean;
  closing: boolean;
  onOpenChange: (open: boolean, closing?: boolean) => void;
  onSelectMint: (mint: string) => void;
}

export const WalletMintDropdown: React.FC<WalletMintDropdownProps> = ({
  activeMint,
  mintUrls,
  mintBalances,
  hideBalance,
  open,
  closing,
  onOpenChange,
  onSelectMint,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    maxHeight: 300,
    triggerTop: 0,
    triggerLeft: 0,
    triggerWidth: 0,
  });

  const closeDropdown = () => {
    onOpenChange(true, true);
    setTimeout(() => {
      onOpenChange(false, false);
    }, 160);
  };

  const positionMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(256, window.innerWidth - 48);
    const top = Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - 156));
    setMenuPosition({
      top,
      triggerTop: rect.top,
      triggerLeft: rect.left,
      triggerWidth: rect.width,
      left: Math.max(24, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 24)),
      maxHeight: Math.min(300, window.innerHeight - top - 12),
    });
  };

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [open]);

  useEffect(() => {
    if (open) {
      registerBottomSheetOpen();
      return () => {
        registerBottomSheetClose();
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const toggle = () => {
    if (open) {
      closeDropdown();
    } else {
      positionMenu();
      onOpenChange(true, false);
    }
  };

  const renderTrigger = (floating = false) => (
    <button
      ref={floating ? undefined : triggerRef}
      style={
        floating
          ? {
              position: 'fixed',
              top: menuPosition.triggerTop,
              left: menuPosition.triggerLeft,
              width: menuPosition.triggerWidth,
              zIndex: 10,
              pointerEvents: 'auto',
            }
          : open
            ? { visibility: 'hidden' }
            : undefined
      }
      aria-expanded={open && !closing}
      aria-controls="wallet-mint-selector"
      onClick={toggle}
      className={`flex items-center gap-2 bg-[#12261d] hover:bg-[#162f24] px-3 sm:px-3.5 py-1.5 rounded-full transition-all mb-3 border shadow-sm active:scale-95 max-w-[calc(100vw-64px)] sm:max-w-none cursor-pointer ${
        open && !closing
          ? 'border-primary/50 shadow-[0_0_16px_rgba(242,169,59,0.2)] bg-[#163024]'
          : 'border-[#1e3c2e]'
      }`}
    >
      {activeMint ? (
        <>
          <MintIcon
            mintUrl={activeMint}
            className="w-5 h-5 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0"
            textClassName="text-primary text-[9px] font-bold"
          />
          <MintName
            mintUrl={activeMint}
            className="font-mono text-[10px] sm:text-[11px] font-bold text-[#8b9e94] tracking-wider uppercase truncate max-w-[120px] sm:max-w-[150px]"
          />
        </>
      ) : (
        <span className="font-mono text-[10px] sm:text-[11px] font-bold text-primary px-1 tracking-wider uppercase">
          ALL MINTS
        </span>
      )}
      <ChevronDown
        size={14}
        className={`flex-shrink-0 transition-transform duration-300 ease-out ${
          open && !closing ? 'rotate-180 text-primary' : 'text-[#8b9e94]'
        }`}
      />
    </button>
  );

  return (
    <div className="relative z-30 flex flex-col items-center max-w-full">
      {renderTrigger()}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] pointer-events-none">
            {renderTrigger(true)}
            <div
              className={`absolute inset-0 pointer-events-auto cursor-pointer ${
                closing ? 'animate-mint-backdrop-out' : 'animate-mint-backdrop-in'
              }`}
              onClick={closeDropdown}
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
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <div
                className={`w-64 max-w-[calc(100vw-48px)] bg-[#0c1b14]/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] border border-[#1e422f] overflow-hidden flex flex-col max-h-[300px] overflow-y-auto overscroll-contain touch-pan-y ${
                  closing ? 'animate-dropdown-collapse' : 'animate-dropdown-expand'
                }`}
                style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', maxHeight: menuPosition.maxHeight }}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
                {mintUrls.map((mint, index) => (
                  <button
                    key={mint}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      onSelectMint(mint);
                      closeDropdown();
                    }}
                    className="flex items-center justify-between p-3 sm:p-3.5 hover:bg-[#12261d] transition-colors text-left border-b border-[rgba(247,244,235,0.04)] last:border-b-0 animate-dropdown-item cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <MintIcon
                        mintUrl={mint}
                        className="w-6 h-6 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0"
                        textClassName="text-primary text-[10px] font-bold"
                      />
                      <MintName mintUrl={mint} className="text-body-sm font-body-sm text-on-surface truncate" />
                      {activeMint === mint && <Check size={14} className="text-primary flex-shrink-0" />}
                    </div>
                    <span className="font-mono text-body-sm font-semibold text-primary flex-shrink-0">
                      {hideBalance ? '••••••' : `₿${(mintBalances?.[mint] || 0).toLocaleString()}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
