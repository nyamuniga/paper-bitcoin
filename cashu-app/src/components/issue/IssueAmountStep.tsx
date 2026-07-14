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
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding py-6 flex flex-col">
      <PageHeader title="Issue Note" subtitle="Step 1 of 3" />

      {/* Amount display */}
      <AmountDisplay amount={sats} />

      {/* Number pad */}
      <NumberPad value={sats} onChange={setSats} />

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
