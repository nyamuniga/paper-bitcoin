import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { QrCode, Loader2, BookUser } from 'lucide-react';
import { useUrDecoder } from '../../hooks/useUrDecoder';
import { readClipboardText } from '../../utils/clipboard';
import { parseBitcoinInput } from '../../utils/bitcoinValidation';
import { useLnurlValidation } from '../../hooks/useLnurlValidation';
import { LnurlValidationStatus } from '../shared/LnurlValidationStatus';
import { AddressBookPickerModal } from '../addressBook/AddressBookPickerModal';
import { AddressBookAutocomplete } from '../addressBook/AddressBookAutocomplete';

interface ScanNoteFormProps {
  showScanner: boolean;
  setShowScanner: (show: boolean) => void;
  binB64: string;
  setBinB64: (val: string) => void;
  onDecode: (val: string) => void;
  loading: boolean;
  error: string | null;
}

export const ScanNoteForm: React.FC<ScanNoteFormProps> = ({
  showScanner, setShowScanner, binB64, setBinB64, onDecode, loading, error
}) => {
  const urDecoder = useUrDecoder();
  const [showAddressBook, setShowAddressBook] = useState(false);

  // Live-validate pasted Lightning Addresses / LNURLs before allowing "Process"
  const parsed = parseBitcoinInput(binB64);
  const isLnurlInput = parsed.type === 'lnurl' || parsed.type === 'lnurl-pay';
  const lnurlValidation = useLnurlValidation(isLnurlInput ? parsed.addressOrInvoice : null);
  const isLnurlBlocked = isLnurlInput && lnurlValidation.status !== 'valid';

  return (
    <div className="scan-note-form">
      <div className="scan-form-content">
        {showScanner ? (
          <div className="scan-camera rounded-xl overflow-hidden border-2 border-primary">
            <Scanner
              formats={['qr_code']}
              onScan={(result) => {
                if (!result || result.length === 0) return;
                const text = result[0].rawValue;
                if (text.toLowerCase().startsWith('ur:')) {
                  const decoded = urDecoder.receivePart(text);
                  if (decoded) {
                    setShowScanner(false);
                    onDecode(decoded);
                  }
                } else {
                  if (text) {
                    setShowScanner(false);
                    onDecode(text);
                  }
                }
              }}
            />
            {urDecoder.progress > 0 && !urDecoder.isSuccess && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface-container-highest/80 px-4 py-2 rounded-full text-label-caps font-label-caps text-primary backdrop-blur-md">
                Scanning: {Math.round(urDecoder.progress * 100)}%
              </div>
            )}
            <button
              onClick={() => {
                setShowScanner(false);
                urDecoder.reset();
              }}
              className="w-full mt-2 text-on-surface-variant hover:text-on-surface py-2 text-label-caps font-label-caps"
            >
              Cancel Scanner
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Scan QR code"
            onClick={() => setShowScanner(true)}
            className="scan-launch rounded-lg border-2 border-dashed border-outline-variant/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-3 group relative bg-surface-container-lowest/50 text-primary cursor-pointer"
          >
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-sm"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-sm"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-sm"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-sm"></div>
              <QrCode className="w-10 h-10 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-label-caps font-label-caps text-primary relative z-10">Tap to Scan QR Code</span>
          </button>
        )}

        <div className="scan-paste-fields flex flex-col gap-2">
          <label htmlFor="scan-data" className="text-body-md font-body-md text-on-surface-variant">Or paste:</label>
          <div className="relative bg-[#0c1b14] rounded-xl px-3.5 pt-3 pb-2.5 border border-[#142d20] focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40 transition-all flex flex-col gap-2">
            <textarea
              id="scan-data"
              value={binB64}
              onChange={(e) => setBinB64(e.target.value)}
              className="w-full bg-transparent text-on-surface border-none p-0 min-h-[50px] resize-none focus:outline-none text-body-md font-body-md placeholder:text-on-surface-variant/40"
              placeholder="Ecash token, address, invoice, or note data..."
              spellCheck="false"
            />

            {/* Action Bar inside the input field */}
            <div className="flex items-center justify-between pt-2 border-t border-[#142d20]">
              <div>
                {binB64 ? (
                  <button
                    type="button"
                    onClick={() => setBinB64('')}
                    className="text-[12px] font-bold text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await readClipboardText();
                        if (text) setBinB64(text.trim());
                      } catch (e) {
                        console.warn('Clipboard read failed', e);
                      }
                    }}
                    className="text-[12px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                  >
                    Paste
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddressBook(true)}
                  className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all cursor-pointer border border-outline-variant/20 shadow-sm flex items-center justify-center"
                  title="Open Address Book"
                >
                  <BookUser size={15} />
                </button>
              </div>
            </div>

            <AddressBookAutocomplete
              type="bitcoin"
              query={binB64}
              visible={binB64.length >= 2 && !binB64.startsWith('cashuA') && !binB64.startsWith('lnbc')}
              onSelect={(c) => {
                setBinB64(c.value);
              }}
              onClose={() => {}}
            />
          </div>

          <p className="scan-security-note">All processing happens locally on your device. Private keys are never transmitted.</p>

          {isLnurlInput && (
            <LnurlValidationStatus input={parsed.addressOrInvoice} validation={lnurlValidation} />
          )}

          {parsed.type === 'onchain' && (
            <div className="flex items-center justify-between text-[12px] font-mono px-3 py-2 rounded-lg bg-surface-container-highest border border-emerald-500/30 text-emerald-400">
              <span>✓ Bitcoin On-Chain Address Detected</span>
              {parsed.amountSats && (
                <span className="text-primary font-semibold">
                  ₿{parsed.amountSats.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {error && <div role="alert" className="text-error text-sm text-center">{error}</div>}

        </div>

        <button
          onClick={() => onDecode(binB64)}
          disabled={loading || !binB64 || isLnurlBlocked}
          className="scan-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {loading || (isLnurlInput && lnurlValidation.status === 'checking') ? (
            <Loader2 className="animate-spin w-5 h-5" />
          ) : isLnurlInput && lnurlValidation.status === 'invalid' ? (
            <span className="font-bold tracking-wide">Invalid Address</span>
          ) : (
            <span className="font-bold tracking-wide">Process</span>
          )}
        </button>
      </div>

      <AddressBookPickerModal
        isOpen={showAddressBook}
        onClose={() => setShowAddressBook(false)}
        type="bitcoin"
        onSelect={(contact) => {
          setBinB64(contact.value);
        }}
      />
    </div>
  );
};
