import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2 } from 'lucide-react';
import { parseCashuRequest, selectRequestMint, qrRequestTransport, paymentRequestKey } from '../../services/cashuRequests';
import { deliverQrPayment } from '../../services/qrPayment';
import type { CashuPaymentRequest } from '../../services/cashuRequests';
import { useWalletStore } from '../../store/wallet';

interface PreparedPayment { token: string; token_v3?: string; tx_id: string; mint_url: string }
interface Quote { token_amount: number; receiver_fee: number; sender_fee: number; total: number }
interface Merchant {
  raw: string;
  request: CashuPaymentRequest;
  mint: string;
  quote?: Quote;
  prepared?: PreparedPayment;
  key: string;
}
interface Props {
  mintUrl: string;
  paused: boolean;
  onPrepared: (payment: PreparedPayment, amount: number) => void;
  onBusy: (busy: boolean) => void;
  onStartRequest: () => void;
  initialRequest?: string;
}

const button = 'min-h-11 px-3 py-2 rounded-xl border border-outline-variant/30 text-primary text-sm font-semibold hover:bg-surface-bright focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

export function EcashRequestPayment({ mintUrl, paused, onPrepared, onBusy, onStartRequest, initialRequest }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const sequence = useRef(0);
  const working = useRef(false);
  const alive = useRef(false);
  const balances = useWalletStore(s => s.mintBalances);

  const stop = () => {
    sequence.current++;
    working.current = false;
    setBusy(false);
    setMessage('');
  };

  useEffect(() => {
    alive.current = true;
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      sequence.current++;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => { if (paused) stop(); }, [paused]);
  useEffect(() => { onBusy(busy || merchant !== null); }, [busy, merchant, onBusy]);

  const run = async (label: string, action: (id: number) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    const id = ++sequence.current;
    setBusy(true);
    setError('');
    setMessage(label);
    try { await action(id); }
    catch (e) {
      if (alive.current && id === sequence.current) { setError(String(e)); setMessage(''); }
    } finally {
      if (alive.current && id === sequence.current) { working.current = false; setBusy(false); }
    }
  };
  const current = (id: number) => alive.current && id === sequence.current;
  const reviewRequest = async (raw: string, id: number) => {
    if (!current(id)) return;
    const request = parseCashuRequest(raw);
    qrRequestTransport(request); // Reject unsupported transports before preparing funds.
    const key = paymentRequestKey(request);
    const prepared = await invoke<PreparedPayment | null>('ecash_resume_payment', { request: key }) ||
      (key !== raw ? await invoke<PreparedPayment | null>('ecash_resume_payment', { request: raw }) : null);
    if (!current(id)) return;
    if (prepared) {
      setMerchant({ raw, request, mint: prepared.mint_url, prepared, key });
      onPrepared(prepared, request.amount);
      setMessage('Existing payment found. Retry its token rather than paying again.');
      return;
    }
    const mint = selectRequestMint(request, balances, mintUrl);
    const quote = await invoke<Quote>('ecash_payment_quote', { mintUrl: mint, amount: request.amount });
    if (!current(id)) return;
    setMerchant({ raw, request, mint, quote, key });
    setMessage('Review the amount and fees, then confirm payment.');
  };

  const reviewQr = (raw: string) => {
    onStartRequest();
    return run('Reading ecash payment request…', id => reviewRequest(raw, id));
  };
  useEffect(() => {
    if (!initialRequest) return;
    const timer = setTimeout(() => { void reviewQr(initialRequest); }, 0);
    return () => clearTimeout(timer);
  }, [initialRequest]);

  const payMerchant = () => {
    if (!merchant) return;
    const selected = merchant;
    return run('Preparing payment. Your token will be kept in History if delivery is interrupted.', async id => {
      let prepared = selected.prepared;
      if (!prepared) {
        if (!selected.quote) throw new Error('Scan the merchant request again.');
        const result = await invoke<{ token_v4: string; token_v3: string; tx_id: string }>('send_ecash', {
          mintUrl: selected.mint, amount: selected.request.amount, pubkey: selected.request.pubkey,
          paymentRequest: selected.key, paymentMaxTotal: selected.quote.total,
        });
        prepared = { token: result.token_v4, token_v3: result.token_v3, tx_id: result.tx_id, mint_url: selected.mint };
        await useWalletStore.getState().refreshWallet();
        if (!current(id)) return;
        setMerchant({ ...selected, prepared });
        onPrepared(prepared, selected.request.amount);
      }
      await invoke('ecash_validate_payment', { token: prepared.token, amount: selected.request.amount });
      if (!current(id)) return;
      if (!prepared.token_v3) throw new Error('The saved payment has no delivery token. Recover it in History.');
      setMessage('Delivering encrypted payment…');
      await deliverQrPayment(prepared.token_v3, selected.request.id, qrRequestTransport(selected.request));
      if (current(id)) setMessage('Payment accepted by a delivery relay. Waiting for the recipient to claim it.');
    });
  };

  const qrDisabled = paused || busy;

  if (!initialRequest && !merchant && !error && !busy) return null;

  return <div className="flex flex-col gap-3 mb-4">
    <div className="flex flex-wrap gap-2">
      {busy && <button type="button" className={button} onClick={stop}>Cancel payment</button>}
    </div>
    {merchant && <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-3 text-sm">
      <p className="font-semibold text-on-surface">{merchant.request.description || 'Merchant payment'} · {merchant.request.amount.toLocaleString()} sats</p>
      <p className="text-xs break-all text-on-surface-variant">Mint: {merchant.mint}</p>
      {merchant.quote && <p className="text-on-surface-variant">Recipient fee allowance: {merchant.quote.receiver_fee} sats · Mint swap fee: {merchant.quote.sender_fee} sats<br />Total debit: {merchant.quote.total.toLocaleString()} sats</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={qrDisabled} onClick={payMerchant}>{merchant.prepared ? 'Retry same payment token' : `Confirm ${merchant.quote?.total.toLocaleString()} sats & pay`}</button>
        <button type="button" className={button} disabled={busy} onClick={() => { stop(); setMerchant(null); setError(''); }}>Dismiss</button>
      </div>
    </div>}
    {message && <p role="status" className="text-sm text-on-surface-variant flex items-start gap-2">{busy && <Loader2 size={16} className="animate-spin shrink-0 mt-0.5" aria-hidden="true" />}{message}</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </div>;
}
