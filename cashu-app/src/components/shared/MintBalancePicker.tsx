import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { MintIcon } from './MintIcon';
import { MintName } from './MintName';

interface MintBalancePickerProps {
  mintUrl: string;
  balances: Record<string, number>;
  onSelect: (mint: string) => void;
  disabled?: boolean;
}

const pickerClasses = {
  trigger: 'p-2.5 sm:p-3 transition-colors relative z-50',
  icon: 'w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30',
  iconText: 'text-primary text-[10px] font-bold',
  name: 'text-body-md font-body-md text-on-surface font-medium truncate',
  balance: 'text-body-md font-body-md font-semibold text-on-surface',
  menu: 'shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] flex flex-col max-h-[250px]',
  row: 'shrink-0 border-b border-outline-variant/10 last:border-b-0 transition-colors',
  rowIcon: 'w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0',
  rowName: 'text-body-sm font-body-sm text-on-surface truncate min-w-0',
  rowBalance: 'text-body-sm font-body-sm font-bold text-on-surface flex-shrink-0',
};

export function MintBalancePicker({ mintUrl, balances, onSelect, disabled = false }: MintBalancePickerProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility:'hidden' });
  const close = (immediately = false) => {
    if (!immediately && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setClosing(true);
    } else {
      setOpen(false);
      setClosing(false);
    }
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [closing]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 8;
      const upwards = above > below;
      setPosition({ position:'fixed', left:rect.left, width:rect.width,
        top:upwards ? 'auto' : rect.bottom + 8,
        bottom:upwards ? window.innerHeight - rect.top + 8 : 'auto',
        maxHeight:Math.max(0, Math.min(250, upwards ? above : below)), zIndex:111 });
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    update();
    // Position state must commit before focusing the initially hidden portal.
    const focusFrame = requestAnimationFrame(() => {
      menu.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true });
    });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const menuAnimation = closing ? 'animate-dropdown-collapse' : 'animate-dropdown-expand';
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} aria-label="Choose mint"
      onClick={() => { if (open) close(); else setOpen(true); }} className={`w-full flex items-center justify-between bg-surface-container-highest rounded-xl border border-outline-variant/10 hover:bg-surface-bright cursor-pointer disabled:opacity-40 ${pickerClasses.trigger}`}>
      <span className={`flex items-center gap-2 min-w-0 pr-4`}>
        <MintIcon mintUrl={mintUrl} className={pickerClasses.icon} textClassName={pickerClasses.iconText} />
        <MintName mintUrl={mintUrl} className={pickerClasses.name} />
      </span>
      <span className={`flex items-center gap-2 shrink-0 whitespace-nowrap`}><span className={pickerClasses.balance}>₿{(balances[mintUrl] ?? 0).toLocaleString()}</span><ChevronDown size={16} className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${open && !closing ? 'rotate-180 text-primary' : 'text-on-surface-variant'}`} /></span>
    </button>
    {open && createPortal(<>
      <div className="fixed inset-0 z-[110]" onClick={() => close()} />
      <div ref={menu} style={position} data-mint-picker-menu aria-label="Available mints" className={`overflow-y-auto overflow-x-hidden overscroll-contain bg-surface-container-highest border border-outline-variant/20 rounded-2xl ${pickerClasses.menu} ${menuAnimation}`}>
        {Object.keys(balances).map((mint, index) => <button key={mint} type="button" aria-current={mint === mintUrl}
          style={{ animationDelay: `${index * 30}ms` }}
          onClick={() => { if (!closing) { onSelect(mint); close(); } }} className={`w-full min-h-11 flex items-center justify-between p-3 hover:bg-surface-bright text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${pickerClasses.row} animate-dropdown-item`}>
          <span className={`flex items-center gap-2 min-w-0 flex-1 pr-2`}><MintIcon mintUrl={mint} className={pickerClasses.rowIcon} textClassName={pickerClasses.iconText} /><MintName mintUrl={mint} className={pickerClasses.rowName} />{mint === mintUrl && <Check size={14} className="text-primary shrink-0" />}</span>
          <span className={pickerClasses.rowBalance}>₿{balances[mint].toLocaleString()}</span>
        </button>)}
      </div>
    </>, document.body)}
  </>;
}
