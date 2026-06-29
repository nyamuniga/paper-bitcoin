import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

interface NoteVerificationResultProps {
  noteInfo: any;
  verified: boolean | null;
  verifyResult: any;
  loading: boolean;
  error: string | null;
  onVerify: () => void;
}

export const NoteVerificationResult: React.FC<NoteVerificationResultProps> = ({ 
  noteInfo, verified, verifyResult, loading, error, onVerify 
}) => {
  return (
    <>
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
          onClick={onVerify}
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
    </>
  );
};
