import { MintName } from '../../components/shared/MintName';
import type { MomoReview as MomoReviewData } from '../../services/momoReview';

export interface MomoReviewProps {
  cashout: boolean;
  review: MomoReviewData;
  validation: string;
  error: string | null;
}

export function MomoReview(props: MomoReviewProps) {
  const { cashout, review } = props;

  return (
    <div className="momo-review-content">
      <div className="momo-review-amount">
        <p>{cashout ? 'Recipient receives' : 'You pay'}</p>
        <strong>
          {review.amount.toLocaleString()} <span>RWF</span>
        </strong>
      </div>
      <dl className="momo-review-details">
        <div>
          <dt>{cashout ? 'To phone' : 'From phone'}</dt>
          <dd>{review.phone}</dd>
        </div>
        <div>
          <dt>{cashout ? 'From mint' : 'To mint'}</dt>
          <dd className="min-w-0">
            <MintName mintUrl={review.mint} className="truncate block" />
          </dd>
        </div>
        {cashout && (
          <>
            <div>
              <dt>MoMo fee</dt>
              <dd>{review.fixedFee.toLocaleString()} RWF</dd>
            </div>
            <div>
              <dt>Routing reserve</dt>
              <dd>{review.networkReserve.toLocaleString()} sats</dd>
            </div>
          </>
        )}
        <div className="momo-review-total">
          <dt>{cashout ? 'Estimated wallet debit' : 'Estimated wallet credit'}</dt>
          <dd>₿{review.sats.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="momo-review-note">
        {cashout
          ? 'Your recipient receives the RWF amount above. The wallet estimate includes fees and the routing reserve.'
          : 'Confirming sends a payment prompt to this phone.'}
      </p>
      {(props.validation || props.error) && (
        <p role="alert" className="text-error text-sm">
          {props.validation || props.error}
        </p>
      )}
    </div>
  );
}
