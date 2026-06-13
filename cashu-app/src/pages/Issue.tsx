import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWalletStore } from '../store/wallet';
import { CheckCircle, Loader2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';

export const Issue = () => {
  const [sats, setSats] = useState<string>('');
  const [mintUrls, setMintUrls] = useState<string[]>([]);
  const [newMint, setNewMint] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [invoicePayload, setInvoicePayload] = useState<any>(null);
  const [issuedNote, setIssuedNote] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  const addLog = (msg: string) => setDebugLogs(p => [...p, msg]);

  const balance = useWalletStore((s) => s.balanceSats);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  useEffect(() => {
    addLog("Registering invoice-ready listener...");
    const unlisten = listen('invoice-ready', (event: any) => {
      addLog("Received invoice-ready event: " + JSON.stringify(event.payload));
      setInvoicePayload(event.payload);
    });
    return () => {
      unlisten.then(f => f());
    };
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
      const res = await invoke('issue_note', { sats: amt, mintUrls: mintUrls });
      addLog("issue_note resolved with: " + JSON.stringify(res));
      setIssuedNote(res);
      await refreshWallet();
    } catch (e: any) {
      addLog("issue_note failed: " + String(e));
      setError(e.toString());
    }
    setLoading(false);
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
      <div className="p-4 mt-8 flex flex-col h-full">
        <div className="text-center mb-8">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Note Created!</h1>
          <p className="text-gray-400 mt-2">Face value: {issuedNote.face_value} sats</p>
        </div>
        
        <div className="bg-surface rounded-2xl p-6 border border-gray-800 flex-1">
          <div className="text-center text-sm text-gray-500 mb-2">Your Physical Note</div>
          <div className="bg-white p-2 rounded-xl inline-block mb-4 mx-auto w-full flex justify-center">
             <img src={`data:image/svg+xml;base64,${issuedNote.svg_b64}`} alt="Physical Note" className="max-w-[300px] w-full" />
          </div>
          
          {saveSuccess ? (
            <div className="w-full bg-green-500/10 text-green-500 font-bold py-4 rounded-xl text-lg mt-auto text-center border border-green-500/20">
              {saveSuccess}
            </div>
          ) : (
            <button 
              onClick={async () => {
                setSaving(true);
                setError('');
                try {
                  const svgText = atob(issuedNote.svg_b64);
                  const parser = new DOMParser();
                  const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
                  const svgElement = svgDoc.documentElement;
                  
                  const doc = new jsPDF({ orientation: 'landscape', format: [920, 420], unit: 'pt' });
                  await doc.svg(svgElement, { x: 0, y: 0, width: 920, height: 420 });
                  
                  const pdfDataUri = doc.output('datauristring');
                  const base64Data = pdfDataUri.split(',')[1];

                  const filename = `note-${issuedNote.face_value}-sats.pdf`;
                  await invoke('save_file_to_disk', { base64Data, filename });
                  setSaveSuccess(`Saved to Downloads as ${filename}`);
                } catch (e: any) {
                  setError(`Failed to save PDF: ${e}`);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="w-full bg-primary text-background font-bold py-4 rounded-xl text-lg mt-auto flex items-center justify-center disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin w-6 h-6" /> : 'Save Note as PDF'}
            </button>
          )}
          {error && <div className="text-red-400 text-sm mt-4 text-center">{error}</div>}
        </div>
      </div>
    );
  }

  if (invoicePayload) {
    return (
      <div className="p-4 mt-8">
        <h1 className="text-2xl font-bold mb-4">Pay Invoice</h1>
        <div className="bg-surface rounded-2xl p-6 border border-gray-800 text-center">
          <p className="text-gray-400 mb-4">Pay this invoice to fund the new note.</p>
          <div className="bg-white p-4 rounded-xl inline-block mb-4">
             <QRCode value={invoicePayload.invoice} size={192} />
          </div>
          <div className="text-2xl font-bold mb-2">{invoicePayload.total_sats} sats</div>
          <div className="text-xs text-gray-500 mb-6 truncate">{invoicePayload.invoice}</div>
          
          {balance >= invoicePayload.total_sats ? (
             <button onClick={handlePayFromWallet} disabled={loading} className="w-full bg-green-500 text-white font-bold py-4 rounded-xl text-lg flex justify-center items-center">
               {loading ? <Loader2 className="animate-spin" /> : 'Pay from Wallet Balance'}
             </button>
          ) : (
            <div className="text-red-400 text-sm">Insufficient wallet balance to auto-pay.</div>
          )}
          
          {loading && <div className="mt-4 text-sm text-gray-400 flex items-center justify-center"><Loader2 className="animate-spin w-4 h-4 mr-2" /> Waiting for payment...</div>}
          
          {error && <div className="text-red-400 text-sm mt-4 p-4 bg-red-500/10 rounded-xl text-left font-mono">{error}</div>}
          {debugLogs.length > 0 && (
            <div className="bg-black/50 p-4 rounded-xl mt-4 text-xs font-mono text-gray-400 max-h-32 overflow-y-auto text-left">
              {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 mt-8">
      <h1 className="text-2xl font-bold mb-4">Issue Note</h1>
      <div className="bg-surface rounded-2xl p-6 border border-gray-800">
        <label className="block text-gray-400 text-sm mb-2">Amount (sats)</label>
        <input 
          type="number" 
          value={sats}
          onChange={(e) => setSats(e.target.value)}
          className="w-full bg-background border border-gray-700 rounded-xl p-4 text-white mb-6 text-2xl font-bold text-center" 
          placeholder="0" 
        />
        
        <label className="block text-gray-400 text-sm mb-2">Mint URLs</label>
        {mintUrls.map((url, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <div className="w-full bg-surface-light border border-gray-700 rounded-xl p-4 text-gray-300 text-sm overflow-x-hidden truncate">{url}</div>
            {mintUrls.length > 1 && (
              <button onClick={() => setMintUrls(mintUrls.filter((_, idx) => idx !== i))} className="bg-red-500/20 text-red-500 px-4 rounded-xl font-bold">X</button>
            )}
          </div>
        ))}
        
        <div className="flex gap-2 mb-8 mt-2">
          <input 
            type="text" 
            value={newMint}
            onChange={(e) => setNewMint(e.target.value)}
            className="w-full bg-background border border-gray-700 rounded-xl p-4 text-gray-300 text-sm" 
            placeholder="Add another mint URL..."
          />
          <button 
            onClick={() => {
              if (newMint && !mintUrls.includes(newMint)) {
                setMintUrls([...mintUrls, newMint]);
                setNewMint('');
              }
            }}
            className="bg-surface-light border border-gray-700 text-white px-6 rounded-xl font-bold"
          >
            Add
          </button>
        </div>
        
        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
        
        {debugLogs.length > 0 && (
          <div className="bg-black/50 p-4 rounded-xl mb-4 text-xs font-mono text-gray-400 max-h-32 overflow-y-auto">
            {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        
        <button 
          onClick={handleIssue}
          disabled={loading || !sats || mintUrls.length === 0}
          className="w-full bg-primary text-background font-bold py-4 rounded-xl text-lg flex justify-center items-center disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Create Note'}
        </button>
      </div>
    </div>
  );
};
