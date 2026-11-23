import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { MintIcon } from '../../components/shared/MintIcon';
import { MintName } from '../../components/shared/MintName';

export interface BitcoinSendReviewProps {
  page: boolean;
  mintUrl: string;
  destination: string;
  amountSats: number;
  networkFeeSats: number;
  mintFeeSats: number;
  totalSats: number;
  onBack: () => void;
  confirmation: ReactNode;
}

export interface BitcoinSendConfirmationProps {
  paying: boolean;
  onConfirm: () => void;
}

/** Review display; estimate ownership, execution and action placement stay with the parent. */
export function BitcoinSendReview({
  page, mintUrl, destination, amountSats, networkFeeSats, mintFeeSats, totalSats, onBack, confirmation,
}: BitcoinSendReviewProps) {
  return (
    <section className="bitcoin-review" aria-label="Review on-chain Bitcoin payment">
      {!page && <button type="button" onClick={onBack} className="text-primary text-sm self-start">Back to amount</button>}
      <div className="bitcoin-review-amount">
        <p className="text-sm text-on-surface-variant">Sending</p>
        <p className="bitcoin-review-value text-primary">₿{amountSats.toLocaleString()}</p>
      </div>
      <dl className="bitcoin-review-details">
        <div className="bitcoin-review-row">
          <dt>From</dt>
          <dd className="flex items-center gap-2 min-w-0">
            <MintIcon mintUrl={mintUrl} className="w-6 h-6 shrink-0 rounded-full" textClassName="text-primary text-[10px]" />
            <MintName mintUrl={mintUrl} className="truncate text-on-surface" />
          </dd>
        </div>
        <div className="bitcoin-review-destination">
          <dt>To</dt>
          <dd className="text-on-surface font-mono">{destination}</dd>
        </div>
        <div className="bitcoin-review-row"><dt>Network &amp; bridge fee</dt><dd>{networkFeeSats.toLocaleString()} sats</dd></div>
        <div className="bitcoin-review-row"><dt>Lightning &amp; mint fee</dt><dd>{mintFeeSats.toLocaleString()} sats</dd></div>
        <div className="bitcoin-review-row bitcoin-review-total"><dt>Total deducted</dt><dd>{totalSats.toLocaleString()} sats</dd></div>
      </dl>
      {!page && confirmation}
    </section>
  );
}

export function BitcoinSendConfirmation({ paying, onConfirm }: BitcoinSendConfirmationProps) {
  return (
    <button
      onClick={onConfirm}
      disabled={paying}
      className="bitcoin-primary w-full bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary py-4 rounded-2xl font-bold text-[16px] tracking-wide transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] shadow-lg cursor-pointer"
    >
      {paying ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Sending On-Chain...</span>
        </>
      ) : (
        <span>Confirm & Send</span>
      )}
    </button>
  );
}
