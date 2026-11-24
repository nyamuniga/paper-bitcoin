import React from 'react';
import { Check } from 'lucide-react';
import { LazyQrScanner as Scanner } from '../../components/shared/LazyQrScanner';
import { ReceivedTokenPreview } from '../../components/home/ReceivedTokenPreview';
import type { ReceivedTokenPreview as ReceivedTokenPreviewData } from '../../services/receivedTokenPreview';

export interface EcashReceiveViewProps {
  page: boolean;
  receivedAmount: number | null;
  receiveToken: string;
  receivePreview: ReceivedTokenPreviewData | null;
  showScanner: boolean;
  urProgress: number;
  urIsSuccess: boolean;
  receiveAction: React.ReactNode;
  onDone: () => void;
  onTokenChange: (text: string) => void;
  onClearToken: () => void;
  onPasteToken: () => void;
  onScanText: (raw: string) => void;
  onScanError: (message: string) => void;
  onCancelScanner: () => void;
}

export const EcashReceiveView: React.FC<EcashReceiveViewProps> = ({
  page,
  receivedAmount,
  receiveToken,
  receivePreview,
  showScanner,
  urProgress,
  urIsSuccess,
  receiveAction,
  onDone,
  onTokenChange,
  onClearToken,
  onPasteToken,
  onScanText,
  onScanError,
  onCancelScanner,
}) => {
  if (receivedAmount !== null) {
    return (
      <div className="flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <Check size={32} className="text-emerald-400" />
        </div>
        <div className="text-center">
          <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">RECEIVED</p>
          <p className="text-[28px] font-display-lg text-emerald-400">₿{receivedAmount.toLocaleString()}</p>
        </div>
        <button
          onClick={onDone}
          className="w-full py-3.5 sm:py-4 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
        >
          Done
        </button>
      </div>
    );
  }

  if (receivePreview && !showScanner) {
    return <ReceivedTokenPreview key={receivePreview.token} preview={receivePreview} />;
  }

  if (!showScanner && !receiveToken.trim()) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {showScanner ? (
          <div className="relative rounded-xl overflow-hidden border border-outline-variant/30 aspect-square shrink-0 w-[min(100%,calc(100dvh-220px))] mx-auto">
            <Scanner
              onScan={(result) => {
                if (result && result.length > 0 && result[0].rawValue) {
                  onScanText(result[0].rawValue);
                }
              }}
              onError={(e) => onScanError(e.message)}
            />
            {urProgress > 0 && !urIsSuccess && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface-container-highest/80 px-4 py-2 rounded-full text-label-caps font-label-caps text-primary backdrop-blur-md whitespace-nowrap">
                Scanning: {Math.round(urProgress * 100)}%
              </div>
            )}
            <button
              type="button"
              onClick={onCancelScanner}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-highest px-4 py-2 rounded-full text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface whitespace-nowrap"
            >
              Cancel Scanner
            </button>
          </div>
        ) : (
          <div className="ecash-field relative rounded-xl transition-all overflow-hidden flex flex-col">
            <textarea
              value={receiveToken}
              onChange={(e) => onTokenChange(e.target.value)}
              className="w-full font-label-caps text-label-caps p-3.5 pb-2 resize-none min-h-[76px]"
              placeholder="Paste cashu token here to receive..."
              rows={3}
              spellCheck={false}
            />

            <div className="ecash-field-toolbar flex items-center justify-between px-3 pb-2.5 pt-1">
              <div>
                {receiveToken ? (
                  <button
                    type="button"
                    onClick={onClearToken}
                    className="text-[12px] font-bold text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPasteToken}
                    className="text-[12px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                  >
                    Paste
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!page && !showScanner && receiveAction}
      </div>
    </div>
  );
};
