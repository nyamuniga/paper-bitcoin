import React from 'react';
import { Loader2 } from 'lucide-react';
import { PrimaryActionButton } from '../../components/shared/PrimaryActionButton';

export interface TransferReviewProps {
  toDollars: boolean;
  isReturn: boolean;
  protectedReview: boolean;
  debit: string;
  maxDebitLabel?: string;
  feeText: string;
  liveRate: string | null;
  statusHint: string | null;
  refreshErrorDetails: string | null;
  guidanceText: string;
  aboutText: string | null;
  busy: boolean;
  refreshing: boolean;
  expired: boolean;
  hasRefreshError: boolean;
  reviewRetrySeconds: number;
  confirmationActionLabel: string;
  onConfirm: () => void;
  onRetryQuote: () => void;
  onEdit: () => void;
}

export const TransferReview: React.FC<TransferReviewProps> = ({
  toDollars,
  isReturn,
  protectedReview,
  debit,
  maxDebitLabel,
  feeText,
  liveRate,
  statusHint,
  refreshErrorDetails,
  guidanceText,
  aboutText,
  busy,
  refreshing,
  expired,
  hasRefreshError,
  reviewRetrySeconds,
  confirmationActionLabel,
  onConfirm,
  onRetryQuote,
  onEdit,
}) => (
  <>
    <dl className="transfer-summary">
      {!isReturn && (
        <>
          <div>
            <dt>From</dt>
            <dd>{toDollars ? 'Bitcoin' : 'Dollar'} balance</dd>
          </div>
          <div>
            <dt>{protectedReview ? 'Maximum you pay' : toDollars ? 'You pay up to' : 'Estimated total'}</dt>
            <dd>{debit}</dd>
          </div>
        </>
      )}
      {maxDebitLabel && (
        <div>
          <dt>Maximum you pay</dt>
          <dd>{maxDebitLabel}</dd>
        </div>
      )}
      <div>
        <dt>Fees</dt>
        <dd>{feeText}</dd>
      </div>
      {!isReturn && liveRate && (
        <div>
          <dt>Rate</dt>
          <dd>1 BTC ≈ {liveRate}</dd>
        </div>
      )}
    </dl>
    {statusHint && (
      <p className="transfer-hint" role="status">
        {statusHint}
      </p>
    )}
    {refreshErrorDetails && (
      <details className="transfer-details">
        <summary>Connection details</summary>
        <p>{refreshErrorDetails}</p>
      </details>
    )}
    <p className="transfer-hint">{guidanceText}</p>
    {aboutText && (
      <details className="transfer-details">
        <summary>About this transfer</summary>
        <p>{aboutText}</p>
      </details>
    )}
    <div className="transfer-actions">
      <PrimaryActionButton
        type="button"
        className="transfer-primary"
        aria-label={confirmationActionLabel}
        loading={busy || refreshing}
        disabled={expired || (!isReturn && hasRefreshError)}
        onClick={onConfirm}
      >
        {(busy || refreshing) && <Loader2 className="animate-spin" size={19} />}
        {confirmationActionLabel}
      </PrimaryActionButton>
      {!isReturn && (hasRefreshError || expired) && (
        <button
          className="transfer-secondary"
          disabled={busy || refreshing || reviewRetrySeconds > 0}
          onClick={protectedReview ? onEdit : onRetryQuote}
        >
          {reviewRetrySeconds > 0
            ? `Try again in ${reviewRetrySeconds}s`
            : protectedReview
              ? 'Edit and get new quote'
              : 'Update quote'}
        </button>
      )}
      {!(protectedReview && expired) && (
        <button className="transfer-secondary" disabled={busy || refreshing} onClick={onEdit}>
          {isReturn ? 'Back to transfer' : 'Edit amount'}
        </button>
      )}
    </div>
  </>
);
