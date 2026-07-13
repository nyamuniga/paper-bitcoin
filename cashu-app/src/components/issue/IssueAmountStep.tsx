import React from 'react';
import { PageHeader } from '../shared/PageHeader';
import { Delete, ChevronRight } from 'lucide-react';

interface IssueAmountStepProps {
  sats: string;
  setSats: (sats: string) => void;
  onNext: () => void;
}

export const IssueAmountStep: React.FC<IssueAmountStepProps> = ({ sats, setSats, onNext }) => {
  const handleDigit = (digit: string) => {
    if (digit === '.' && sats.includes('.')) return;
    setSats(sats + digit);
  };

  const handleDelete = () => {
    setSats(sats.slice(0, -1));
  };

  const handleClear = () => {
    setSats('');
  };

  const amount = parseInt(sats) || 0;

  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding py-6 flex flex-col">
      <PageHeader title="Issue Note" subtitle="Step 1 of 3" />

      {/* Amount display */}
      <div className="flex-1 flex flex-col items-center justify-center py-6 md:py-10">
        <span className="text-label-caps font-label-caps text-on-surface-variant tracking-widest mb-3">AMOUNT</span>
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`font-display-lg text-on-surface tracking-tight transition-all duration-200 ${
            sats.length > 6 ? 'text-[40px] md:text-[52px]' : 'text-[56px] md:text-[72px]'
          } leading-none`}>
            {amount.toLocaleString() || '0'}
          </span>
        </div>
        <span className="text-label-caps font-label-caps text-on-surface-variant">sats</span>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            className="py-4 md:py-5 rounded-2xl bg-surface-container-high text-on-surface text-[22px] md:text-[24px] font-headline-lg-mobile hover:bg-surface-container-highest active:scale-95 transition-all duration-150 border border-outline-variant/10"
          >
            {digit}
          </button>
        ))}
        <button
          onClick={handleClear}
          className="py-4 md:py-5 rounded-2xl bg-surface-container text-on-surface-variant text-[14px] font-label-caps tracking-wider hover:bg-surface-container-high active:scale-95 transition-all duration-150 border border-outline-variant/10"
        >
          CLR
        </button>
        <button
          onClick={() => handleDigit('0')}
          className="py-4 md:py-5 rounded-2xl bg-surface-container-high text-on-surface text-[22px] md:text-[24px] font-headline-lg-mobile hover:bg-surface-container-highest active:scale-95 transition-all duration-150 border border-outline-variant/10"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="py-4 md:py-5 rounded-2xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all duration-150 flex items-center justify-center border border-outline-variant/10"
        >
          <Delete size={22} />
        </button>
      </div>

      {/* Next button */}
      <button
        onClick={onNext}
        disabled={amount <= 0}
        className="w-full btn-gradient text-on-primary font-bold py-4 rounded-full text-lg flex justify-center items-center gap-2 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
      >
        Next
        <ChevronRight size={20} />
      </button>
    </main>
  );
};
