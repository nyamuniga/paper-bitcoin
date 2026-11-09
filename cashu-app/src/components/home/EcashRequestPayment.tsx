import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Loader2 } from 'lucide-react';
import { parseCashuRequest, selectRequestMint, qrRequestTransport, paymentRequestKey } from '../../services/cashuRequests';
import { deliverQrPayment } from '../../services/qrPayment';
import type { CashuPaymentRequest } from '../../services/cashuRequests';
import { useWalletStore } from '../../store/wallet';
import { MintName } from '../shared/MintName';
import { MintIcon } from '../shared/MintIcon';

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

const secondaryButton = 'w-full min-h-11 px-4 py-2 rounded-xl text-[#a3b5aa] text-sm font-semibold hover:bg-surface-bright focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2';
const sats = (amount: number) => `${amount.toLocaleString()} ${amount === 1 ? 'sat' : 'sats'}`;

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
      setMessage('');
      return;
    }
    const mint = selectRequestMint(request, balances, mintUrl);
    const quote = await invoke<Quote>('ecash_payment_quote', { mintUrl: mint, amount: request.amount });
    if (!current(id)) return;
    setMerchant({ raw, request, mint, quote, key });
    setMessage('');
  };

  const reviewQr = (raw: string) => {
    onStartRequest();
    return run('Loading payment…', id => reviewRequest(raw, id));
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
      setMessage('Delivering payment…');
      await deliverQrPayment(prepared.token_v3, selected.request.id, qrRequestTransport(selected.request));
      if (current(id)) setMessage('Payment sent. Waiting for the recipient to claim it.');
    });
  };

  const qrDisabled = paused || busy;

  if (!initialRequest && !merchant && !error && !busy) return null;

  return <section className="flex flex-col gap-3 sm:gap-4" aria-label="Review ecash payment">
    {merchant && <>
      <div className="text-center py-1 sm:py-3">
        <h3 className="text-sm font-medium text-[#a3b5aa] mb-2">Review payment</h3>
        <p className={`${merchant.request.amount.toLocaleString().length > 9 ? 'text-[32px] sm:text-[40px]' : 'text-[42px] sm:text-[50px]'} font-display-hero font-extrabold leading-tight tracking-tight text-on-surface break-words`}>
          {merchant.request.amount.toLocaleString()} <span className="text-lg font-medium text-[#a3b5aa]">{merchant.request.amount === 1 ? 'sat' : 'sats'}</span>
        </p>
        {merchant.request.description && <p className="text-sm text-on-surface mt-1 break-words">{merchant.request.description}</p>}
      </div>
      <dl className="text-sm divide-y divide-outline-variant/15 border-y border-outline-variant/20">
        <div className="flex items-center justify-between gap-4 py-2.5 sm:py-3">
          <dt className="text-[#a3b5aa] shrink-0">From</dt>
          <dd className="flex items-center gap-2 min-w-0 text-on-surface font-medium">
            <MintIcon mintUrl={merchant.mint} className="w-5 h-5 rounded-full shrink-0" textClassName="text-primary text-[10px]"/>
            <MintName mintUrl={merchant.mint} className="truncate"/>
          </dd>
        </div>
        {merchant.quote && <>
          <div className="flex items-center justify-between gap-4 py-2.5 sm:py-3"><dt className="text-[#a3b5aa]">Fees</dt><dd className="text-on-surface tabular-nums">{merchant.quote.receiver_fee + merchant.quote.sender_fee === 0 ? 'No fees' : sats(merchant.quote.receiver_fee + merchant.quote.sender_fee)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-2.5 sm:py-3 font-semibold text-on-surface"><dt>Total you pay</dt><dd className="tabular-nums">{sats(merchant.quote.total)}</dd></div>
        </>}
      </dl>
      <details className="group text-xs text-[#a3b5aa]">
        <summary className="min-h-8 sm:min-h-9 flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">Payment details<ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180"/></summary>
        <dl className="space-y-2 pb-2">
          <div><dt className="font-medium text-on-surface">Mint address</dt><dd className="break-all mt-1">{merchant.mint}</dd></div>
          {merchant.quote && <><div className="flex justify-between gap-4"><dt>Recipient fee allowance</dt><dd className="shrink-0">{sats(merchant.quote.receiver_fee)}</dd></div><div className="flex justify-between gap-4"><dt>Mint fee</dt><dd className="shrink-0">{sats(merchant.quote.sender_fee)}</dd></div></>}
        </dl>
      </details>
      {merchant.prepared && <p className="text-xs text-[#a3b5aa]">This payment is saved in History. Retrying sends the same token without charging you again.</p>}
      <div className="flex flex-col gap-1 pt-1">
        <button type="button" className="btn-gradient w-full min-h-12 py-3.5 px-4 rounded-2xl text-on-primary text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={qrDisabled || (!merchant.quote && !merchant.prepared)} onClick={payMerchant}>{busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true"/>Sending payment…</> : merchant.prepared ? 'Retry delivery' : `Pay ${sats(merchant.quote!.total)}`}</button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => { stop(); setMerchant(null); setError(''); }}>Back</button>
      </div>
    </>}
    {message && <p role="status" className="text-xs text-[#a3b5aa] flex items-start gap-2 leading-relaxed">{busy && <Loader2 size={16} className="animate-spin shrink-0 mt-0.5" aria-hidden="true" />}{message}</p>}
    {busy && <button type="button" className={secondaryButton} onClick={stop}>Stop waiting</button>}
    {error && <p role="alert" className="text-sm text-error break-words">{error}</p>}
  </section>;
}
