import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWalletStore } from '../store/wallet';
import { useNavigate } from 'react-router-dom';
import { parseBitcoinInput } from '../utils/bitcoinValidation';
import { validateLnurlPay } from './useLnurlValidation';
import { isCashuRequest } from '../services/cashuRequests';

export interface DecodedNoteInfo {
  sats?: number;
  amount: number;
  face_value_sats?: number;
  mint_url?: string;
  serial?: string;
  type?: string;
  [key: string]: unknown;
}

export interface NoteVerifyResult {
  success: boolean;
  status?: string;
  message?: string;
  proof_total_sats: number;
  face_value_sats: number;
  [key: string]: unknown;
}

export const useScan = () => {
  const [binB64, setBinB64] = useState<string>('');
  const [noteInfo, setNoteInfo] = useState<DecodedNoteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifyResult, setVerifyResult] = useState<NoteVerifyResult | null>(null);

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

    if (isCashuRequest(trimmed)) {
      navigate('/', { state: { ecashRequest: trimmed } });
      return;
    }

    if (lower.startsWith('cashua') || lower.startsWith('cashub')) {
      navigate('/', { state: { ecashToken: trimmed } });
      return;
    }

    const parsed = parseBitcoinInput(trimmed);
    if (parsed.type === 'lightning') {
      navigate('/', { state: { lnbcInvoice: parsed.addressOrInvoice } });
      return;
    }

    if (parsed.type === 'onchain') {
      navigate('/', {
        state: {
          lnbcInvoice: parsed.addressOrInvoice,
          onchainAmountSats: parsed.amountSats ?? undefined,
        },
      });
      return;
    }

    if (parsed.type === 'lnurl' || parsed.type === 'lnurl-pay') {
      // Validate the Lightning Address / LNURL before handing off to the send flow
      // (covers camera scans, which bypass the live check on the paste box).
      setLoading(true);
      const entry = await validateLnurlPay(parsed.addressOrInvoice);
      setLoading(false);
      if (entry.error) {
        // Put it in the paste box so the inline validation pill explains why
        setBinB64(trimmed);
        return;
      }
      navigate('/', { state: { lnbcInvoice: parsed.addressOrInvoice } });
      return;
    }

    setLoading(true);
    setError(null);
    setVerified(null);
    setNoteInfo(null);
    try {
      const res = await invoke<DecodedNoteInfo>('decode_bin', { binB64: trimmed });
      setNoteInfo(res);
      setBinB64(trimmed);
    } catch (e: unknown) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await invoke<NoteVerifyResult>('verify_note', { binB64 });
      if (res.success) {
        setVerified(true);
        setVerifyResult(res);
      }
    } catch (e: unknown) {
      setError("Verification failed: " + String(e));
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
        await invoke<void>('redeem_note_direct', { binB64 });
      } else {
        await invoke<void>('redeem_note', { binB64, invoice: invoice.trim() });
      }
      setRedeemSuccess(true);
      await refreshWallet();
    } catch (e: unknown) {
      setError("Redeem failed: " + String(e));
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
