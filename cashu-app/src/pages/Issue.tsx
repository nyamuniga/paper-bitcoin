import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { CheckCircle, Loader2, X } from 'lucide-react';
import QRCode from 'react-qr-code';

export const Issue = () => {
  const [sats, setSats] = useState<string>('');
  const [mintUrls, setMintUrls] = useState<string[]>([]);
  const [newMint, setNewMint] = useState<string>('');
  const [strategy, setStrategy] = useState<'dynamic' | 'static'>('dynamic');
  const [loading, setLoading] = useState(false);
  const [invoicePayload, setInvoicePayload] = useState<any>(null);
  const [issuedNote, setIssuedNote] = useState<any>(null);
  const [pollTrigger, setPollTrigger] = useState(0);
  const [error, setError] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  const isCheckingRef = useRef(false);

  const addLog = (msg: string) => setDebugLogs(p => [...p, msg]);

  const balance = useWalletStore((s) => s.balanceSats);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  useEffect(() => {
    // invoice-ready listener removed as we return the payload directly now
  }, []);

  const handleIssue = async () => {
    const amt = parseInt(sats);
    if (!amt || amt <= 0) return;

    setLoading(true);
    setError('');
    setInvoicePayload(null);
    setIssuedNote(null);
    setDebugLogs([]);
    addLog(`Calling issue_note with amt=${amt}, mintUrls=${mintUrls.join(', ')}`);

    try {
      const res = await invoke('issue_note', { sats: amt, mintUrls: mintUrls, strategy: strategy });
      addLog("issue_note resolved with PendingIssue: " + JSON.stringify(res));
      setInvoicePayload(res); // PendingIssue matches invoice payload mostly, plus tx_id
      await refreshWallet();
    } catch (e: any) {
      addLog("issue_note failed: " + String(e));
      setError(e.toString());
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!invoicePayload || !invoicePayload.tx_id || issuedNote) return;

    let timeoutId: any;
    let isPolling = true;

    const pollStatus = async () => {
      if (!isPolling) return;
      if (isCheckingRef.current) {
        // Wait and try again if a check is already in progress
        timeoutId = setTimeout(pollStatus, 1000);
        return;
      }
      isCheckingRef.current = true;
      try {
        const res = await invoke('check_issue_status', { txId: invoicePayload.tx_id });
        if (!isPolling) return;
        addLog("check_issue_status returned success!");
        setIssuedNote(res);
        setInvoicePayload(null);
        await refreshWallet();
      } catch (e: any) {
        if (!isPolling) return;
        const errMsg = e.toString();
        addLog("check_issue_status error: " + errMsg);

        if (errMsg.includes('not paid') || errMsg.includes('Concurrent issuance failed') || errMsg.includes('already spent') || errMsg.includes('timeout') || errMsg.includes('error')) {
          // Keep polling for a bit since Lightning settlements or mint processing can be slow
          timeoutId = setTimeout(pollStatus, 2000);
        } else {
          setError("Status check failed. " + errMsg);
          setLoading(false);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    pollStatus();

    return () => {
      isPolling = false;
      clearTimeout(timeoutId);
    };
  }, [invoicePayload, issuedNote, refreshWallet, pollTrigger]);

  const handleCheckStatus = () => {
    if (!invoicePayload) return;
    setLoading(true);
    setError('');
    addLog("Restarting background polling...");
    setPollTrigger(p => p + 1);
  };

  const handlePayFromWallet = async () => {
    if (!invoicePayload) return;
    setLoading(true);
    try {
      await invoke('pay_invoice', { invoice: invoicePayload.invoice });
      // The issue_note call should automatically finish when the mint sees the payment
    } catch (e: any) {
      setError("Payment failed: " + e.toString());
      setLoading(false); // only stop loading on error, on success it's handled by issue_note finishing
    }
  };

  if (issuedNote) {
    return (
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
        <div className="w-full max-w-2xl text-center mb-8 mt-4 flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
          <h1 className="text-headline-lg font-headline-lg text-on-background mb-2">Note Created!</h1>
          <p className="text-on-surface-variant text-lg">Face value: <span className="text-emerald-400 font-bold">{issuedNote.face_value} sats</span></p>
        </div>

        <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6">
          <div className="noise-overlay"></div>
          <div className="relative z-10 flex flex-col space-y-8 w-full items-center h-full">
            <div className="text-center font-label-caps text-label-caps text-on-surface-variant tracking-widest">YOUR PHYSICAL NOTE</div>

            <div className="bg-white p-3 rounded-xl inline-block shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-full flex justify-center max-w-[500px]">
              <img src={`data:image/svg+xml;base64,${issuedNote.svg_b64}`} alt="Physical Note" className="w-full h-auto" />
            </div>

            <div className="w-full mt-4 flex-grow flex flex-col justify-end">
              {saveSuccess ? (
                <div className="w-full bg-emerald-500/10 text-emerald-400 font-bold py-4 rounded-full text-lg text-center border border-emerald-500/20 shadow-inner">
                  {saveSuccess}
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setSaving(true);
                    setError('');
                    try {
                      const { save } = await import('@tauri-apps/plugin-dialog');
                      const { writeFile } = await import('@tauri-apps/plugin-fs');

                      const filename = `note-${issuedNote.face_value}-sats-${issuedNote.serial}.pdf`;
                      const savePath = await save({
                        title: 'Save Note PDF',
                        defaultPath: filename,
                        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
                      });

                      if (savePath) {
                        const pdfBytes = await invoke<number[]>('get_pdf_from_bin', { binB64: issuedNote.bin_b64 });
                        await writeFile(savePath, new Uint8Array(pdfBytes));
                        setSaveSuccess(`Successfully saved note!`);

                        try {
                          const { openPath } = await import('@tauri-apps/plugin-opener');
                          await openPath(savePath);
                        } catch (e) {
                          console.log("Could not open file natively", e);
                        }
                      } else {
                        // User cancelled
                        setSaving(false);
                        return;
                      }
                    } catch (e: any) {
                      setError(`Failed to save PDF: ${e}`);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="w-full btn-gradient text-on-primary font-bold py-4 rounded-full text-lg flex items-center justify-center disabled:opacity-50 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  {saving ? <Loader2 className="animate-spin w-6 h-6" /> : 'Save Note as PDF'}
                </button>
              )}
              {error && <div className="text-error text-sm mt-4 text-center bg-error/10 p-3 rounded-lg border border-error/20">{error}</div>}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (invoicePayload) {
    return (
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
        <div className="w-full max-w-2xl text-left mb-6">
          <h1 className="text-headline-lg font-headline-lg text-on-background">Pay Invoice</h1>
        </div>

        <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6 items-center text-center">
          <div className="noise-overlay"></div>
          <div className="relative z-10 flex flex-col space-y-6 w-full items-center">
            <p className="text-on-surface-variant mb-2 font-label-caps text-label-caps">Pay this invoice to fund the new note</p>
            <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
              <QRCode value={invoicePayload.invoice} size={200} />
            </div>
            <div className="text-headline-lg font-headline-lg text-primary">{invoicePayload.total_sats} sats</div>
            <div className="text-xs text-on-surface-variant mb-2 truncate w-full max-w-sm px-4 py-3 bg-surface-container-lowest rounded-lg border border-outline-variant/30 select-all shadow-inner">{invoicePayload.invoice}</div>

            {balance >= invoicePayload.total_sats ? (
              <button onClick={handlePayFromWallet} disabled={loading} className="w-full max-w-md bg-emerald-500/20 text-emerald-400 font-bold py-4 rounded-full text-lg flex justify-center items-center hover:bg-emerald-500/30 transition-colors border border-emerald-500/30 disabled:opacity-50 mt-4">
                {loading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay from Wallet Balance'}
              </button>
            ) : (
              <div className="text-error text-sm mt-4 bg-error/10 py-3 px-4 rounded-lg border border-error/20 w-full max-w-md font-label-caps text-label-caps">Insufficient wallet balance to auto-pay</div>
            )}

            <button onClick={handleCheckStatus} disabled={loading} className="w-full max-w-md bg-primary/20 text-primary font-bold py-4 rounded-full text-lg flex justify-center items-center hover:bg-primary/30 transition-colors border border-primary/30 disabled:opacity-50 mt-2">
              {loading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Check Payment Status'}
            </button>

            {loading && <div className="mt-4 text-sm text-on-surface-variant flex items-center justify-center font-label-caps text-label-caps"><Loader2 className="animate-spin w-4 h-4 mr-2" /> Waiting for payment...</div>}

            {error && <div className="text-error text-sm mt-4 p-4 bg-error/10 rounded-xl text-left font-mono w-full border border-error/20">{error}</div>}
            {debugLogs.length > 0 && (
              <div className="bg-surface-container-lowest p-4 rounded-xl mt-4 text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto text-left w-full border border-outline-variant/30 shadow-inner">
                {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-8 flex flex-col items-center">
      <div className="w-full max-w-2xl text-left mb-6">
        <h1 className="text-headline-lg font-headline-lg text-on-background">Issue Note</h1>
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-8">
        <div className="noise-overlay"></div>
        <div className="relative z-10 flex flex-col space-y-8 w-full">

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-2">AMOUNT (SATS)</label>
            <div className="relative glow-effect rounded-lg">
              <input
                type="number"
                value={sats}
                onChange={(e) => setSats(e.target.value)}
                className="w-full bg-surface-container-lowest text-on-surface text-center font-headline-lg-mobile text-[32px] p-6 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-on-surface-variant/50 transition-all"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-2">MINT URLS</label>
            <div className="space-y-2">
              {mintUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-4 text-on-surface text-sm overflow-x-hidden truncate shadow-inner">{url}</div>
                  <button onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))} className="bg-error/10 hover:bg-error/20 text-error px-4 rounded-lg transition-colors flex items-center justify-center">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {mintUrls.length < 3 && (
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={newMint}
                  onChange={(e) => setNewMint(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-4 text-on-surface text-sm shadow-inner focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-on-surface-variant/50"
                  placeholder="Add another mint URL..."
                />
                <button
                  onClick={() => {
                    if (newMint) {
                      let raw = newMint.trim();
                      // Add protocol if missing
                      if (!/^https?:\/\//i.test(raw)) {
                        raw = 'https://' + raw;
                      }

                      try {
                        const url = new URL(raw);
                        // Lowercase only the hostname
                        url.hostname = url.hostname.toLowerCase();
                        // Remove trailing slash (optional)
                        const sanitized = url.toString().replace(/\/$/, '');

                        if (!mintUrls.includes(sanitized)) {
                          setMintUrls([...mintUrls, sanitized]);
                        }
                        setNewMint('');
                      } catch {
                        // Handle invalid URL (optional)
                        console.warn('Invalid URL');
                      }
                    }
                  }}
                  className="bg-surface-container-highest hover:bg-surface-bright border border-outline-variant/30 text-on-surface px-6 rounded-lg font-bold transition-colors text-sm"
                >
                  Add
                </button>
              </div>
            )}
            {mintUrls.length >= 3 && (
              <div className="mt-3 text-xs text-on-surface-variant text-center font-label-caps">Maximum of 3 mints allowed</div>
            )}
          </div>

          <div>
            <label className="block text-on-surface-variant text-label-caps font-label-caps mb-3">FEE RESERVE STRATEGY</label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setStrategy('dynamic')}
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col items-center text-center ${strategy === 'dynamic' ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(255,184,116,0.15)] text-primary' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/60'}`}
              >
                <div className="font-bold mb-1">Dynamic (Cheaper)</div>
                <div className="text-xs opacity-80">Best for immediate use. Data-driven estimates.</div>
              </div>
              <div
                onClick={() => setStrategy('static')}
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col items-center text-center ${strategy === 'static' ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-amber-500' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/60'}`}
              >
                <div className="font-bold mb-1">Static (Safer)</div>
                <div className="text-xs opacity-80">Best for long-term cold storage.</div>
              </div>
            </div>
          </div>

          {error && <div className="text-error text-sm text-center bg-error/10 p-3 rounded-lg border border-error/20">{error}</div>}

          {debugLogs.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl text-xs font-mono text-on-surface-variant max-h-32 overflow-y-auto border border-outline-variant/30 shadow-inner">
              {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          <button
            onClick={handleIssue}
            disabled={loading || !sats || mintUrls.length === 0}
            className="w-full btn-gradient text-on-primary font-bold py-4 rounded-full text-lg flex justify-center items-center shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Note'}
          </button>
        </div>
      </div>
    </main>
  );
};
