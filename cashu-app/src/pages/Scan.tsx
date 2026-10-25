import { useState, useEffect } from 'react';
import { Info, CheckCircle } from 'lucide-react';
import { ScanNoteForm } from '../components/scan/ScanNoteForm';
import { NoteVerificationResult } from '../components/scan/NoteVerificationResult';
import { RedeemNoteForm } from '../components/scan/RedeemNoteForm';
import { PageHeader } from '../components/shared/PageHeader';
import { useScan } from '../hooks/useScan';
import { SovereignStampOverlay, StampPaymentStatus } from '../components/shared/SovereignStampOverlay';
import { FullScreenLoader } from '../components/shared/FullScreenLoader';

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

  const [stampStatus, setStampStatus] = useState<StampPaymentStatus | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);

  useEffect(() => {
    if (redeemSuccess) {
      setStampStatus('success');
    } else if (error) {
      setStampStatus('failed');
      setStampError(error);
    }
  }, [redeemSuccess, error]);

  const handleDismissStamp = () => {
    setStampStatus(null);
    if (error) {
      setError(null);
    }
  };

  const noteAmount = noteInfo?.amount ?? verifyResult?.proof_total_sats ?? 0;

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <PageHeader title="Scan" subtitle="Scan notes, eCash tokens, or Lightning invoices" />

      <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
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
            <div className="w-full mt-8 flex items-start gap-3 p-4 rounded-lg bg-surface-container/30 border border-outline-variant/20">
              <Info className="text-on-surface-variant w-5 h-5 mt-0.5" />
              <div>
                <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">SECURE SCANNING</p>
                <p className="text-body-md font-body-md text-on-background/70 text-sm">All processing happens locally on your device. Private keys are never transmitted.</p>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full bg-surface-container-high rounded-xl p-6 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6">
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

              {verified && noteInfo.type === 'full' && !redeemSuccess && (
                <RedeemNoteForm 
                  invoice={invoice}
                  setInvoice={setInvoice}
                  redeeming={redeeming}
                  onRedeem={handleRedeem}
                  noteAmount={noteInfo.amount}
                  redeemMethod={redeemMethod}
                  setRedeemMethod={setRedeemMethod}
                  hasExtraProofs={verifyResult ? verifyResult.proof_total_sats > verifyResult.face_value_sats : false}
                  isSpent={verifyResult?.spend_state === 'spent'}
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
      </div>
      {redeeming && (
        <FullScreenLoader title="Redeeming Note..." message="Sweeping note proofs into your wallet..." />
      )}
      <SovereignStampOverlay
        status={stampStatus}
        amountSats={noteAmount}
        title={
          stampStatus === 'success'
            ? 'Note Redeemed'
            : (stampError || '').toLowerCase().includes('already spent') || (stampError || '').toLowerCase().includes('already redeemed')
              ? 'Note Already Redeemed'
              : 'Redemption Failed'
        }
        subtitle={
          stampStatus === 'success'
            ? 'Tokens claimed and balance settled to your wallet.'
            : (stampError || '').toLowerCase().includes('already spent') || (stampError || '').toLowerCase().includes('already redeemed')
              ? 'This physical note has already been claimed by another wallet.'
              : (stampError || 'Failed to redeem note.')
        }
        badgeLabel={
          stampStatus === 'success'
            ? 'Redeemed'
            : (stampError || '').toLowerCase().includes('already spent') || (stampError || '').toLowerCase().includes('already redeemed')
              ? 'Already Spent'
              : 'Failed'
        }
        errorMessage={stampError || undefined}
        onDismiss={handleDismissStamp}
        onRetry={handleRedeem}
      />
    </main>
  );
};
