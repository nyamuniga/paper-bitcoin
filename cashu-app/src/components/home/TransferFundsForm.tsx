import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpDown, Bitcoin, Check, ChevronRight, Delete, DollarSign, Loader2 } from 'lucide-react';
import { SovereignStampOverlay } from '../shared/SovereignStampOverlay';
import { PageHeader } from '../shared/PageHeader';
import { useWalletStore } from '../../store/wallet';
import { useCurrencyStore } from '../../store/currencyStore';
import { useTransferAvailability } from '../../hooks/useTransferAvailability';
import { cancelConversion, checkStableConversion, executeStableConversion, executeFundingReturn, getActiveConversion, quoteFundingReturn, reviewStableTransfer, recoverPendingConversion } from '../../services/stableBalanceService';
import { decodeQuote, formatUnits, parseUnits, USD_DECIMALS } from '../../services/stableBalanceModel';
import { dollarAmount, estimateTransferOutput, percentageAmount, TransferMinimumError } from '../../services/transferAmount';
import type { StableDirection, StableOperation } from '../../services/stableBalanceModel';
import type { PrepareSendPaymentResponse } from '@breeztech/breez-sdk-spark/web';
import { TransferPendingError, TransferFailedError, transferErrorDetails, transferErrorMessage } from '../../services/transferError';
import './TransferFundsForm.css';

interface Props { initialDirection?: StableDirection; mintUrl: string; cashuBalance: number; stableBalance: bigint | null; onClose: () => void; onDone: () => void; onChange: () => void }
const stages: Record<string, string> = { funding: 'Preparing your Bitcoin', funded: 'Your Bitcoin is ready', converting: 'Your transfer is processing', settling: 'Adding Bitcoin to your balance', returning: 'Returning Bitcoin to your balance' };
function money(units: bigint, dollars: boolean): string {
  if (!dollars) return `${units.toLocaleString()} sats`;
  const [whole, fraction = ''] = formatUnits(units, USD_DECIMALS).split('.');
  return `$${whole}.${fraction.padEnd(2, '0')}`;
}

export function TransferFundsForm({initialDirection = 'toUsd', mintUrl, cashuBalance, stableBalance, onClose, onDone, onChange}: Props) {
  const [direction, setDirection] = useState<StableDirection>(initialDirection);
  const [amount, setAmount] = useState('');
  const [selectedPercent, setSelectedPercent] = useState<number | null>(null);
  const [operation, setOperation] = useState<StableOperation | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [progressDetails, setProgressDetails] = useState('');
  const [checkingProgress, setCheckingProgress] = useState(false);
  const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);
  const usdRate = useCurrencyStore(s => s.rates.USD);
  const fetchRates = useCurrencyStore(s => s.fetchRates);
  useEffect(() => {
    let live = true;
    void getActiveConversion().then(op => { if (live) { setOperation(op); if (op) setDirection(op.direction); } }).catch(e => { if (live) setError(transferErrorDetails(e)); }).finally(() => { if (live) setBusy(false); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  useEffect(() => { if (!usdRate) void fetchRates(); }, [usdRate, fetchRates]);
  const run = async (work: () => Promise<StableOperation | void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setProgressDetails('');
    try {
      const next = await work() ?? await getActiveConversion();
      setOperation(next);
      // Celebrate only a confirmed completion, never a quote or pending payment.
      if (next?.stage === 'complete') setShowSuccess(true);
    }
    catch (e) {
      if (e instanceof TransferPendingError) {
        setProgressDetails(e.message);
        if (e.operation) setOperation(e.operation);
      } else {
        setError(e instanceof TransferMinimumError ? `Enter at least ${money(e.minimum, direction === 'toSats')}${e.includesFees ? ', including fees' : ', plus fees'}.` : transferErrorDetails(e));
      }
      try {
        const saved = await getActiveConversion();
        if (saved || !(e instanceof TransferPendingError)) setOperation(saved);
      } catch { /* Keep the saved stage visible. */ }
    } finally { busyRef.current = false; setBusy(false); void useWalletStore.getState().refreshWallet(); onChange(); }
  };
  const monitoredId = operation?.id;
  const monitoredStage = operation?.stage;
  useEffect(() => {
    if (busy || error || !monitoredId || !monitoredStage || !['funding', 'converting', 'settling', 'returning'].includes(monitoredStage)) return;
    let live = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(check, Math.min(15000, 1000 * 2 ** Math.min(attempts++, 4))); };
    const check = async () => {
      if (!live) return;
      if (document.hidden || busyRef.current) { schedule(); return; }
      busyRef.current = true;
      setCheckingProgress(true);
      let failed = false;
      try {
        // Reconcile only the saved payment/receipt. Never repeat funding or sendPayment.
        const next = await checkStableConversion(monitoredId);
        if (!live) return;
        setOperation(next);
        setProgressDetails('');
        if (next.stage === 'complete') setShowSuccess(true);
        if (['complete', 'refunded', 'funded'].includes(next.stage)) {
          void useWalletStore.getState().refreshWallet();
          onChange();
        }
      } catch (failure) {
        if (!live) return;
        if (failure instanceof TransferFailedError) {
          failed = true;
          setError(transferErrorDetails(failure));
        } else setProgressDetails(transferErrorDetails(failure));
      } finally {
        busyRef.current = false;
        if (live) {setCheckingProgress(false); if (!failed) schedule();}
      }
    };
    schedule();
    return () => {live = false;clearTimeout(timer);};
  }, [monitoredId, monitoredStage, busy, error, onChange]);
  const toDollars = direction === 'toUsd';
  const sourceDecimals = toDollars ? 0 : USD_DECIMALS;
  const sourceBalance = toDollars ? BigInt(cashuBalance) : stableBalance;
  let sourceAmount = 0n;
  try { sourceAmount = parseUnits(amount, sourceDecimals); } catch { /* Empty or incomplete input. */ }
  const estimate = estimateTransferOutput(direction, sourceAmount, usdRate);
  const insufficient = sourceBalance !== null && sourceAmount > sourceBalance;
  const availability = useTransferAvailability({enabled:!busy && !operation, direction, mintUrl, cashuBalance, sourceBalance, sourceAmount, estimate});
  const suggestedMinimum = availability.minimumError?.minimum ?? availability.minimum;
  const displayEstimate = availability.quote ? BigInt(availability.quote.output_amount) : estimate;
  const constraintMessage = availability.limitsFailed ? 'Transfer limits unavailable. Retry to check what you can transfer.' : !availability.limitsReady ? 'Checking transfer limits…' : availability.minimum ? `Minimum ${money(availability.minimum, !toDollars)} + fees. Maximum ${sourceBalance === null ? 'not available' : money(sourceBalance, !toDollars)}.` : `Maximum ${sourceBalance === null ? 'not available' : money(sourceBalance, !toDollars)}. Minimum checked with your quote.`;
  let amountMessage = '';
  if (insufficient) amountMessage = `Enter ${money(sourceBalance!, !toDollars)} or less.`;
  else if (suggestedMinimum !== null && sourceBalance !== null && suggestedMinimum > sourceBalance) amountMessage = `Your balance is below ${money(suggestedMinimum, !toDollars)}${availability.minimumError?.includesFees ? ' including fees' : ' plus fees'}. Add funds or switch balances.`;
  else if (availability.minimumError) amountMessage = availability.minimumError.includesFees ? `This amount won’t cover the minimum and fees. Try ${money(availability.minimumError.minimum, !toDollars)} or more.` : `Enter at least ${money(availability.minimumError.minimum, !toDollars)}, plus fees.`;
  else if (availability.belowMinimum) amountMessage = `Enter at least ${money(availability.minimum!, !toDollars)}, plus fees.`;
  else if (availability.checking && sourceAmount > 0n) amountMessage = 'Getting a live rate and transfer fees…';
  else if (availability.expired) amountMessage = 'This quote expired. Check again for the current amount and fees.';
  else if (availability.quoteError) amountMessage = transferErrorMessage(transferErrorDetails(availability.quoteError), 'quote');
  else if (availability.quote) amountMessage = 'Amount checked. Fees are included in your quote.';
  const canReview = !!availability.quote && !availability.checking && !availability.quoteError && !insufficient && !availability.belowMinimum;
  const retryAvailability = availability.limitsFailed || !!availability.quoteError && !availability.minimumError || availability.expired;

  const setInput = (value: string) => {
    if (value.length > 18 || !/^\d*(?:\.\d*)?$/.test(value) || (toDollars && value.includes('.')) || (value.split('.')[1]?.length ?? 0) > USD_DECIMALS) return;
    setAmount(value.startsWith('.') ? '0' + value : value); setSelectedPercent(null); setError('');
  };
  const key = (value: string) => {
    if (value === 'delete') setInput(amount.slice(0, -1));
    else if (value === '.') { if (!toDollars && !amount.includes('.')) setInput((amount || '0') + '.'); }
    else setInput(amount === '0' ? value : amount + value);
  };
  const isReturn = operation?.stage === 'returnQuoted' || operation?.stage === 'returning' || (operation?.stage === 'complete' && !!operation.return_quote_id);
  const isReview = operation?.stage === 'quoted' || operation?.stage === 'returnQuoted';
  const expired = operation?.stage === 'quoted' && operation.expires_at * 1000 <= now;
  const done = operation?.stage === 'complete' || operation?.stage === 'refunded';
  const quote = operation ? decodeQuote<PrepareSendPaymentResponse>(isReturn ? operation.return_quote_json : operation.quote_json) : null;
  const exactOutput = operation ? money(isReturn ? BigInt(operation.return_amount) : BigInt(operation.output_amount), !isReturn && toDollars) : '';
  const output = operation && !isReturn && toDollars ? dollarAmount(BigInt(operation.output_amount)) : exactOutput;
  const debit = operation ? money(BigInt(operation.max_debit), !toDollars) : '';
  const edit = () => operation ? void run(async () => { await cancelConversion(operation); }) : onClose();
  const review = () => void run(() => {
    if (!canReview || !availability.quote) throw new Error('Check the amount and fees before reviewing.');
    return reviewStableTransfer(availability.quote, sourceAmount, cashuBalance);
  });

  return (
    <main className="transfer-screen flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding md:px-10 pt-6 pb-6">
      <PageHeader
        title={operation?.stage === 'refunded' ? 'Transfer returned' : done ? 'Transfer complete' : isReview ? 'Review transfer' : operation ? 'Your transfer' : 'Transfer funds'}
        subtitle={done ? 'Return to your wallet to see your balance' : isReview ? 'Check your amount and fees' : operation ? 'View the progress of your transfer' : 'Move between Bitcoin and dollars'}
        onBack={isReview ? edit : onClose}
        backDisabled={busy}
      />
        <div className="transfer-content">
          {!operation && <>
            <div className="transfer-pair">
              <div className="transfer-asset transfer-source">
                <div className="transfer-asset-heading"><label htmlFor="transfer-amount">From</label><span className={toDollars ? 'transfer-bitcoin-label' : 'transfer-dollar-label'}>{toDollars ? <Bitcoin size={15}/> : <DollarSign size={15}/>} {toDollars ? 'Bitcoin' : 'Dollar'}</span></div>
                <div className="transfer-entry">{!toDollars && <span>$</span>}<input id="transfer-amount" aria-describedby="transfer-constraints" aria-label={toDollars ? 'Bitcoin amount in sats' : 'Dollar amount'} inputMode="none" autoComplete="off" placeholder="0" value={amount} disabled={busy} onChange={e => setInput(e.target.value)}/>{toDollars && <span className="transfer-unit">SAT</span>}</div>
                <p className="transfer-available">Available: {sourceBalance === null ? 'Balance unavailable' : toDollars ? money(sourceBalance, false) : dollarAmount(sourceBalance)}</p>
              </div>
              <button className="transfer-switch" aria-label="Switch Bitcoin and Dollar" disabled={busy} onClick={() => {setDirection(toDollars ? 'toSats' : 'toUsd'); setAmount(''); setSelectedPercent(null); setError('');}}><ArrowUpDown size={21}/></button>
              <div className="transfer-asset transfer-destination">
                <div className="transfer-asset-heading"><span>To</span><span className={toDollars ? 'transfer-dollar-label' : 'transfer-bitcoin-label'}>{toDollars ? <DollarSign size={15}/> : <Bitcoin size={15}/>} {toDollars ? 'Dollar' : 'Bitcoin'}</span></div>
                <p className="transfer-preview" aria-live="polite">{displayEstimate === null ? '—' : toDollars ? `≈ ${dollarAmount(displayEstimate)}` : `≈ ${displayEstimate.toLocaleString()} sats`}</p>
                <p className="transfer-available">{toDollars ? stableBalance === null ? 'Balance unavailable' : `Balance: ${dollarAmount(stableBalance)}` : `Balance: ${cashuBalance.toLocaleString()} sats`}</p>
              </div>
            </div>
            <div id="transfer-constraints" className="transfer-constraints" aria-live="polite"><p>{constraintMessage}</p>{amountMessage && <p className={insufficient || availability.belowMinimum || availability.quoteError ? 'transfer-hint-error' : ''}>{amountMessage}</p>}</div>
            {availability.quoteError != null && !(availability.quoteError instanceof TransferMinimumError) && <details className="transfer-details"><summary>Technical details</summary><p>{transferErrorDetails(availability.quoteError)}</p></details>}
            <div className="transfer-entry-controls">
              <div className="transfer-percentages" aria-label="Choose a share of your balance">
                {[25, 50, 75, 100].map(percent => <button key={percent} disabled={busy || !availability.limitsReady || sourceBalance === null || sourceBalance === 0n || (suggestedMinimum !== null && sourceBalance !== null && percentageAmount(sourceBalance, percent) < suggestedMinimum)} aria-pressed={selectedPercent === percent} onClick={() => {setAmount(formatUnits(percentageAmount(sourceBalance!, percent), sourceDecimals)); setSelectedPercent(percent); setError('');}}>{percent}%</button>)}
              </div>
              <div className="transfer-keypad" aria-label="Amount keypad">
                {['1','2','3','4','5','6','7','8','9','.','0','delete'].map(value => <button key={value} type="button" disabled={busy || (value === '.' && toDollars)} onClick={() => key(value)} aria-label={value === 'delete' ? 'Delete last digit' : value === '.' ? 'Decimal point' : value}>{value === 'delete' ? <Delete size={23}/> : value}</button>)}
              </div>
              {sourceBalance === null && <button className="transfer-text-button" disabled={busy} onClick={onChange}>Refresh balance</button>}
              {!usdRate && <button className="transfer-text-button" disabled={busy} onClick={() => void fetchRates()}>Refresh exchange rate</button>}
              <button className="transfer-primary" disabled={busy || !mintUrl || (!retryAvailability && !canReview)} onClick={retryAvailability ? availability.retry : review}>{busy ? <><Loader2 className="animate-spin" size={19}/>Getting your quote…</> : availability.checking && sourceAmount > 0n ? <><Loader2 className="animate-spin" size={19}/>Getting quote…</> : retryAvailability ? 'Check again' : <>Review transfer<ChevronRight size={19}/></>}</button>
            </div>
          </>}
          {operation && <>
            <div className="transfer-receipt">
              <div className={`transfer-receipt-symbol ${done ? 'is-done' : ''}`}>{done ? <Check size={26}/> : busy ? <Loader2 className="animate-spin" size={25}/> : <ArrowDown size={25}/>}</div>
              <p className="transfer-receipt-label">{operation.stage === 'refunded' ? 'Your money has been returned' : done ? isReturn ? 'Returned to Bitcoin' : 'Added to your balance' : isReturn ? 'Return to Bitcoin' : 'You receive'}</p>
              <p className="transfer-receipt-amount">{operation.stage === 'refunded' ? 'Transfer cancelled' : output}</p>
              <p className="transfer-receipt-currency">{isReturn || !toDollars ? 'Bitcoin balance' : 'Dollar balance'}</p>
            </div>
            {isReview && <>
              <dl className="transfer-summary">
                {!isReturn && <><div><dt>From</dt><dd>{toDollars ? 'Bitcoin' : 'Dollar'} balance</dd></div><div><dt>{toDollars ? 'You pay up to' : 'Estimated total'}</dt><dd>{debit}</dd></div></>}
                <div><dt>Fees</dt><dd>{isReturn && quote?.paymentMethod.type === 'bolt11Invoice' ? `${quote.paymentMethod.lightningFeeSats + (quote.paymentMethod.sparkTransferFeeSats ?? 0)} sats` : 'Included in total'}</dd></div>
              </dl>
              <p className="transfer-hint">{isReturn ? 'Return your Bitcoin without completing the transfer. A small amount may remain to cover fees.' : toDollars ? 'Only this amount moves. The rest of your Bitcoin stays in your balance.' : 'The rate may move slightly before the transfer completes.'}</p>
              {!isReturn && <details className="transfer-details"><summary>About this transfer</summary><p>Exact amount: {exactOutput}. Rate changes are limited to 0.1%. Your Dollar balance is held as a dollar-linked digital asset, rather than a bank deposit. Its value depends on it maintaining its link to the dollar.</p></details>}
              <div className="transfer-actions"><button className="transfer-primary" disabled={busy || !!expired} onClick={() => void run(() => isReturn ? executeFundingReturn(operation.id) : executeStableConversion(operation.id))}>{busy ? <><Loader2 className="animate-spin" size={19}/>Transferring…</> : expired ? 'Quote expired' : isReturn ? 'Confirm return' : 'Confirm transfer'}</button><button className="transfer-secondary" disabled={busy} onClick={edit}>{isReturn ? 'Back to transfer' : expired ? 'Get a new quote' : 'Edit amount'}</button></div>
            </>}
            {!isReview && !done && <>
              <p className="transfer-progress" role="status">{stages[operation.stage] ?? 'Your transfer is saved'}. {!error && ['funding', 'converting', 'settling', 'returning'].includes(operation.stage) ? 'We’ll check progress automatically. ' : ''}You can leave this screen and return later.</p>
              {progressDetails && <details className="transfer-details"><summary>Transfer details</summary><p>{progressDetails}</p></details>}
              <div className="transfer-actions"><button className="transfer-primary" disabled={busy || checkingProgress} onClick={() => void run(() => operation.stage === 'funded' ? executeStableConversion(operation.id) : checkStableConversion(operation.id))}>{busy || checkingProgress ? <><Loader2 className="animate-spin" size={19}/>Checking…</> : operation.stage === 'funded' ? 'Continue transfer' : 'Check progress'}</button>
              {operation.stage === 'funded' && <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={() => void run(() => quoteFundingReturn(operation.id))}>Return to Bitcoin balance</button>}
              {operation.stage === 'converting' && <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={() => void run(() => recoverPendingConversion(operation.id))}>Recover transfer</button>}</div>
            </>}
            {done && <div className="transfer-actions"><button className="transfer-primary" onClick={onDone}>Back to wallet</button></div>}
          </>}
          {error && <div className="transfer-error" role="alert"><p>{transferErrorMessage(error, operation && !['quoted', 'cancelled'].includes(operation.stage) ? 'pending' : 'review')}</p><details><summary>Technical details</summary><p>{error}</p></details></div>}
        </div>
      <SovereignStampOverlay
        status={showSuccess ? 'success' : null}
        amountDisplay={output}
        currency=""
        title={isReturn ? 'Bitcoin returned' : 'Transfer complete'}
        badgeLabel={isReturn ? 'Returned' : 'Converted'}
        actionLabel="Back to wallet"
        onDismiss={() => {setShowSuccess(false); onDone();}}
      />
    </main>
  );
}
