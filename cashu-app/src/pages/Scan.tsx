import { Info, CheckCircle } from 'lucide-react';
import { ScanNoteForm } from '../components/scan/ScanNoteForm';
import { NoteVerificationResult } from '../components/scan/NoteVerificationResult';
import { RedeemNoteForm } from '../components/scan/RedeemNoteForm';
import { RedeemLoadingStep } from '../components/scan/RedeemLoadingStep';
import { PageHeader } from '../components/shared/PageHeader';
import { useScan } from '../hooks/useScan';

export const Scan = () => {
  const {
    binB64,
    setBinB64,
    noteInfo,
    loading,
    error,
    setError,
    verified,
    verifyResult,
    invoice,
    setInvoice,
    redeeming,
    redeemSuccess,
    showScanner,
    setShowScanner,
    redeemMethod,
    setRedeemMethod,
    handleDecode,
    handleVerify,
    handleRedeem
  } = useScan();

  const isRedeemingProcess = redeeming || (verified && error && !redeemSuccess);

  if (isRedeemingProcess) {
    return (
      <RedeemLoadingStep
        error={error}
        onBack={() => setError(null)}
      />
    );
  }

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-6">
        <PageHeader title="Scan Note" />
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
          <div className="flex flex-col space-y-6">
            
            <NoteVerificationResult 
              noteInfo={noteInfo}
              verified={verified}
              verifyResult={verifyResult}
              loading={loading}
              error={error}
              onVerify={handleVerify}
            />

            {verified && noteInfo.type === 'full' && !isRedeemingProcess && !redeemSuccess && (
              <RedeemNoteForm 
                invoice={invoice}
                setInvoice={setInvoice}
                redeeming={redeeming}
                onRedeem={handleRedeem}
                noteAmount={noteInfo.amount}
                redeemMethod={redeemMethod}
                setRedeemMethod={setRedeemMethod}
                hasExtraProofs={verifyResult ? verifyResult.proof_total_sats > verifyResult.face_value_sats : false}
              />
            )}



            {redeemSuccess && (
              <div className="pt-6 border-t border-outline-variant/20 mt-4">
                <div className="text-center text-emerald-400 py-6 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                  <div className="font-bold text-lg">Successfully Redeemed!</div>
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}
    </main>
  );
};
