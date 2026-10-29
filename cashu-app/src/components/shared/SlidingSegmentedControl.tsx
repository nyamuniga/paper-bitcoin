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
}

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  buttonClassName = '',
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
      className={`flex items-center rounded-xl bg-[#0c1b14] p-1 border border-[#142d20] relative shadow-sm overflow-hidden select-none ${className}`}
    >
      {/* Animated Sliding Indicator Pill (matching TopNav and AddressBook) */}
      <div
        className={`absolute top-0 left-0 rounded-lg pointer-events-none bg-[#183626] border border-[#2b563e] shadow-sm ${
          isInitialMount
            ? ''
            : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
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
            onClick={() => onChange(opt.id)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-display-hero text-[13px] sm:text-[14px] font-bold transition-colors duration-200 select-none cursor-pointer ${
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
