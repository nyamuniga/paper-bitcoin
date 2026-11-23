import type { ReactNode } from 'react';
import { BookUser, Loader2, QrCode, Zap } from 'lucide-react';
import { AddressBookAutocomplete } from '../../components/addressBook/AddressBookAutocomplete';
import { FormField } from '../../components/shared/FormField';
import { IconButton } from '../../components/shared/IconButton';
import { LnurlValidationStatus } from '../../components/shared/LnurlValidationStatus';
import type { LnurlValidationResult } from '../../hooks/useLnurlValidation';
import type { ParsedBitcoinInput } from '../../utils/bitcoinValidation';

export interface BitcoinDestinationEntryProps {
  page: boolean;
  value: string;
  scannerVisible: boolean;
  scanner: ReactNode;
  parsedInput: ParsedBitcoinInput;
  lnurlValidation: LnurlValidationResult;
  insufficientBalance: boolean;
  lnurlInput: boolean;
  lnurlBlocked: boolean;
  paying: boolean;
  fetchingInvoice: boolean;
  minOnchainSats: number;
  onChange: (value: string) => void;
  onOpenScanner: () => void;
  onCloseScanner: () => void;
  onOpenAddressBook: () => void;
  onPaste: () => void;
  onPayInvoice: () => void;
  onNext: () => void;
}

/** Destination presentation; the parent supplies validation and external actions. */
export function BitcoinDestinationEntry({
  page, value, scannerVisible, scanner, parsedInput, lnurlValidation,
  insufficientBalance, lnurlInput, lnurlBlocked, paying, fetchingInvoice, minOnchainSats,
  onChange, onOpenScanner, onCloseScanner, onOpenAddressBook, onPaste, onPayInvoice, onNext,
}: BitcoinDestinationEntryProps) {
  return (
    <div className="bitcoin-destination-form relative flex flex-col gap-2">
      {scannerVisible ? (
        <div className="relative rounded-xl overflow-hidden border border-outline-variant/30 aspect-square">
          {scanner}
          <button onClick={onCloseScanner} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-highest px-4 py-2 rounded-full text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface">Cancel Scanner</button>
        </div>
      ) : (
        <div className="bitcoin-payment-input flex flex-col gap-1.5">
          {page && <button
            type="button"
            aria-label="Scan Bitcoin payment"
            onClick={onOpenScanner}
            disabled={paying}
            className="bitcoin-scan-button rounded-lg border-2 border-dashed border-outline-variant/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-3 group relative bg-surface-container-lowest/50 text-primary cursor-pointer disabled:opacity-40"
          >
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-sm" />
              <QrCode className="w-10 h-10 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-label-caps font-label-caps">Tap to Scan QR Code</span>
          </button>}
          <FormField
            label="Pay to:"
            className="bitcoin-destination-field gap-1.5"
            labelClassName="text-body-md font-body-md text-on-surface-variant"
          >
            {control => (
              <div className={`relative glow-effect transition-all duration-300 rounded-xl bg-[#0c1b14] border overflow-hidden ${
                insufficientBalance || lnurlValidation.status === 'invalid'
                  ? 'border-error/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : lnurlValidation.status === 'valid'
                  ? 'border-emerald-500/40'
                  : 'border-[#142d20] focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40'
              }`}>
                <textarea
                  {...control}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full bg-transparent text-on-surface font-label-caps text-label-caps p-3.5 pb-2 border-none focus:outline-none resize-none placeholder:text-on-surface-variant/50 min-h-[76px]"
                  placeholder="Lightning, LNURL, or On-Chain..."
                  rows={3}
                  spellCheck={false}
                />

                {/* Action Toolbar */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-[#142d20]">
                  <div>
                    {value ? (
                      <button
                        type="button"
                        onClick={() => onChange('')}
                        className="text-[12px] font-bold text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onPaste}
                        className="text-[12px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                      >
                        Paste
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <IconButton
                      type="button"
                      onClick={onOpenAddressBook}
                      className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all border border-outline-variant/20 shadow-sm"
                      aria-label="Open Address Book"
                      title="Open Address Book"
                    >
                      <BookUser size={15} aria-hidden="true" />
                    </IconButton>
                    <button
                      type="button"
                      onClick={onOpenScanner}
                      className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all cursor-pointer border border-outline-variant/20 shadow-sm flex items-center justify-center"
                      title="Scan QR Code"
                      hidden={page}
                    >
                      <QrCode size={15} />
                    </button>
                  </div>
                </div>

                <AddressBookAutocomplete
                  type="bitcoin"
                  query={value}
                  visible={value.length >= 2 && !value.startsWith('lnbc')}
                  onSelect={(c) => {
                    onChange(c.value);
                  }}
                  onClose={() => {}}
                />
              </div>
            )}
          </FormField>
        </div>
      )}
      {parsedInput.type === 'lightning' && parsedInput.amountSats !== null && !scannerVisible && (
        <div className={`text-[12px] font-label-caps px-1 ${insufficientBalance ? 'text-error' : 'text-on-surface-variant'}`}>
          Invoice Amount: ₿{parsedInput.amountSats.toLocaleString()}
          {insufficientBalance && ' (Insufficient balance)'}
        </div>
      )}
      {parsedInput.type === 'onchain' && value.length > 0 && !scannerVisible && (
        <div className="flex items-center justify-between text-[12px] font-mono px-3 py-2 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant">
          <span>On-Chain Bitcoin Address</span>
          <span className="text-primary font-semibold">
            Min: {minOnchainSats.toLocaleString()} sats
          </span>
        </div>
      )}
      {parsedInput.type === 'invalid' && value.length > 0 && !scannerVisible && (
        <div className="text-[12px] font-label-caps px-1 text-error">
          Invalid invoice or address
        </div>
      )}
      {lnurlInput && !scannerVisible && (
        <LnurlValidationStatus input={parsedInput.addressOrInvoice} validation={lnurlValidation} />
      )}

      {!scannerVisible && (parsedInput.type === 'lightning' ? (
        <button
          onClick={onPayInvoice}
          disabled={paying || !value || insufficientBalance}
          className={`bitcoin-primary mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${paying || !value || insufficientBalance ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
        >
          {paying ? <Loader2 className="animate-spin w-6 h-6" /> : <><Zap className="w-5 h-5 mr-2" /> Pay Invoice</>}
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={(!lnurlInput && parsedInput.type !== 'onchain') || lnurlBlocked || fetchingInvoice}
          className={`bitcoin-primary mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${((!lnurlInput && parsedInput.type !== 'onchain') || lnurlBlocked || fetchingInvoice) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
        >
          {fetchingInvoice || (lnurlInput && lnurlValidation.status === 'checking') ? (
            <Loader2 className="animate-spin w-6 h-6" />
          ) : lnurlInput && lnurlValidation.status === 'invalid' ? (
            'Invalid Address'
          ) : (
            'Next'
          )}
        </button>
      ))}
    </div>
  );
}
