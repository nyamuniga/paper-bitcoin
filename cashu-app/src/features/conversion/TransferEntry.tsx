import React from 'react';
import { ArrowUpDown, Bitcoin, ChevronRight, DollarSign, Loader2 } from 'lucide-react';
import { NumberPad } from '../../components/shared/NumberPad';
import { PrimaryActionButton } from '../../components/shared/PrimaryActionButton';

export interface TransferEntryProps {
  toDollars: boolean;
  amount: string;
  busy: boolean;
  mintUrl: string;
  canReview: boolean;
  quoteRetrySeconds: number;
  entryActionLabel: string;
  sourceBalanceText: string;
  destinationBalanceText: string;
  displayEstimateText: string;
  constraintMessage: string;
  amountMessage: string;
  hasAmountError: boolean;
  selectedPercent: number | null;
  percentDisabled: Record<number, boolean>;
  showRefreshBalance: boolean;
  showRefreshRate: boolean;
  onInputChange: (value: string) => void;
  onSwitchDirection: () => void;
  onSelectPercent: (percent: number) => void;
  onRefreshBalance: () => void;
  onRefreshRate: () => void;
  onReview: () => void;
}

export const TransferEntry: React.FC<TransferEntryProps> = ({
  toDollars,
  amount,
  busy,
  mintUrl,
  canReview,
  quoteRetrySeconds,
  entryActionLabel,
  sourceBalanceText,
  destinationBalanceText,
  displayEstimateText,
  constraintMessage,
  amountMessage,
  hasAmountError,
  selectedPercent,
  percentDisabled,
  showRefreshBalance,
  showRefreshRate,
  onInputChange,
  onSwitchDirection,
  onSelectPercent,
  onRefreshBalance,
  onRefreshRate,
  onReview,
}) => (
  <>
    <div className="transfer-pair">
      <div className="transfer-asset transfer-source">
        <div className="transfer-asset-heading">
          <label htmlFor="transfer-amount">From</label>
          <span className={toDollars ? 'transfer-bitcoin-label' : 'transfer-dollar-label'}>
            {toDollars ? <Bitcoin size={15} /> : <DollarSign size={15} />} {toDollars ? 'Bitcoin' : 'Dollar'}
          </span>
        </div>
        <div className="transfer-entry">
          {!toDollars && <span>$</span>}
          <input
            id="transfer-amount"
            aria-describedby="transfer-constraints"
            aria-label={toDollars ? 'Bitcoin amount in sats' : 'Dollar amount'}
            inputMode="none"
            autoComplete="off"
            placeholder="0"
            value={amount}
            disabled={busy}
            onChange={(e) => onInputChange(e.target.value)}
          />
          {toDollars && <span className="transfer-unit">SAT</span>}
        </div>
        <p className="transfer-available">Available: {sourceBalanceText}</p>
      </div>
      <button
        className="transfer-switch"
        aria-label="Switch Bitcoin and Dollar"
        disabled={busy}
        onClick={onSwitchDirection}
      >
        <ArrowUpDown size={21} />
      </button>
      <div className="transfer-asset transfer-destination">
        <div className="transfer-asset-heading">
          <span>To</span>
          <span className={toDollars ? 'transfer-dollar-label' : 'transfer-bitcoin-label'}>
            {toDollars ? <DollarSign size={15} /> : <Bitcoin size={15} />} {toDollars ? 'Dollar' : 'Bitcoin'}
          </span>
        </div>
        <p className="transfer-preview" aria-live="polite">
          {displayEstimateText}
        </p>
        <p className="transfer-available">{destinationBalanceText}</p>
      </div>
    </div>
    <div id="transfer-constraints" className="transfer-constraints" aria-live="polite">
      <p>{constraintMessage}</p>
      {amountMessage && <p className={hasAmountError ? 'transfer-hint-error' : ''}>{amountMessage}</p>}
    </div>
    <div className="transfer-entry-controls">
      <div className="transfer-percentages" aria-label="Choose a share of your balance">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            disabled={percentDisabled[percent]}
            aria-pressed={selectedPercent === percent}
            onClick={() => onSelectPercent(percent)}
          >
            {percent}%
          </button>
        ))}
      </div>
      <div className="transfer-keypad" aria-label="Amount keypad">
        <NumberPad value={amount} onChange={onInputChange} compact disabled={busy} allowDecimal={!toDollars} />
      </div>
      {showRefreshBalance && (
        <button className="transfer-text-button" disabled={busy} onClick={onRefreshBalance}>
          Refresh balance
        </button>
      )}
      {showRefreshRate && (
        <button className="transfer-text-button" disabled={busy} onClick={onRefreshRate}>
          Refresh exchange rate
        </button>
      )}
      <PrimaryActionButton
        type="button"
        className="transfer-primary"
        aria-label={entryActionLabel}
        loading={busy}
        disabled={!mintUrl || !canReview || quoteRetrySeconds > 0}
        onClick={onReview}
      >
        {busy && <Loader2 className="animate-spin" size={19} />}
        {entryActionLabel}
        {!busy && quoteRetrySeconds === 0 && <ChevronRight size={19} />}
      </PrimaryActionButton>
    </div>
  </>
);
