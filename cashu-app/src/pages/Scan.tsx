import { Info } from 'lucide-react';
import { ScanNoteForm } from '../components/scan/ScanNoteForm';
import { NoteVerificationResult } from '../components/scan/NoteVerificationResult';
import { RedeemNoteForm } from '../components/scan/RedeemNoteForm';
import { useScan } from '../hooks/useScan';

export const Scan = () => {
  const {
    binB64,
    setBinB64,
    noteInfo,
    loading,
    error,
    verified,
    verifyResult,
    invoice,
    setInvoice,
    redeeming,
    redeemSuccess,
    showScanner,
    setShowScanner,
    handleDecode,
    handleVerify,
    handleRedeem
  } = useScan();

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
      <div className="w-full max-w-2xl text-left mb-6">
        <h1 className="text-headline-lg font-headline-lg text-on-background">Scan Note</h1>
      </div>

      {!noteInfo ? (
        <>
          <ScanNoteForm 
            showScanner={showScanner}
            setShowScanner={setShowScanner}
            binB64={binB64}
            setBinB64={setBinB64}
            onDecode={handleDecode}
            loading={loading}
            error={error}
          />
          <div className="w-full max-w-2xl mt-8 flex items-start gap-3 p-4 rounded-lg bg-surface-container/30 border border-outline-variant/20">
            <Info className="text-on-surface-variant w-5 h-5 mt-0.5" />
            <div>
              <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">SECURE SCANNING</p>
              <p className="text-body-md font-body-md text-on-background/70 text-sm">All processing happens locally on your device. Private keys are never transmitted.</p>
            </div>
          </div>
        </>
      ) : (
        <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-6 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6">
          <div className="noise-overlay"></div>
          <div className="relative z-10 flex flex-col space-y-6">
            
            <NoteVerificationResult 
              noteInfo={noteInfo}
              verified={verified}
              verifyResult={verifyResult}
              loading={loading}
              error={error}
              onVerify={handleVerify}
            />

            {verified && noteInfo.type === 'full' && (
              <RedeemNoteForm 
                invoice={invoice}
                setInvoice={setInvoice}
                redeeming={redeeming}
                redeemSuccess={redeemSuccess}
                error={error}
                onRedeem={handleRedeem}
              />
            )}
            
          </div>
        </div>
      )}
    </main>
  );
};
