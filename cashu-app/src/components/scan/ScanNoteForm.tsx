import React from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { QrCode, Loader2 } from 'lucide-react';
import { useUrDecoder } from '../../hooks/useUrDecoder';

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

  return (
    <div className="w-full max-w-2xl bg-surface-container-high rounded-xl relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] p-card-gap flex flex-col gap-8 border border-outline-variant/30">
      <div className="noise-overlay"></div>
      <div className="relative z-10 flex flex-col gap-8 w-full">
        {showScanner ? (
          <div className="rounded-xl overflow-hidden border-2 border-primary">
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
            onClick={() => setShowScanner(true)}
            className="w-full aspect-[21/9] sm:aspect-[21/7] rounded-lg border-2 border-dashed border-outline-variant/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-4 group relative bg-surface-container-lowest/50"
          >
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"></div>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-sm shadow-[0_0_10px_rgba(255,184,116,0.3)]"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-sm shadow-[0_0_10px_rgba(255,184,116,0.3)]"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-sm shadow-[0_0_10px_rgba(255,184,116,0.3)]"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-sm shadow-[0_0_10px_rgba(255,184,116,0.3)]"></div>
              <QrCode className="w-10 h-10 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-label-caps font-label-caps text-primary relative z-10">Tap to Scan QR Code</span>
          </button>
        )}

        <div className="flex items-center gap-4 w-full px-4">
          <div className="flex-grow h-px bg-outline-variant/30"></div>
          <span className="text-label-caps font-label-caps text-on-surface-variant opacity-60">OR PASTE</span>
          <div className="flex-grow h-px bg-outline-variant/30"></div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative group">
            <textarea
              value={binB64}
              onChange={(e) => setBinB64(e.target.value)}
              className="w-full bg-surface-container-lowest text-on-background rounded-lg border-none px-4 py-4 min-h-[100px] resize-none focus:ring-1 focus:ring-primary/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] text-body-md font-body-md placeholder:text-on-surface-variant/40 transition-all glow-effect focus:bg-surface-container-lowest/80"
              placeholder="Paste ecash token, btc address, ln invoice, or note data..."
              spellCheck="false"
            ></textarea>
          </div>

          {error && <div className="text-error text-sm text-center">{error}</div>}

          <button
            onClick={() => onDecode(binB64)}
            disabled={loading || !binB64}
            className="w-full bg-gradient-to-r from-[#d4a055] to-[#f7931a] hover:from-[#e8b566] hover:to-[#ffa633] text-on-primary font-headline-lg-mobile text-body-md rounded-full py-4 transition-all transform active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <span className="font-bold tracking-wide">Process</span>}
          </button>
        </div>
      </div>
    </div>
  );
};
