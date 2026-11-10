import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { MintIcon } from './MintIcon';
import { MintName } from './MintName';

export function MintBalancePicker({ mintUrl, balances, onSelect, disabled = false }: {
  mintUrl: string; balances: Record<string, number>; onSelect: (mint: string) => void; disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility:'hidden' });
  const close = () => { setOpen(false); trigger.current?.focus(); };
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
        maxHeight:Math.max(0, Math.min(280, upwards ? above : below)), zIndex:111 });
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    update();
    menu.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} aria-label="Choose mint"
      onClick={() => setOpen(!open)} className="w-full min-h-11 flex items-center justify-between gap-2 bg-surface-container-highest p-2.5 rounded-xl border border-outline-variant/10 hover:bg-surface-bright cursor-pointer disabled:opacity-40">
      <span className="flex items-center gap-2 min-w-0">
        <MintIcon mintUrl={mintUrl} className="w-6 h-6 rounded-full shrink-0" textClassName="text-primary text-[10px]" />
        <MintName mintUrl={mintUrl} className="text-sm text-on-surface truncate" />
      </span>
      <span className="flex items-center gap-2 shrink-0 text-sm text-on-surface font-semibold">₿{(balances[mintUrl] ?? 0).toLocaleString()}<ChevronDown size={16} className={open ? 'rotate-180 text-primary' : 'text-on-surface-variant'} /></span>
    </button>
    {open && createPortal(<>
      <div className="fixed inset-0 z-[110]" onClick={close} />
      <div ref={menu} style={position} aria-label="Available mints" className="overflow-y-auto overscroll-contain bg-surface-container-highest border border-outline-variant/20 rounded-2xl shadow-xl">
        {Object.keys(balances).map(mint => <button key={mint} type="button" aria-current={mint === mintUrl}
          onClick={() => { onSelect(mint); close(); }} className="w-full min-h-11 flex items-center justify-between gap-3 p-3 hover:bg-surface-bright text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex items-center gap-2 min-w-0"><MintIcon mintUrl={mint} className="w-6 h-6 shrink-0 rounded-full" textClassName="text-primary text-[10px]" /><MintName mintUrl={mint} className="text-sm text-on-surface truncate" />{mint === mintUrl && <Check size={14} className="text-primary shrink-0" />}</span>
          <span className="text-sm text-on-surface shrink-0">₿{balances[mint].toLocaleString()}</span>
        </button>)}
      </div>
    </>, document.body)}
  </>;
}
