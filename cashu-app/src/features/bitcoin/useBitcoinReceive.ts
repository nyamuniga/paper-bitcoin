import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BitcoinReceiveMode } from './BitcoinReceive';

interface LightningResult { quoteId: string; receiveInvoice: string }
interface OnchainResult { boardingAddress: string; amountSats?: number; estimatedFeeSats?: number; quoteId?: string }
interface ReceiveTransaction { id: string; status: string; amount?: number }

export interface BitcoinReceiveOptions {
  active: boolean;
  mintUrl: string;
  busy: boolean;
  limits: { min_sats: number; max_sats: number } | null;
  transactions: readonly ReceiveTransaction[];
  receiveLightning: (amount: number, mint: string, onError: (error: unknown) => void) => Promise<LightningResult | null>;
  receiveOnChain: (amount: number, mint: string, onError: (error: unknown) => void) => Promise<OnchainResult | null>;
  copyText: (text: string) => Promise<unknown>;
  onCopied: (type: string) => void;
  onCopyError: () => void;
  onRequestError: (error: unknown) => void;
  onReceived: (amount: number | undefined) => void;
  onReset: () => void;
}

interface Context { epoch: number; mint: string }
interface ReceiveOutput extends Context {
  amountSats: number;
  quoteId: string | null;
  invoice: string | null;
  address: string | null;
  depositSats: number | null;
  feeEstimateSats: number | null;
}

/** Owns the displayed receive session, not cancellation of already-dispatched provider work. */
export function useBitcoinReceive(options: BitcoinReceiveOptions) {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(false);
  const epoch = useRef(0);
  const context = useRef({ active: options.active, mint: options.mintUrl });
  const inFlight = useRef<Context | null>(null);
  const notified = useRef<ReceiveOutput | null>(null);
  const outputRef = useRef<ReceiveOutput | null>(null);
  const copySequence = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef({ mode: 'lightning' as BitcoinReceiveMode, amount: '' });
  const [entry, setEntry] = useState(input.current);
  const [output, setOutput] = useState<ReceiveOutput | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState({ copied: false, type: null as string | null });

  const clearCopy = useCallback(() => {
    copySequence.current++;
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = null;
  }, []);
  const cancel = useCallback(() => {
    epoch.current++;
    outputRef.current = null;
    notified.current = null;
    clearCopy();
    if (mounted.current) {
      setOutput(null);
      setFeedback({ copied: false, type: null });
      latest.current.onReset();
    }
  }, [clearCopy]);
  const isCurrent = useCallback((candidate: Context) => mounted.current && latest.current.active
    && latest.current.mintUrl === candidate.mint && epoch.current === candidate.epoch, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);
  useLayoutEffect(() => {
    const previous = context.current;
    if (previous.active !== options.active || previous.mint !== options.mintUrl) cancel();
    context.current = { active: options.active, mint: options.mintUrl };
  }, [options.active, options.mintUrl, cancel]);

  const changeMode = useCallback((mode: BitcoinReceiveMode) => {
    if (!mounted.current) return;
    cancel();
    input.current = { mode, amount: '' };
    setEntry(input.current);
  }, [cancel]);
  const changeAmount = useCallback((amount: string) => {
    if (!mounted.current) return;
    cancel();
    input.current = { ...input.current, amount };
    setEntry(input.current);
  }, [cancel]);
  const reset = useCallback(() => {
    if (!mounted.current) return;
    cancel();
    input.current = { ...input.current, amount: '' };
    setEntry(input.current);
  }, [cancel]);

  const request = useCallback(async () => {
    const current = latest.current;
    const { mode, amount } = input.current;
    const amountSats = parseInt(amount) || 0;
    const min = current.limits?.min_sats ?? 2500;
    const max = current.limits?.max_sats ?? 100000000;
    if (!mounted.current || !current.active || !current.mintUrl || current.busy || inFlight.current
      || amountSats <= 0 || (mode === 'onchain' && (amountSats < min || amountSats > max))) return;

    cancel();
    const token = { epoch: epoch.current, mint: current.mintUrl };
    if (!isCurrent(token) || latest.current.busy) return;
    inFlight.current = token;
    setRequesting(true);
    const reportError = (error: unknown) => {
      if (isCurrent(token)) latest.current.onRequestError(error);
    };
    try {
      let accepted: ReceiveOutput | null = null;
      if (mode === 'onchain') {
        const result = await current.receiveOnChain(amountSats, token.mint, reportError);
        if (result) accepted = { ...token, amountSats, quoteId: result.quoteId ?? null, invoice: null,
          address: result.boardingAddress, depositSats: result.amountSats || amountSats, feeEstimateSats: result.estimatedFeeSats ?? null };
      } else {
        const result = await current.receiveLightning(amountSats, token.mint, reportError);
        if (result) accepted = { ...token, amountSats, quoteId: result.quoteId, invoice: result.receiveInvoice,
          address: null, depositSats: null, feeEstimateSats: null };
      }
      if (isCurrent(token) && accepted) {
        outputRef.current = accepted;
        setOutput(accepted);
      }
    } catch (error) {
      reportError(error);
    } finally {
      // Retired calls still hold the dispatch guard until the non-abortable adapter settles.
      if (inFlight.current === token) {
        inFlight.current = null;
        if (mounted.current) setRequesting(false);
      }
    }
  }, [cancel, isCurrent]);

  const copy = useCallback(async (text: string, type = 'text') => {
    const currentOutput = outputRef.current;
    if (!text || !currentOutput || !isCurrent(currentOutput)) return;
    clearCopy();
    const sequence = copySequence.current;
    setFeedback({ copied: false, type: null });
    const currentCopy = () => isCurrent(currentOutput) && sequence === copySequence.current;
    try {
      await latest.current.copyText(text);
      if (!currentCopy()) return;
      setFeedback({ copied: true, type });
      latest.current.onCopied(type);
      if (!currentCopy()) return;
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null;
        if (currentCopy()) setFeedback({ copied: false, type: null });
      }, 2000);
    } catch {
      if (currentCopy()) latest.current.onCopyError();
    }
  }, [clearCopy, isCurrent]);

  const visibleOutput = output && isCurrent(output) ? output : null;
  const transaction = visibleOutput?.quoteId ? options.transactions.find(tx => tx.id === visibleOutput.quoteId) : undefined;
  const success = transaction?.status === 'Success';
  useEffect(() => {
    if (visibleOutput && success && notified.current !== visibleOutput && isCurrent(visibleOutput)) {
      notified.current = visibleOutput;
      latest.current.onReceived(visibleOutput.amountSats || transaction?.amount);
    }
  }, [visibleOutput, success, transaction?.amount, isCurrent]);

  const amountSats = parseInt(entry.amount) || 0;
  const minOnchainSats = options.limits?.min_sats ?? 2500;
  const maxOnchainSats = options.limits?.max_sats ?? 100000000;
  const requestDisabled = !options.active || !options.mintUrl || options.busy || requesting || amountSats <= 0
    || (entry.mode === 'onchain' && (amountSats < minOnchainSats || amountSats > maxOnchainSats));
  return {
    mode: entry.mode, amount: entry.amount, amountSats, quoteId: visibleOutput?.quoteId ?? null,
    invoice: visibleOutput?.invoice ?? null, address: visibleOutput?.address ?? null,
    depositSats: visibleOutput?.depositSats ?? null, feeEstimateSats: visibleOutput?.feeEstimateSats ?? null,
    success, requesting, requestDisabled, minOnchainSats, maxOnchainSats,
    copied: Boolean(visibleOutput && feedback.copied), copiedType: visibleOutput ? feedback.type : null,
    changeMode, changeAmount, request, cancel, reset, copy,
  };
}
