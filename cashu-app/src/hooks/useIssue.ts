import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';

export const useIssue = () => {
  const [sats, setSats] = useState<string>('');
  const [mintUrls, setMintUrls] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<'dynamic' | 'static'>('dynamic');
  const [loading, setLoading] = useState(false);
  const [invoicePayload, setInvoicePayload] = useState<any>(null);
  const [issuedNote, setIssuedNote] = useState<any>(null);
  const [pollTrigger, setPollTrigger] = useState(0);
  const [error, setError] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const isCheckingRef = useRef(false);

  const addLog = (msg: string) => setDebugLogs(p => [...p, msg]);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

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
      setInvoicePayload(res); 
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

  return {
    sats,
    setSats,
    mintUrls,
    setMintUrls,
    strategy,
    setStrategy,
    loading,
    invoicePayload,
    issuedNote,
    error,
    setError,
    debugLogs,
    handleIssue,
    handleCheckStatus
  };
};
