import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Loader2, QrCode, Check } from 'lucide-react';
import { useEcashInvoice } from '../../hooks/useEcashInvoice';
import { AmountDisplay } from '../shared/AmountDisplay';
import { NumberPad } from '../shared/NumberPad';
import { SafeQRCode } from '../shared/SafeQRCode';
import { writeClipboardText } from '../../utils/clipboard';

const button = 'min-h-11 px-4 py-2 rounded-xl border border-outline-variant/30 text-primary font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary';

export function EcashReceiveInvoice({ mintUrl, onPaid, invoiceId, embedded = false, onStatusChange, actionsContainer }: { mintUrl: string; onPaid: (amount: number) => void; invoiceId?: string; embedded?: boolean; actionsContainer?: HTMLElement | null; onStatusChange?: (status: 'pending' | 'received' | 'paid') => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const state = useEcashInvoice(mintUrl, onPaid, invoiceId);
  const qrSize = embedded ? 170 : 220;
  const invoiceAmount = Number(amount);
  const canCreate = /^[0-9]+$/.test(amount) && Number.isSafeInteger(invoiceAmount) && invoiceAmount > 0 && !!mintUrl && !state.loading;
  const actionClass = embedded
    ? 'w-full py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl font-bold text-body-md transition-colors border border-primary/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'
    : button;
  const statusActions = <>
    {state.retryToken && !state.claiming && <button type="button" className={actionClass} onClick={state.retry}>Retry claiming payment</button>}
    <button type="button" className={actionClass} disabled={state.claiming || state.loading} onClick={state.checkStatus}>{state.loading ? <><Loader2 className="animate-spin" size={16}/>Checking…</> : 'Check status'}</button>
  </>;
  useEffect(() => {
    if (state.invoice && !state.loading) onStatusChange?.(state.paid ? 'paid' : state.retryToken ? 'received' : 'pending');
  }, [state.invoice?.id, state.loading, state.paid, state.retryToken, onStatusChange]);
  return <section className="flex flex-col gap-4" aria-label="Ecash receive invoice">
    {state.loading && !state.invoice ? <p role="status" className="text-sm text-on-surface-variant flex items-center gap-2"><Loader2 className="animate-spin" size={18}/>{invoiceId ? 'Loading saved request…' : 'Saving request…'}</p> : !state.invoice && invoiceId ? <button type="button" className={button} onClick={state.checkStatus}>Retry loading request</button> : !state.invoice ? <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={event => { event.preventDefault(); if (!canCreate) return; void state.create(invoiceAmount, description); setCopied(false); }}>
      <div role="status" aria-live="polite" aria-label="Requested amount in sats"><AmountDisplay amount={amount} compact /></div>
      <div role="group" aria-label="Invoice amount keypad"><NumberPad value={amount} onChange={setAmount} compact /></div>
      <label className="flex flex-col gap-1 mt-0.5"><span className="text-[11px] font-label-caps text-on-surface-variant ml-1">Description (optional)</span>
        <input maxLength={160} value={description} onChange={event => setDescription(event.target.value)} className="w-full bg-[#0c1b14] py-2.5 px-3 rounded-xl border border-[#142d20] text-[13px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary transition-colors" placeholder="What is the payment for?" />
      </label>
      <button type="submit" disabled={!canCreate} className={`btn-gradient w-full py-3.5 sm:py-4 rounded-2xl text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${canCreate ? 'cursor-pointer hover:opacity-90 active:scale-[0.98]' : 'opacity-50 cursor-not-allowed'}`}>Create invoice</button>
    </form> : <>
      {!embedded && <div className="text-center"><p className="text-3xl font-semibold text-on-surface">{state.invoice.amount.toLocaleString()} <span className="text-base text-on-surface-variant">sats</span></p>{state.description && <p className="text-sm text-on-surface-variant mt-1">{state.description}</p>}</div>}
      {(!state.paid || !embedded) && <div className="self-center bg-white p-3.5 rounded-2xl shadow-xl">
        {state.paid ? <div style={{width:qrSize,height:qrSize}} className=" flex flex-col items-center justify-center gap-3 text-emerald-800"><Check size={36}/><p>Payment confirmed</p></div> : state.retryToken ? <div style={{width:qrSize,height:qrSize}} className=" flex flex-col items-center justify-center gap-3 text-gray-700 text-sm text-center"><p>Payment token received</p><p>{state.claiming ? 'Waiting for mint confirmation…' : 'Retry claiming below.'}</p></div>
          : state.qrReady ? <SafeQRCode value={state.invoice.qr} size={qrSize} /> : <div style={{width:qrSize,height:qrSize}} className=" flex flex-col items-center justify-center gap-3 text-gray-700 text-sm text-center"><QrCode size={32} /><p>{state.error ? 'QR delivery unavailable. Check your connection.' : 'Connecting QR payment delivery…'}</p></div>}
      </div>}
      {!state.retryToken && !state.paid && <p className="text-xs text-center text-on-surface-variant">Scan with a wallet supporting Cashu payment requests. QR payments need internet access.</p>}
      {!state.paid && <button type="button" className={button} disabled={!state.qrReady || state.claiming || !!state.retryToken} onClick={async () => { setCopied(await writeClipboardText(state.invoice!.qr)); }}><Copy size={16} className="inline mr-2" />{copied ? 'Invoice copied' : 'Copy invoice'}</button>}
      {!embedded && statusActions}
      {!invoiceId && <button type="button" className={button} disabled={state.claiming || state.loading} onClick={state.newRequest}>New request</button>}
      {!embedded && <p className="text-xs text-on-surface-variant text-center">Saved in History. You can close this screen and return later.</p>}
    </>}
    {embedded && actionsContainer && createPortal(statusActions, actionsContainer)}
    {state.message && <p role="status" className="text-sm text-on-surface-variant">{state.claiming && <Loader2 size={16} className="inline animate-spin mr-2" />}{state.message}</p>}
    {state.deliveryDetails.length > 0 && <details className="text-xs text-on-surface-variant break-words"><summary className="cursor-pointer min-h-8 py-2">Connection details</summary><ul>{state.deliveryDetails.map(detail => <li key={detail}>{detail}</li>)}</ul></details>}
    {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
  </section>;
}
