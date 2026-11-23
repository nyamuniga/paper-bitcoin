import { BookUser } from 'lucide-react';
import { MintBalancePicker } from '../../components/shared/MintBalancePicker';
import { NumberPad } from '../../components/shared/NumberPad';
import { FormField } from '../../components/shared/FormField';

export interface MomoEntryFormProps {
  cashout: boolean;
  amount: string;
  phone: string;
  mint: string;
  balances: Record<string, number>;
  onAmount: (value: string) => void;
  onPhone: (value: string) => void;
  onMint: (mint: string) => void;
  onAddressBook: () => void;
  validation: string;
  error: string | null;
  maxAmount: number;
  rateUnavailable: boolean;
  onRefreshRate: () => void;
}

export function MomoEntryForm(props: MomoEntryFormProps) {
  const { cashout } = props;

  return (
    <>
      <div className="momo-entry-fields">
        <MintBalancePicker
          mintUrl={props.mint}
          balances={props.balances}
          onSelect={props.onMint}
        />
        <FormField
          id="momo-page-phone"
          label={cashout ? 'Recipient phone number' : 'Phone number'}
          className="momo-phone-field"
        >
          {control => (
            <div className="flex items-center gap-2">
              <input
                {...control}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="078 or 079…"
                value={props.phone}
                onChange={event =>
                  props.onPhone(event.target.value.replace(/\D/g, '').slice(0, 10))
                }
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <button
                type="button"
                onClick={props.onAddressBook}
                aria-label="Choose phone number from address book"
                className="momo-address-book"
              >
                <BookUser size={20} />
              </button>
            </div>
          )}
        </FormField>
      </div>
      <div className="momo-page-amount">
        <p className="text-label-sm font-label-caps text-on-surface-variant tracking-widest mb-1">
          AMOUNT
        </p>
        <output aria-label="Amount in RWF">
          {Number(props.amount || 0).toLocaleString()}{' '}
          <span className="momo-amount-unit">RWF</span>
        </output>
        {cashout && props.maxAmount >= 100 && (
          <button
            type="button"
            onClick={() => props.onAmount(String(props.maxAmount))}
          >
            Max {props.maxAmount.toLocaleString()} RWF
          </button>
        )}
      </div>
      <div className="momo-entry-feedback" aria-live="polite">
        {props.validation || props.error}
        {props.rateUnavailable && (
          <button
            type="button"
            onClick={props.onRefreshRate}
            className="text-primary underline"
          >
            Exchange rate unavailable. Retry
          </button>
        )}
      </div>
      <div className="momo-page-keypad" role="group" aria-label="Amount keypad">
        <NumberPad
          compact
          value={props.amount}
          onChange={value => {
            if (value.length <= 6) props.onAmount(value);
          }}
        />
      </div>
    </>
  );
}
