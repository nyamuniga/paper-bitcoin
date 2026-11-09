import React, { useRef, useLayoutEffect, useEffect, useState } from 'react';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface SlidingSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  compact?: boolean;
  tabListId?: string;
  ariaLabel?: string;
}

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  buttonClassName = '',
  compact = false,
  tabListId,
  ariaLabel,
}: SlidingSegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const [isInitialMount, setIsInitialMount] = useState(true);

  const updatePill = () => {
    const el = buttonRefs.current[value];
    if (el && containerRef.current) {
      setPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    }
  };

  useLayoutEffect(() => {
    updatePill();
    const timer = setTimeout(() => setIsInitialMount(false), 50);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handleResize = () => updatePill();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value]);

  return (
    <div
      ref={containerRef}
      role={tabListId ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`flex items-center rounded-xl bg-[#0c1b14] border border-[#142d20] relative shadow-sm select-none ${compact ? 'p-0.5 overflow-visible' : 'p-1 overflow-hidden'} ${className}`}
    >
      {/* Animated Sliding Indicator Pill (matching TopNav and AddressBook) */}
      <div
        data-segment-indicator
        className={`absolute top-0 left-0 rounded-lg pointer-events-none bg-[#183626] border border-[#2b563e] shadow-sm ${
          isInitialMount
            ? ''
            : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
        }`}
        style={{
          transform: `translate3d(${pillStyle.left}px, ${pillStyle.top}px, 0)`,
          width: `${pillStyle.width}px`,
          height: `${pillStyle.height}px`,
          opacity: pillStyle.opacity,
        }}
      >
        {/* Botanical amber highlight along top border */}
        <div className="absolute inset-x-2 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f2a93b]/40 to-transparent rounded-full pointer-events-none" />
      </div>

      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              buttonRefs.current[opt.id] = el;
            }}
            type="button"
            role={tabListId ? 'tab' : undefined}
            id={tabListId ? `${tabListId}-${opt.id}` : undefined}
            aria-controls={tabListId ? `${tabListId}-${opt.id}-panel` : undefined}
            aria-selected={tabListId ? isActive : undefined}
            aria-pressed={!tabListId ? isActive : undefined}
            tabIndex={tabListId ? isActive ? 0 : -1 : undefined}
            onKeyDown={event => {
              if (!tabListId || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
              event.preventDefault();
              const index = options.findIndex(option => option.id === value);
              const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
              const next = options[nextIndex].id;
              onChange(next); buttonRefs.current[next]?.focus();
            }}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 rounded-lg font-display-hero font-bold transition-colors duration-200 select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${compact ? "py-1 min-w-14 text-xs after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2.5" : 'py-2 text-[13px] sm:text-[14px]'} ${
              isActive
                ? 'text-primary font-bold'
                : 'text-[#8b9e94] hover:text-[#f7f4eb]'
            } ${buttonClassName}`}
          >
            {opt.icon && (
              <span className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'text-[#8b9e94]'}`}>
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
