import React from 'react';
import { Delete } from 'lucide-react';

interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
  allowDecimal?: boolean;
}

export const NumberPad: React.FC<NumberPadProps> = ({ value, onChange, compact = false, disabled = false, allowDecimal = false }) => {
  const handleDigit = (digit: string) => {
    if (digit === '.' && value.includes('.')) return;
    if (value === '0' && digit !== '.') {
      onChange(digit);
      return;
    }
    onChange(value + digit);
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  const btnClass = compact
    ? "py-2.5 md:py-3 rounded-xl bg-surface-container-high text-on-surface text-[18px] md:text-[20px] font-headline-lg-mobile hover:bg-surface-bright active:scale-95 transition-all duration-150 border border-outline-variant"
    : "py-4 md:py-5 rounded-2xl bg-surface-container-high text-on-surface text-[22px] md:text-[24px] font-headline-lg-mobile hover:bg-surface-bright active:scale-95 transition-all duration-150 border border-outline-variant";

  const clearBtnClass = compact
    ? "py-2.5 md:py-3 rounded-xl bg-surface-container text-on-surface-variant text-[12px] font-label-caps tracking-wider hover:bg-surface-container-high active:scale-95 transition-all duration-150 border border-outline-variant"
    : "py-4 md:py-5 rounded-2xl bg-surface-container text-on-surface-variant text-[14px] font-label-caps tracking-wider hover:bg-surface-container-high active:scale-95 transition-all duration-150 border border-outline-variant";

  const deleteBtnClass = compact
    ? "py-2.5 md:py-3 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all duration-150 flex items-center justify-center border border-outline-variant"
    : "py-4 md:py-5 rounded-2xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all duration-150 flex items-center justify-center border border-outline-variant";

  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-1.5 md:gap-2 mb-3' : 'gap-2 md:gap-3 mb-6'}`}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          onClick={() => handleDigit(digit)}
          className={btnClass}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={allowDecimal ? () => handleDigit('.') : handleClear}
        aria-label={allowDecimal ? 'Decimal point' : 'Clear amount'}
        className={clearBtnClass}
      >
        {allowDecimal ? '.' : 'CLR'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleDigit('0')}
        className={btnClass}
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={handleDelete}
        aria-label="Delete last digit"
        className={deleteBtnClass}
      >
        <Delete size={compact ? 18 : 22} />
      </button>
    </div>
  );
};
