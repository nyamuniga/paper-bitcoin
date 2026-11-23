import { MomoEntryForm, type MomoEntryFormProps } from './MomoEntryForm';
import { MomoReview } from './MomoReview';
import { MomoSavedTransfers } from './MomoSavedTransfers';
import { PrimaryActionButton } from '../../components/shared/PrimaryActionButton';
import type { MomoReview as MomoReviewData } from '../../services/momoReview';
import type { TransactionDetails } from '../../types/momo';

interface Props extends MomoEntryFormProps {
  valid: boolean;
  loadingRate: boolean;
  review: MomoReviewData | null;
  submitting: boolean;
  onReview: () => void;
  onConfirm: () => void;
  saved: TransactionDetails[];
  onResume: (id: string) => void;
}

export function MomoPaymentForm(props: Props) {
  const { cashout, review, submitting } = props;

  let actionLabel: string;
  if (submitting) {
    actionLabel = 'Confirming…';
  } else if (props.loadingRate) {
    actionLabel = 'Loading rate…';
  } else if (review) {
    actionLabel = cashout ? 'Confirm cashout' : 'Confirm top-up';
  } else {
    actionLabel = cashout ? 'Review cashout' : 'Review top-up';
  }

  return (
    <div className={`momo-payment-form ${review ? 'is-review' : ''}`}>
      {review ? (
        <MomoReview
          cashout={cashout}
          review={review}
          validation={props.validation}
          error={props.error}
        />
      ) : (
        <MomoEntryForm
          cashout={cashout}
          amount={props.amount}
          phone={props.phone}
          mint={props.mint}
          balances={props.balances}
          onAmount={props.onAmount}
          onPhone={props.onPhone}
          onMint={props.onMint}
          onAddressBook={props.onAddressBook}
          validation={props.validation}
          error={props.error}
          maxAmount={props.maxAmount}
          rateUnavailable={props.rateUnavailable}
          onRefreshRate={props.onRefreshRate}
        />
      )}
      <div className="momo-page-actions">
        <PrimaryActionButton
          type="button"
          loading={submitting}
          disabled={!props.valid}
          onClick={review ? props.onConfirm : props.onReview}
          className="momo-primary"
        >
          {actionLabel}
        </PrimaryActionButton>
        {!review && <MomoSavedTransfers saved={props.saved} onResume={props.onResume} />}
      </div>
    </div>
  );
}
