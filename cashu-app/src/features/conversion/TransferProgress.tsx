import React from 'react';
import { Loader2 } from 'lucide-react';
import { PrimaryActionButton } from '../../components/shared/PrimaryActionButton';

export interface TransferProgressProps {
  done: boolean;
  stageMessage: string;
  autoChecking: boolean;
  progressDetails: string;
  busy: boolean;
  checkingProgress: boolean;
  progressActionLabel: string;
  canReturnFunding: boolean;
  canRecover: boolean;
  onPrimaryProgress: () => void;
  onQuoteReturn: () => void;
  onRecover: () => void;
  onClose: () => void;
  onDone: () => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  done,
  stageMessage,
  autoChecking,
  progressDetails,
  busy,
  checkingProgress,
  progressActionLabel,
  canReturnFunding,
  canRecover,
  onPrimaryProgress,
  onQuoteReturn,
  onRecover,
  onClose,
  onDone,
}) => {
  if (done) {
    return (
      <div className="transfer-actions">
        <PrimaryActionButton type="button" className="transfer-primary" onClick={onDone}>
          Back to wallet
        </PrimaryActionButton>
      </div>
    );
  }

  return (
    <>
      <p className="transfer-progress" role="status">
        {stageMessage}. {autoChecking ? 'We’ll check progress automatically. ' : ''}You can leave this screen and return later.
      </p>
      {progressDetails && (
        <details className="transfer-details">
          <summary>Transfer details</summary>
          <p>{progressDetails}</p>
        </details>
      )}
      <div className="transfer-actions">
        <PrimaryActionButton
          type="button"
          className="transfer-primary"
          aria-label={progressActionLabel}
          loading={busy || checkingProgress}
          onClick={onPrimaryProgress}
        >
          {(busy || checkingProgress) && <Loader2 className="animate-spin" size={19} />}
          {progressActionLabel}
        </PrimaryActionButton>
        {canReturnFunding && (
          <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={onQuoteReturn}>
            Return to Bitcoin balance
          </button>
        )}
        {canRecover && (
          <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={onRecover}>
            Recover transfer
          </button>
        )}
      </div>
      <button className="transfer-secondary" onClick={onClose}>
        Back to wallet
      </button>
    </>
  );
};
