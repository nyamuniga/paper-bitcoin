import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { useNavigate } from 'react-router-dom';
import { parseBitcoinInput } from '../utils/bitcoinValidation';

export const useScan = () => {
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
  const navigate = useNavigate();

  const handleDecode = async (base64Payload: string) => {
    if (!base64Payload) return;
    const trimmed = base64Payload.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('cashua') || lower.startsWith('cashub')) {
      navigate('/', { state: { ecashToken: trimmed } });
      return;
    }
    
    const parsed = parseBitcoinInput(trimmed);
    if (parsed.type === 'lightning' || parsed.type === 'onchain' || parsed.type === 'lnurl' || parsed.type === 'lnurl-pay') {
      navigate('/', { state: { lnbcInvoice: parsed.addressOrInvoice } });
      return;
    }

    setLoading(true);
    setError(null);
    setVerified(null);
    setNoteInfo(null);
    try {
      const res: any = await invoke('decode_bin', { binB64: trimmed });
      setNoteInfo(res);
      setBinB64(trimmed);
    } catch (e: any) {
      setError(e.toString());
    }
    setLoading(false);
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

  const [redeemMethod, setRedeemMethod] = useState<'lightning' | 'wallet'>('lightning');

  const handleRedeem = async () => {
    if (redeemMethod === 'lightning' && !invoice) return;
    setRedeeming(true);
    setError(null);
    try {
      if (redeemMethod === 'wallet') {
        await invoke('redeem_note_direct', { binB64 });
      } else {
        await invoke('redeem_note', { binB64, invoice: invoice.trim() });
      }
      setRedeemSuccess(true);
      await refreshWallet();
    } catch (e: any) {
      setError("Redeem failed: " + e.toString());
    }
    setRedeeming(false);
  };

  return {
    binB64,
    setBinB64,
    noteInfo,
    setNoteInfo,
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
  };
};
