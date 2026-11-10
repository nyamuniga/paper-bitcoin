import { BookUser } from 'lucide-react';
import { MintBalancePicker } from '../shared/MintBalancePicker';
import { MintName } from '../shared/MintName';
import { NumberPad } from '../shared/NumberPad';
import type { MomoReview } from '../../services/momoReview';
import type { TransactionDetails } from '../../types/momo';

interface Props {
  cashout: boolean; amount: string; phone: string; mint: string; balances: Record<string, number>;
  onAmount: (value: string) => void; onPhone: (value: string) => void; onMint: (mint: string) => void;
  onAddressBook: () => void; valid: boolean; validation: string; loadingRate: boolean;
  review: MomoReview | null; submitting: boolean; error: string | null; maxAmount: number;
  onReview: () => void; onConfirm: () => void;
  rateUnavailable: boolean; onRefreshRate: () => void;
  saved: TransactionDetails[]; onResume: (id: string) => void;
}

export function MomoPaymentForm(props: Props) {
  const { cashout, review, submitting } = props;
  return <div className={`momo-payment-form ${review ? 'is-review' : ''}`}>
    {review ? <div className="momo-review-content">
      <div className="momo-review-amount"><p>{cashout ? 'Recipient receives' : 'You pay'}</p><strong>{review.amount.toLocaleString()} <span>RWF</span></strong></div>
      <dl className="momo-review-details">
        <div><dt>{cashout ? 'To phone' : 'From phone'}</dt><dd>{review.phone}</dd></div>
        <div><dt>{cashout ? 'From mint' : 'To mint'}</dt><dd className="min-w-0"><MintName mintUrl={review.mint} className="truncate block" /></dd></div>
        {cashout && <>
          <div><dt>MoMo fee</dt><dd>{review.fixedFee.toLocaleString()} RWF</dd></div>
          <div><dt>Routing reserve</dt><dd>{review.networkReserve.toLocaleString()} sats</dd></div>
        </>}
        <div className="momo-review-total"><dt>{cashout ? 'Estimated wallet debit' : 'Estimated wallet credit'}</dt><dd>₿{review.sats.toLocaleString()}</dd></div>
      </dl>
      <p className="momo-review-note">{cashout ? 'Your recipient receives the RWF amount above. The wallet estimate includes fees and the routing reserve.' : 'Confirming sends a payment prompt to this phone.'}</p>
      {(props.validation || props.error) && <p role="alert" className="text-error text-sm">{props.validation || props.error}</p>}
    </div> : <>
      <div className="momo-entry-fields">
        <MintBalancePicker mintUrl={props.mint} balances={props.balances} onSelect={props.onMint} />
        <div className="momo-phone-field">
          <label htmlFor="momo-page-phone">{cashout ? 'Recipient phone number' : 'Phone number'}</label>
          <div className="flex items-center gap-2">
            <input id="momo-page-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="078 or 079…" value={props.phone}
              onChange={event => props.onPhone(event.target.value.replace(/\D/g, '').slice(0,10))}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
            <button type="button" onClick={props.onAddressBook} aria-label="Choose phone number from address book" className="momo-address-book"><BookUser size={20} /></button>
          </div>
        </div>
      </div>
      <div className="momo-page-amount">
        <p className="text-label-sm font-label-caps text-on-surface-variant tracking-widest mb-1">AMOUNT</p><output aria-label="Amount in RWF">{Number(props.amount || 0).toLocaleString()} <span className="momo-amount-unit">RWF</span></output>
        {cashout && props.maxAmount >= 100 && <button type="button" onClick={() => props.onAmount(String(props.maxAmount))}>Max {props.maxAmount.toLocaleString()} RWF</button>}
      </div>
      <div className="momo-entry-feedback" aria-live="polite">{props.validation || props.error}
        {props.rateUnavailable && <button type="button" onClick={props.onRefreshRate} className="text-primary underline">Exchange rate unavailable. Retry</button>}
      </div>
      <div className="momo-page-keypad" role="group" aria-label="Amount keypad"><NumberPad compact value={props.amount} onChange={value => { if (value.length <= 6) props.onAmount(value); }} /></div>
    </>}
    <div className="momo-page-actions">
      <button type="button" disabled={submitting || !props.valid} onClick={review ? props.onConfirm : props.onReview} className="momo-primary">
        {submitting ? 'Confirming…' : props.loadingRate ? 'Loading rate…' : review ? cashout ? 'Confirm cashout' : 'Confirm top-up' : cashout ? 'Review cashout' : 'Review top-up'}
      </button>
      {!review && props.saved.length > 0 && <details className="momo-saved-transfers">
        <summary>Saved transfers ({props.saved.length})</summary>
        <div>{props.saved.map(tx => <button type="button" key={tx.id} onClick={() => props.onResume(tx.id)}><span>{tx.direction === 'RWF_TO_SATS' ? 'Top-up' : 'Cashout'} · {tx.rwfAmount.toLocaleString()} RWF</span><span>View</span></button>)}</div>
      </details>}
    </div>
  </div>;
}
