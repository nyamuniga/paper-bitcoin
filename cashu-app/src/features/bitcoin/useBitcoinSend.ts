import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { parseBitcoinInput } from '../../utils/bitcoinValidation';
import type { LnurlValidationResult } from '../../hooks/useLnurlValidation';
import type { LnurlPayParams } from '../../services/lnurlService';
import type { OnchainLimits, OnchainSendEstimate } from '../../services/sparkService';

export interface BitcoinSendOptions {
  active: boolean;
  mintUrl: string;
  availableBalance: number;
  busy: boolean;
  limits: OnchainLimits | null;
  initialInvoice?: string;
  initialAmountSats?: number;
  readClipboard: () => Promise<string | null>;
  readValidation: (destination: string) => LnurlValidationResult | null;
  resolveLnurl: (destination: string) => Promise<{ params: LnurlPayParams | null; error: string | null } | null>;
  fetchInvoice: (callback: string, millisats: number) => Promise<{ pr: string } | null>;
  payInvoice: (invoice: string, mint: string, onError: (message: string) => void) => Promise<boolean>;
  estimate: (destination: string, amount: number, mint: string, onError: (message: string) => void) => Promise<OnchainSendEstimate | null>;
  execute: (estimate: OnchainSendEstimate, destination: string, mint: string, onError: (message: string) => void) => Promise<{ txid: string } | null>;
  onError: (message: string) => void;
  recordSuccessfulUse: (type: 'lightning' | 'onchain', destination: string) => void;
}

interface Entry { destination: string; amount: string; step: 'input' | 'amount' | 'confirm' }
interface Context { epoch: number; mint: string }
interface Review extends Context { estimate: OnchainSendEstimate; destination: string; amountInput: string }
type Intent =
  | { kind: 'lightning'; invoice: string; amountSats?: number }
  | { kind: 'lnurl'; params: LnurlPayParams; destination: string; amountSats: number }
  | { kind: 'onchain'; estimate: OnchainSendEstimate; destination: string; amountSats: number };
interface Attempt { context: Context; intent: Intent; status: 'pending' | 'success' | 'failed' }
interface Payment {
  status: 'success' | 'failed' | null;
  error: string;
  amountSats?: number;
  recipient?: string;
  title?: string;
  txid?: string;
}
const emptyPayment: Payment = { status: null, error: '' };
const describe = (error: unknown, fallback: string) => error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;

/** Owns the foreground send session. Retirement cannot undo an already-dispatched payment. */
export function useBitcoinSend(options: BitcoinSendOptions) {
  const latest = useRef(options);
  latest.current = options;
  const initial = parseBitcoinInput(options.initialInvoice ?? '');
  const prefill = options.initialAmountSats ?? initial.amountSats;
  const [entry, setEntry] = useState<Entry>(() => ({
    destination: initial.type === 'onchain' ? initial.addressOrInvoice : options.initialInvoice ?? '',
    amount: prefill && prefill > 0 ? String(prefill) : '', step: initial.type === 'onchain' ? 'amount' : 'input',
  }));
  const input = useRef(entry);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const context = useRef({ active: options.active, mint: options.mintUrl });
  const inFlight = useRef<Context | null>(null);
  const review = useRef<Review | null>(null);
  const params = useRef<{ destination: string; value: LnurlPayParams } | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const pasteSequence = useRef(0);
  const [estimate, setEstimate] = useState<OnchainSendEstimate | null>(null);
  const [payment, setPayment] = useState<Payment>(emptyPayment);
  const [fetching, setFetching] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [paying, setPaying] = useState(false);

  const updateEntry = useCallback((patch: Partial<Entry>) => {
    input.current = { ...input.current, ...patch };
    if (mounted.current) setEntry(input.current);
  }, []);
  const cancel = useCallback(() => {
    epoch.current++;
    review.current = null;
    attempt.current = null;
    if (mounted.current) {
      setEstimate(null);
      setPayment(emptyPayment);
      if (input.current.step === 'confirm') updateEntry({ step: 'amount' });
    }
  }, [updateEntry]);
  const isCurrent = useCallback((token: Context) => mounted.current && latest.current.active
    && token.mint === latest.current.mintUrl && token.epoch === epoch.current, []);
  const canStartOperation = useCallback(() => mounted.current && latest.current.active && Boolean(latest.current.mintUrl)
    && !latest.current.busy && !inFlight.current, []);
  const acquire = useCallback(() => {
    if (!canStartOperation()) return null;
    const token = { epoch: epoch.current, mint: latest.current.mintUrl };
    inFlight.current = token;
    return token;
  }, [canStartOperation]);
  const release = useCallback((token: Context) => {
    if (inFlight.current !== token) return;
    inFlight.current = null;
    if (mounted.current) { setFetching(false); setEstimating(false); setPaying(false); }
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);
  useLayoutEffect(() => {
    if (context.current.active !== options.active || context.current.mint !== options.mintUrl) cancel();
    context.current = { active: options.active, mint: options.mintUrl };
  }, [options.active, options.mintUrl, cancel]);

  const changeDestination = useCallback((destination: string) => {
    if (!mounted.current) return;
    cancel(); params.current = null; updateEntry({ destination, step: 'input' });
  }, [cancel, updateEntry]);
  const changeAmount = useCallback((amount: string) => {
    if (!mounted.current) return;
    cancel(); updateEntry({ amount, step: 'amount' });
  }, [cancel, updateEntry]);
  const reset = useCallback(() => {
    if (!mounted.current) return;
    cancel(); params.current = null; updateEntry({ destination: '', step: 'input' });
  }, [cancel, updateEntry]);
  const back = useCallback(() => {
    if (!mounted.current) return;
    const previous = input.current.step;
    cancel(); updateEntry({ step: previous === 'confirm' ? 'amount' : 'input' });
  }, [cancel, updateEntry]);

  const paste = useCallback(async () => {
    if (!mounted.current || !latest.current.active) return;
    const token = { epoch: epoch.current, mint: latest.current.mintUrl };
    const sequence = ++pasteSequence.current;
    try {
      const text = await latest.current.readClipboard();
      if (text && isCurrent(token) && sequence === pasteSequence.current) changeDestination(text.trim());
    } catch (error) {
      if (isCurrent(token) && sequence === pasteSequence.current) console.warn('Clipboard read failed', error);
    }
  }, [changeDestination, isCurrent]);

  const nextInput = useCallback(async () => {
    if (!canStartOperation() || input.current.step !== 'input') return;
    const parsed = parseBitcoinInput(input.current.destination);
    if (parsed.type === 'onchain') { updateEntry({ step: 'amount' }); return; }
    if (parsed.type !== 'lnurl' && parsed.type !== 'lnurl-pay') return;
    const token = acquire();
    if (!token) return;
    setFetching(true);
    try {
      const validation = latest.current.readValidation(parsed.addressOrInvoice);
      const result = validation?.status === 'valid' && validation.params
        ? { params: validation.params, error: null } : await latest.current.resolveLnurl(parsed.addressOrInvoice);
      if (!isCurrent(token)) return;
      if (!result?.params || result.error) { latest.current.onError(result?.error || 'Invalid Lightning address'); return; }
      params.current = { destination: parsed.addressOrInvoice, value: { ...result.params } };
      const fixed = result.params.minSendable === result.params.maxSendable;
      updateEntry({ step: 'amount', ...(fixed ? { amount: String(Math.floor(result.params.minSendable / 1000)) } : {}) });
    } catch (error) {
      if (isCurrent(token)) latest.current.onError(describe(error, 'Invalid Lightning address'));
    } finally { release(token); }
  }, [canStartOperation, acquire, isCurrent, release, updateEntry]);

  const runPayment = useCallback(async (intent: Intent, retrying?: Attempt) => {
    if (retrying ? attempt.current !== retrying || retrying.status !== 'failed' || !isCurrent(retrying.context) : Boolean(attempt.current)) return;
    const token = acquire();
    if (!token) return;
    const currentAttempt: Attempt = { context: token, intent, status: 'pending' };
    attempt.current = currentAttempt;
    const recipient = intent.kind === 'lightning' ? undefined : intent.destination;
    const details = { amountSats: intent.amountSats, recipient, title: 'Payment sent' };
    setPayment({ ...emptyPayment, ...details });
    let mintError = '';
    try {
      let success = false;
      let txid: string | undefined;
      if (intent.kind === 'onchain') {
        setPaying(true);
        const result = await latest.current.execute(intent.estimate, intent.destination, token.mint,
          message => { if (isCurrent(token)) latest.current.onError(message); });
        txid = result?.txid;
        success = Boolean(txid);
      } else {
        let invoice = intent.kind === 'lightning' ? intent.invoice : '';
        if (intent.kind === 'lnurl') {
          setFetching(true);
          const result = await latest.current.fetchInvoice(intent.params.callback, intent.amountSats * 1000);
          // Preparation can be retired; never dispatch a payment for a retired invoice request.
          if (!isCurrent(token)) return;
          if (!result) throw new Error('LNURL payment failed.');
          invoice = result.pr;
        }
        setPaying(true);
        success = await latest.current.payInvoice(invoice, token.mint, message => { mintError = message; });
      }
      currentAttempt.status = success ? 'success' : 'failed';
      if (success && intent.kind !== 'lightning') {
        // Successful contact usage is durable bookkeeping for the captured destination.
        try { latest.current.recordSuccessfulUse(intent.kind === 'onchain' ? 'onchain' : 'lightning', intent.destination); }
        catch (error) { console.warn('Failed to record successful contact use:', error); }
      }
      if (isCurrent(token)) setPayment({ ...details, status: success ? 'success' : 'failed', txid,
        error: success ? '' : intent.kind === 'onchain' ? 'On-chain transaction execution failed.' : mintError || 'The mint could not complete this payment.' });
    } catch (error) {
      currentAttempt.status = 'failed';
      const fallback = intent.kind === 'onchain' ? 'On-chain transaction failed.' : intent.kind === 'lnurl' ? 'LNURL payment failed.' : 'The mint could not complete this payment.';
      if (isCurrent(token)) setPayment({ ...details, status: 'failed', error: describe(error, fallback) });
    } finally {
      // Cancellation retires UI ownership; the dispatch lock stays held until the adapter settles.
      release(token);
    }
  }, [acquire, isCurrent, release]);

  const payLightning = useCallback(async () => {
    if (input.current.step !== 'input') return;
    const parsed = parseBitcoinInput(input.current.destination);
    if (parsed.type !== 'lightning' || !parsed.addressOrInvoice
      || (parsed.amountSats !== null && parsed.amountSats > latest.current.availableBalance)) return;
    await runPayment({ kind: 'lightning', invoice: parsed.addressOrInvoice, amountSats: parsed.amountSats || undefined });
  }, [runPayment]);
  const nextAmount = useCallback(async () => {
    if (!canStartOperation() || input.current.step !== 'amount') return;
    const amount = parseInt(input.current.amount) || 0;
    if (amount <= 0) return;
    if (amount > latest.current.availableBalance) { latest.current.onError('Insufficient balance to send this amount'); return; }
    const parsed = parseBitcoinInput(input.current.destination);
    if (parsed.type === 'onchain') {
      const min = latest.current.limits?.min_sats ?? 2500, max = latest.current.limits?.max_sats ?? 100000000;
      if (amount < min) { latest.current.onError(`Minimum on-chain send is ${min.toLocaleString()} sats`); return; }
      if (amount > max) { latest.current.onError(`Maximum on-chain send is ${max.toLocaleString()} sats`); return; }
      const token = acquire();
      if (!token) return;
      setEstimating(true);
      try {
        const result = await latest.current.estimate(parsed.addressOrInvoice, amount, token.mint,
          message => { if (isCurrent(token)) latest.current.onError(message); });
        if (isCurrent(token) && result) {
          const accepted = { ...result };
          review.current = { ...token, estimate: accepted, destination: parsed.addressOrInvoice, amountInput: input.current.amount };
          setEstimate(accepted); updateEntry({ step: 'confirm' });
        }
      } catch (error) {
        if (isCurrent(token)) latest.current.onError(describe(error, 'Estimation failed'));
      } finally { release(token); }
    } else if (params.current?.destination === parsed.addressOrInvoice) {
      await runPayment({ kind: 'lnurl', destination: parsed.addressOrInvoice, amountSats: amount, params: { ...params.current.value } });
    }
  }, [canStartOperation, acquire, isCurrent, release, runPayment, updateEntry]);
  const confirm = useCallback(async () => {
    const approved = review.current;
    if (input.current.step !== 'confirm' || !approved || !isCurrent(approved)
      || approved.destination !== parseBitcoinInput(input.current.destination).addressOrInvoice || approved.amountInput !== input.current.amount) return;
    await runPayment({ kind: 'onchain', estimate: approved.estimate, destination: approved.destination, amountSats: approved.estimate.amount });
  }, [isCurrent, runPayment]);
  const retry = useCallback(async () => {
    const previous = attempt.current;
    if (previous?.status === 'failed') await runPayment(previous.intent, previous);
  }, [runPayment]);
  const dismissPayment = useCallback(() => {
    if (!mounted.current) return;
    // Go back after failure leaves the existing send action usable; success remains consumed.
    if (attempt.current?.status === 'failed') attempt.current = null;
    setPayment(previous => ({ ...previous, status: null }));
  }, []);
  const parsedInput = parseBitcoinInput(entry.destination);
  return {
    destination: entry.destination, amount: entry.amount, step: entry.step, parsedInput,
    isLnurlInput: parsedInput.type === 'lnurl' || parsedInput.type === 'lnurl-pay',
    isInsufficient: parsedInput.type === 'lightning' && parsedInput.amountSats !== null && parsedInput.amountSats > options.availableBalance,
    estimate: review.current && isCurrent(review.current) ? estimate : null, payment, fetching, estimating, paying,
    changeDestination, changeAmount, paste, nextInput, nextAmount, payLightning, confirm, retry, dismissPayment, back, reset, cancel,
  };
}
