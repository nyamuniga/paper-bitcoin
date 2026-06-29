import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, CheckCircle, Info, QrCode } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useWalletStore } from '../store/wallet';

export const Scan = () => {
  const [binB64, setBinB64] = useState<string>('');
  const [noteInfo, setNoteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const [invoice, setInvoice] = useState<string>('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);

  const [showScanner, setShowScanner] = useState(false);

  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const handleDecode = async (base64Payload: string) => {
    if (!base64Payload) return;
    setLoading(true);
    setError(null);
    setVerified(null);
    setNoteInfo(null);
    try {
      const res: any = await invoke('decode_bin', { binB64: base64Payload });
      setNoteInfo(res);
      setBinB64(base64Payload);
    } catch (e: any) {
      setError(e.toString());
    }
    setLoading(false);
  };

  const handleScan = (result: string) => {
    if (result) {
      setShowScanner(false);
      handleDecode(result);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res: any = await invoke('verify_note', { binB64 });
      if (res.success) {
        setVerified(true);
        setVerifyResult(res);
      }
    } catch (e: any) {
      setError("Verification failed: " + e.toString());
      setVerified(false);
    }
    setLoading(false);
  };

  const handleRedeem = async () => {
    if (!invoice) return;
    setRedeeming(true);
    setError(null);
    try {
      await invoke('redeem_note', { binB64, invoice: invoice.trim() });
      setRedeemSuccess(true);
      await refreshWallet();
    } catch (e: any) {
      setError("Redeem failed: " + e.toString());
    }
    setRedeeming(false);
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
      <div className="w-full max-w-2xl text-left mb-6">
        <h1 className="text-headline-lg font-headline-lg text-on-background">Scan Note</h1>
      </div>

      {!noteInfo ? (
        <>
          <div className="w-full max-w-2xl bg-surface-container-high rounded-xl relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] p-card-gap flex flex-col gap-8 border border-outline-variant/30">
            <div className="noise-overlay"></div>
            <div className="relative z-10 flex flex-col gap-8 w-full">
              {showScanner ? (
                <div className="rounded-xl overflow-hidden border-2 border-primary">
                  <Scanner
                    formats={['qr_code']}
                    onScan={(result) => {
                      if (!result || result.length === 0) return;
                      const validQr = result.find(r => r.rawValue.toUpperCase().startsWith('ECASHZ:'));
                      handleScan(validQr ? validQr.rawValue : result[0].rawValue);
                    }}
                  />
                  <button onClick={() => setShowScanner(false)} className="w-full mt-2 text-on-surface-variant hover:text-on-surface py-2 text-label-caps font-label-caps">Cancel Scanner</button>
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
                    placeholder="Paste binary base45/base64..."
                    spellCheck="false"
                  ></textarea>
                </div>

                {error && <div className="text-error text-sm text-center">{error}</div>}

                <button
                  onClick={() => handleDecode(binB64)}
                  disabled={loading || !binB64}
                  className="w-full bg-gradient-to-r from-[#d4a055] to-[#f7931a] hover:from-[#e8b566] hover:to-[#ffa633] text-on-primary font-headline-lg-mobile text-body-md rounded-full py-4 transition-all transform active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <span className="font-bold tracking-wide">Decode Note</span>}
                </button>
              </div>
            </div>
          </div>

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
            <div className="text-center relative">
              {noteInfo.type === 'public' && (
                <span className="absolute -top-3 right-0 bg-primary/10 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/20 text-label-caps font-label-caps">
                  VERIFICATION ONLY
                </span>
              )}
              <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface mb-1">E-Cash Note ({noteInfo.amount_sats} sats)</h2>
              <div className="text-xs text-on-surface-variant font-mono break-all opacity-70">{noteInfo.validation_hash}</div>
            </div>

            <div className="flex justify-center space-x-2">
              <button
                onClick={handleVerify}
                disabled={loading || verified === true}
                className={`w-full font-bold py-4 rounded-full transition-all flex justify-center items-center gap-2 ${verified ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-surface-container-highest hover:bg-surface-bright text-on-surface border border-outline-variant/30'}`}
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : verified ? <><CheckCircle className="w-5 h-5" /> Verified</> : 'Verify Cryptographic Proofs'}
              </button>
            </div>

            {error && <div className="text-error text-sm mt-2 text-center">{error}</div>}

            {verified && verifyResult && (
              <div className="bg-surface-container-lowest rounded-xl p-5 text-sm font-label-caps space-y-3 border border-outline-variant/30 shadow-inner">
                {verifyResult.serial_number && (
                  <div className="mb-4 pb-4 border-b border-outline-variant/20 border-dashed space-y-2">
                    <div className="flex items-center text-on-surface">
                      <span className="w-32 text-on-surface-variant flex-shrink-0">Serial Number</span>
                      <span className="font-mono text-xs">{verifyResult.serial_number}</span>
                    </div>
                    <div className="flex items-center text-on-surface">
                      <span className="w-32 text-on-surface-variant flex-shrink-0">Block height</span>
                      <span className="font-mono text-xs">{verifyResult.block_height}</span>
                    </div>
                    <div className="flex items-center text-on-surface">
                      <span className="w-32 text-on-surface-variant flex-shrink-0">Validation hash</span>
                      <span className="font-mono text-xs truncate" title={verifyResult.validation_hash}>
                        {verifyResult.validation_hash.substring(0, 12)}...{verifyResult.validation_hash.substring(verifyResult.validation_hash.length - 10)}
                      </span>
                      <span className="text-emerald-400 ml-1 ml-auto text-xs font-bold">(MATCHES)</span>
                    </div>
                    <div className="flex items-center text-on-surface">
                      <span className="w-32 text-on-surface-variant flex-shrink-0">Key ID(s)</span>
                      <span className="font-mono text-[10px] break-all">{verifyResult.key_ids?.join(", ")}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center text-emerald-400">
                  <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" /> Validation hash perfectly matches data
                </div>
                {verifyResult.proof_total_sats > verifyResult.face_value_sats ? (
                  <div className="flex items-start text-emerald-400">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <div>
                      Face value safely bounded by proofs
                      <div className="text-on-surface-variant text-xs mt-1">
                        ({verifyResult.face_value_sats} sats face, {verifyResult.proof_total_sats} sats in proofs)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center text-emerald-400">
                    <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" /> Amount perfectly matches proofs ({verifyResult.face_value_sats} sats)
                  </div>
                )}
                {verifyResult.untrusted ? (
                  <div className="flex items-start text-amber-400">
                    <span className="mr-2 flex-shrink-0">⚠️</span>
                    <span>Mints not trusted/Offline (DLEQ signatures skipped)</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center text-emerald-400">
                      <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" /> Cryptographic DLEQ proofs verified
                    </div>
                    <div className="flex items-center text-emerald-400">
                      <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" /> Blind signatures mathematically valid
                    </div>
                  </>
                )}

                {verifyResult.spend_state === 'unspent' && (
                  <div className="flex items-center text-emerald-400 font-bold mt-4 pt-4 border-t border-outline-variant/20 border-dashed">
                    🟢 UNSPENT - The note is secure and ready to be redeemed.
                  </div>
                )}
                {verifyResult.spend_state === 'spent' && (
                  <div className="flex items-center text-error font-bold mt-4 pt-4 border-t border-outline-variant/20 border-dashed">
                    🔴 SPENT - WARNING: This note has already been redeemed!
                  </div>
                )}
                {verifyResult.spend_state === 'unknown' && (
                  <div className="flex items-center text-on-surface-variant font-bold mt-4 pt-4 border-t border-outline-variant/20 border-dashed">
                    ⚠️ UNKNOWN SPEND STATE - Could not verify online.
                  </div>
                )}

                <div className="pt-3 mt-3 border-t border-outline-variant/20 border-dashed">
                  <div className="text-on-surface-variant mb-2 opacity-70">Associated Mints:</div>
                  <div className="space-y-1">
                    {verifyResult.mints.map((m: string) => (
                      <div key={m} className="text-xs text-on-surface break-all opacity-90 pl-2 border-l-2 border-primary/30">{m}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {verified && noteInfo.type === 'full' && (
              <div className="pt-6 border-t border-outline-variant/20 mt-4">
                <h3 className="text-headline-lg-mobile text-lg font-headline-lg-mobile mb-4">Redeem to Lightning</h3>
                {redeemSuccess ? (
                  <div className="text-center text-emerald-400 py-6 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                    <div className="font-bold text-lg">Successfully Redeemed!</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="relative glow-effect rounded-lg">
                      <textarea
                        value={invoice}
                        onChange={(e) => setInvoice(e.target.value)}
                        className="w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none resize-none placeholder:text-on-surface-variant/50 h-[80px]"
                        placeholder="Paste lnbc..."
                        spellCheck="false"
                      />
                    </div>
                    {error && <div className="text-error text-sm text-center">{error}</div>}
                    <button
                      onClick={handleRedeem}
                      disabled={redeeming || !invoice}
                      className="w-full btn-gradient py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center disabled:opacity-50"
                    >
                      {redeeming ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay to Invoice'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
