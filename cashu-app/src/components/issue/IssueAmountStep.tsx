import React from 'react';
import { PageHeader } from '../shared/PageHeader';
import { ChevronRight } from 'lucide-react';

import { NumberPad } from '../shared/NumberPad';
import { AmountDisplay } from '../shared/AmountDisplay';
import './IssueAmountStep.css';

interface IssueAmountStepProps {
  sats: string;
  setSats: (sats: string) => void;
  onNext: () => void;
}

export const IssueAmountStep: React.FC<IssueAmountStepProps> = ({ sats, setSats, onNext }) => {
  const amount = parseInt(sats) || 0;

  return (
    <main className="issue-amount-screen flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding flex flex-col">
      <PageHeader title="Enter Amount" subtitle="Step 1 of 3" sticky={false} className="issue-amount-header" />

      <div className="issue-amount-content">
        {/* Amount display */}
        <div className={`issue-amount-display ${sats.length > 6 ? 'has-long-amount' : ''}`}>
          <AmountDisplay amount={sats} />
        </div>

        {/* Number pad */}
        <div className="issue-amount-keypad" role="group" aria-label="Amount keypad">
          <NumberPad value={sats} onChange={setSats} />
        </div>
      </div>

      <div className="issue-amount-actions">
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
