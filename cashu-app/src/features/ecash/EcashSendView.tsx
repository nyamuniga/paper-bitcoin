import React from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { NumberPad } from '../../components/shared/NumberPad';
import { MintIcon } from '../../components/shared/MintIcon';
import { MintName } from '../../components/shared/MintName';
import { SafeQRCode } from '../../components/shared/SafeQRCode';
import { SlidingSegmentedControl } from '../../components/shared/SlidingSegmentedControl';
import { LazyQrScanner as Scanner } from '../../components/shared/LazyQrScanner';

export interface EcashSendViewProps {
  page: boolean;
  mintUrl: string;
  amount: string;
  parsedAmount: number;
  isInsufficient: boolean;
  isValid: boolean;
  sending: boolean;
  requestBusy: boolean;
  showScanner: boolean;
  token: string | null;
  tokenV3: string | null;
  tokenV4: string | null;
  formatVersion: 'v3' | 'v4';
  isClaimed: boolean;
  copied: boolean;
  currentFrame: string;
  isAnimated: boolean;
  currentFrameIndex: number;
  totalFrames: number;
  pubkeyField: React.ReactNode;
  onAmountChange: (value: string) => void;
  onSend: () => void;
  onCopy: () => void;
  onFormatChange: (version: 'v3' | 'v4') => void;
  onScanText: (raw: string) => void;
  onScanError: (message: string) => void;
  onCancelScanner: () => void;
}

export const EcashSendView: React.FC<EcashSendViewProps> = ({
  page,
  mintUrl,
  amount,
  parsedAmount,
  isInsufficient,
  isValid,
  sending,
  requestBusy,
  showScanner,
  token,
  formatVersion,
  isClaimed,
  copied,
  currentFrame,
  isAnimated,
  currentFrameIndex,
  totalFrames,
  pubkeyField,
  onAmountChange,
  onSend,
  onCopy,
  onFormatChange,
  onScanText,
  onScanError,
  onCancelScanner,
}) => {
  if (showScanner) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-outline-variant/30 aspect-square shrink-0 w-[min(100%,calc(100dvh-220px))] mx-auto">
        <Scanner
          onScan={(result) => {
            if (!result || result.length === 0) return;
            const text = result[0].rawValue?.trim();
            if (text) onScanText(text);
          }}
          onError={(e) => onScanError(e.message)}
        />
        <button
          type="button"
          onClick={onCancelScanner}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-highest px-4 py-2 rounded-full text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface whitespace-nowrap"
        >
          Cancel Scanner
        </button>
      </div>
    );
  }

  return (
    <div className="ecash-send-entry flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2.5 sm:gap-3">
        {!token && !requestBusy && (
          <>
            {!page && <AmountDisplay amount={amount} compact />}
            {!page && <NumberPad value={amount} onChange={onAmountChange} compact />}
            {!page && pubkeyField}
          </>
        )}
        {isInsufficient && !token && !page && (
          <p className="text-error text-[12px] font-label-caps text-center">Insufficient balance</p>
        )}

        {!page && !token && !requestBusy && (
          <button
            onClick={onSend}
            disabled={sending || requestBusy || !isValid}
            className={`btn-gradient w-full py-3.5 sm:py-4 rounded-2xl text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center mt-1 cursor-pointer ${
              sending || requestBusy || !isValid ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {sending ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Token'}
          </button>
        )}
      </div>

      {token && (
        <div className="flex flex-col items-center gap-5 pt-2">
          <SlidingSegmentedControl<'v3' | 'v4'>
            options={[
              { id: 'v3', label: 'cashuA' },
              { id: 'v4', label: 'cashuB' },
            ]}
            value={formatVersion}
            onChange={onFormatChange}
            className="w-48"
            buttonClassName="py-1.5 px-3 text-xs"
          />

          <div className="relative">
            {isClaimed ? (
              <div className="bg-emerald-500/10 p-8 rounded-xl shadow-lg relative border border-emerald-500/20 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-headline-sm font-headline-sm text-emerald-400 text-center">Token Claimed!</p>
                <p className="text-body-sm font-body-sm text-emerald-400/80 text-center">
                  The recipient has successfully received these funds.
                </p>
              </div>
            ) : (
              <>
                <div
                  onClick={onCopy}
                  className="bg-white p-4 rounded-xl shadow-lg relative min-w-[232px] min-h-[232px] flex items-center justify-center cursor-pointer hover:shadow-[0_0_25px_rgba(255,184,116,0.35)] transition-all active:scale-[0.98]"
                  title="Click to copy token"
                >
                  <SafeQRCode value={currentFrame || (token && token.length < 1500 ? token : '')} size={200} />
                  {isAnimated && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-label-caps">
                      {currentFrameIndex + 1}/{totalFrames}
                    </div>
                  )}
                  {copied && (
                    <div className="absolute inset-0 bg-black/80 rounded-xl flex flex-col items-center justify-center text-emerald-400 gap-1.5 backdrop-blur-[2px]">
                      <Check size={28} className="stroke-[2.5]" />
                      <span className="text-xs font-bold font-mono tracking-wide">Copied!</span>
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
              </>
            )}
          </div>

          <div className="w-full flex items-center justify-between gap-4" aria-label="Token mint and amount">
            <div className="flex items-center gap-2 min-w-0">
              <MintIcon mintUrl={mintUrl} className="w-6 h-6 rounded-full shrink-0" textClassName="text-primary text-[10px]" />
              <MintName mintUrl={mintUrl} className="text-sm text-on-surface truncate" />
            </div>
            <p className="text-xl font-display-lg text-primary shrink-0">₿{parsedAmount.toLocaleString()}</p>
          </div>

          <div className="w-full flex flex-col gap-2">
            <div
              onClick={onCopy}
              className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/30 transition-colors"
            >
              <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{token}</p>
            </div>
            <button
              onClick={onCopy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
            >
              {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Token</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
