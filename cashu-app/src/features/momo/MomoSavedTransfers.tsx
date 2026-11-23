import type { TransactionDetails } from '../../types/momo';

export type MomoSavedTransfer = Readonly<Pick<TransactionDetails, 'id' | 'direction' | 'rwfAmount'>>;

export interface MomoSavedTransfersProps {
  saved: readonly MomoSavedTransfer[];
  onResume: (id: string) => void;
}

export function MomoSavedTransfers({ saved, onResume }: MomoSavedTransfersProps) {
  if (!saved.length) return null;

  return (
    <details className="momo-saved-transfers">
      <summary>Saved transfers ({saved.length})</summary>
      <div>
        {saved.map(tx => (
          <button
            type="button"
            key={tx.id}
            onClick={() => onResume(tx.id)}
          >
            <span>
              {tx.direction === 'RWF_TO_SATS' ? 'Top-up' : 'Cashout'} · {tx.rwfAmount.toLocaleString()} RWF
            </span>
            <span>View</span>
          </button>
        ))}
      </div>
    </details>
  );
}
