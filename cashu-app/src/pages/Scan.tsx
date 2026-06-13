import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Scan as ScanIcon, Loader2, CheckCircle } from 'lucide-react';
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
      await invoke('redeem_note', { binB64, invoice });
      setRedeemSuccess(true);
      await refreshWallet();
    } catch (e: any) {
      setError("Redeem failed: " + e.toString());
    }
    setRedeeming(false);
  };

  return (
    <div className="p-4 mt-8">
      <h1 className="text-2xl font-bold mb-4">Scan Note</h1>
      
      {!noteInfo ? (
        <div className="bg-surface rounded-2xl p-6 border border-gray-800">
          
          {showScanner ? (
            <div className="mb-6 rounded-xl overflow-hidden border-2 border-primary">
              <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
              <button onClick={() => setShowScanner(false)} className="w-full mt-2 text-gray-400 py-2">Cancel</button>
            </div>
          ) : (
            <div 
              onClick={() => setShowScanner(true)}
              className="text-center text-gray-500 mb-6 h-48 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:bg-gray-800 transition-colors"
            >
              <ScanIcon className="w-12 h-12 mb-2 text-primary" />
              <p className="text-primary font-bold">Tap to Scan QR Code</p>
            </div>
          )}
          
          <div className="flex items-center text-gray-600 mb-4">
            <hr className="flex-1 border-gray-700" />
            <span className="px-2 text-xs">OR PASTE</span>
            <hr className="flex-1 border-gray-700" />
          </div>
          
          <input 
            type="text" 
            value={binB64}
            onChange={(e) => setBinB64(e.target.value)}
            className="w-full bg-background border border-gray-700 rounded-xl p-4 text-white mb-4 text-sm" 
            placeholder="Paste binary base64..." 
          />
          
          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
          
          <button 
            onClick={() => handleDecode(binB64)}
            disabled={loading || !binB64}
            className="w-full bg-primary text-background font-bold py-4 rounded-xl text-lg flex justify-center items-center disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Decode Note'}
          </button>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl p-6 border border-gray-800 flex flex-col space-y-6">
          <div className="text-center relative">
            {noteInfo.type === 'public' && (
              <span className="absolute -top-3 right-0 bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-1 rounded border border-blue-500/30">
                VERIFICATION ONLY
              </span>
            )}
            <h2 className="text-xl font-bold text-white mb-1">E-Cash Note ({noteInfo.amount_sats} sats)</h2>
            <div className="text-xs text-gray-500 font-mono break-all">{noteInfo.validation_hash}</div>
          </div>
          
          <div className="flex justify-center space-x-2">
            <button 
              onClick={handleVerify}
              disabled={loading || verified === true}
              className={`flex-1 font-bold py-3 rounded-xl transition-colors ${verified ? 'bg-green-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
              {loading ? <Loader2 className="animate-spin mx-auto" /> : verified ? 'Verified' : 'Verify'}
            </button>
          </div>

          {error && <div className="text-red-400 text-sm mt-2 text-center">{error}</div>}

          {verified && verifyResult && (
            <div className="bg-gray-900 rounded-xl p-4 text-sm font-mono space-y-2 border border-gray-800">
              <div className="flex items-center text-green-400">
                <CheckCircle className="w-4 h-4 mr-2" /> Validation hash perfectly matches data
              </div>
              {verifyResult.proof_total_sats > verifyResult.face_value_sats ? (
                <div className="flex items-center text-green-400">
                  <CheckCircle className="w-4 h-4 mr-2" /> Face value safely bounded by proofs 
                  <span className="text-gray-400 text-xs ml-2">
                    ({verifyResult.face_value_sats} sats face, {verifyResult.proof_total_sats} sats in proofs)
                  </span>
                </div>
              ) : (
                <div className="flex items-center text-green-400">
                  <CheckCircle className="w-4 h-4 mr-2" /> Amount perfectly matches proofs ({verifyResult.face_value_sats} sats)
                </div>
              )}
              {verifyResult.untrusted ? (
                <div className="flex items-start text-yellow-400">
                  <span className="mr-2">⚠️</span> 
                  <span>Mints not trusted/Offline (DLEQ signatures skipped)</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center text-green-400">
                    <CheckCircle className="w-4 h-4 mr-2" /> Cryptographic DLEQ proofs verified
                  </div>
                  <div className="flex items-center text-green-400">
                    <CheckCircle className="w-4 h-4 mr-2" /> Blind signatures mathematically valid
                  </div>
                </>
              )}
              
              {verifyResult.spend_state === 'unspent' && (
                <div className="flex items-center text-green-400 font-bold mt-2 pt-2 border-t border-gray-800">
                  🟢 UNSPENT - The note is secure and ready to be redeemed.
                </div>
              )}
              {verifyResult.spend_state === 'spent' && (
                <div className="flex items-center text-red-500 font-bold mt-2 pt-2 border-t border-gray-800">
                  🔴 SPENT - WARNING: This note has already been redeemed!
                </div>
              )}
              {verifyResult.spend_state === 'unknown' && (
                <div className="flex items-center text-gray-400 font-bold mt-2 pt-2 border-t border-gray-800">
                  ⚠️ UNKNOWN SPEND STATE - Could not verify online.
                </div>
              )}

              <div className="pt-2 mt-2 border-t border-gray-800">
                <div className="text-gray-400 mb-1">Mints:</div>
                {verifyResult.mints.map((m: string) => (
                  <div key={m} className="text-xs text-gray-300 break-all ml-2">- {m}</div>
                ))}
              </div>
            </div>
          )}

          {verified && noteInfo.type === 'full' && (
            <div className="pt-4 border-t border-gray-800">
              <h3 className="text-lg font-bold mb-4">Redeem</h3>
              {redeemSuccess ? (
                <div className="text-center text-green-500 py-4">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                  <div className="font-bold">Successfully Redeemed!</div>
                </div>
              ) : (
                <>
                  <input 
                    type="text" 
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    className="w-full bg-background border border-gray-700 rounded-xl p-4 text-white mb-4 text-sm font-mono break-all" 
                    placeholder="lnbc..." 
                  />
                  {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
                  <button 
                    onClick={handleRedeem}
                    disabled={redeeming || !invoice}
                    className="w-full bg-green-500 text-white font-bold py-4 rounded-xl text-lg flex justify-center items-center disabled:opacity-50"
                  >
                    {redeeming ? <Loader2 className="animate-spin" /> : 'Pay to Invoice'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
