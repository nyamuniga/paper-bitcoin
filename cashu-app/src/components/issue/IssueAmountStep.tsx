import React from 'react';
import { PageHeader } from '../shared/PageHeader';
import { ChevronRight } from 'lucide-react';

import { NumberPad } from '../shared/NumberPad';
import { AmountDisplay } from '../shared/AmountDisplay';

interface IssueAmountStepProps {
  sats: string;
  setSats: (sats: string) => void;
  onNext: () => void;
}

export const IssueAmountStep: React.FC<IssueAmountStepProps> = ({ sats, setSats, onNext }) => {
  const amount = parseInt(sats) || 0;

  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding pt-6 pb-0 -mb-8 flex flex-col">
      <PageHeader title="Enter Amount" subtitle="Step 1 of 3" />

      <div className="flex-1 flex flex-col justify-center pb-6">
        {/* Amount display */}
        <AmountDisplay amount={sats} />

        {/* Number pad */}
        <NumberPad value={sats} onChange={setSats} />
      </div>

      {/* Sticky Bottom Navigation */}
      <div className="sticky bottom-0 z-30 mt-auto bg-[#06110c]/95 backdrop-blur-md -mx-container-padding px-container-padding md:-mx-10 md:px-10 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[rgba(247,244,235,0.08)] shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <button
          onClick={onNext}
          disabled={amount <= 0}
          className="w-full btn-gradient text-[#06110c] font-extrabold py-3.5 sm:py-4 rounded-2xl text-[15px] sm:text-[16px] flex justify-center items-center gap-2 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer"
        >
          Next
          <ChevronRight size={18} />
        </button>
      </div>
    </main>
  );
};
