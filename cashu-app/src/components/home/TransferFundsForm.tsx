import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpDown, Bitcoin, Check, ChevronRight, Delete, DollarSign, Loader2 } from 'lucide-react';
import { SovereignStampOverlay } from '../shared/SovereignStampOverlay';
import { PageHeader } from '../shared/PageHeader';
import { useWalletStore } from '../../store/wallet';
import { useCurrencyStore } from '../../store/currencyStore';
import { useTransferAvailability } from '../../hooks/useTransferAvailability';
import { useReviewQuoteRefresh } from '../../hooks/useReviewQuoteRefresh';
import { cancelConversion, checkStableConversion, executeStableConversion, executeFundingReturn, getActiveConversion, quoteFundingReturn, quoteStableConversion, recoverPendingConversion } from '../../services/stableBalanceService';
import { conversionCost, decodeQuote, formatUnits, parseUnits, USD_DECIMALS, conservativeOutput } from '../../services/stableBalanceModel';
import { dollarAmount, estimateTransferOutput, percentageAmount, TransferMinimumError } from '../../services/transferAmount';
import type { StableDirection, StableOperation } from '../../services/stableBalanceModel';
import type { PrepareSendPaymentResponse } from '@breeztech/breez-sdk-spark/web';
import { TransferPendingError, TransferFailedError, transferErrorDetails, transferErrorMessage, transferRetrySeconds } from '../../services/transferError';
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
  const [quoteRetryAt, setQuoteRetryAt] = useState(0);
  const quoteRetrySeconds = Math.max(0, Math.ceil((quoteRetryAt - now) / 1000));
  const busyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const usdRate = useCurrencyStore(s => s.rates.USD);
  const fetchRates = useCurrencyStore(s => s.fetchRates);
  useEffect(() => {
    let live = true;
    void getActiveConversion().then(op => { if (live) { setOperation(op); if (op) setDirection(op.direction); } }).catch(e => { if (live) setError(transferErrorDetails(e)); }).finally(() => { if (live) setBusy(false); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (operation || busy) return;
    const update = () => {if (!document.hidden) void fetchRates();};
    update();
    const timer = setInterval(update, 3000);
    document.addEventListener('visibilitychange', update);
    return () => {clearInterval(timer);document.removeEventListener('visibilitychange', update);};
  }, [operation, busy, fetchRates]);
  const applyReviewQuote = useCallback((next: StableOperation) => {setOperation(next);setError('');}, []);
  const reviewRefresh = useReviewQuoteRefresh(operation, !busy, cashuBalance, busyRef, applyReviewQuote);
  const reviewRetrySeconds = Math.max(0, Math.ceil((reviewRefresh.retryAt - now) / 1000));
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
        const retry = transferRetrySeconds(transferErrorDetails(e));
        if (retry !== null && !operation) {
          const started = Date.now();
          setNow(started);
          setQuoteRetryAt(started + retry * 1000);
        }
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
          onChangeRef.current();
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
  }, [monitoredId, monitoredStage, busy, error]);
  const toDollars = direction === 'toUsd';
  const sourceDecimals = toDollars ? 0 : USD_DECIMALS;
  const sourceBalance = toDollars ? BigInt(cashuBalance) : stableBalance;
  let sourceAmount = 0n;
  try { sourceAmount = parseUnits(amount, sourceDecimals); } catch { /* Empty or incomplete input. */ }
  const estimate = estimateTransferOutput(direction, sourceAmount, usdRate);
  const insufficient = sourceBalance !== null && sourceAmount > sourceBalance;
  const availability = useTransferAvailability({enabled:!busy && !operation, direction, mintUrl, sourceAmount});
  const suggestedMinimum = availability.minimum;
  const displayEstimate = estimate === null ? null : conservativeOutput(estimate);
  const constraintMessage = availability.limitsFailed ? 'Limits will be checked with your quote.' : !availability.limitsReady ? 'Checking transfer limits…' : availability.minimum ? `Minimum ${money(availability.minimum, !toDollars)} + fees. Maximum ${sourceBalance === null ? 'not available' : money(sourceBalance, !toDollars)}.` : `Maximum ${sourceBalance === null ? 'not available' : money(sourceBalance, !toDollars)}. Minimum checked with your quote.`;
  let amountMessage = '';
  if (insufficient) amountMessage = `Enter ${money(sourceBalance!, !toDollars)} or less.`;
  else if (suggestedMinimum !== null && sourceBalance !== null && suggestedMinimum > sourceBalance) amountMessage = `Your balance is below ${money(suggestedMinimum, !toDollars)} plus fees. Add funds or switch balances.`;
  else if (availability.belowMinimum) amountMessage = `Enter at least ${money(availability.minimum!, !toDollars)}, plus fees.`;
  else amountMessage = 'Includes a 3% movement allowance and the remaining balance will be moved back to your wallet.';
  const canReview = sourceAmount > 0n && estimate !== null && estimate > 0n && sourceBalance !== null && !insufficient && !availability.belowMinimum;

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
  const protectedReview = !!operation?.protection_bps && !isReturn;
  const expired = operation?.stage === 'quoted' && operation.expires_at * 1000 <= now;
  const done = operation?.stage === 'complete' || operation?.stage === 'refunded';
  const quote = operation ? decodeQuote<PrepareSendPaymentResponse>(isReturn ? operation.return_quote_json : operation.quote_json) : null;
  const exactOutput = operation ? money(isReturn ? BigInt(operation.return_amount) : BigInt(operation.output_amount), !isReturn && toDollars) : '';
  const output = operation && !isReturn && toDollars ? dollarAmount(BigInt(operation.output_amount)) : exactOutput;
  const debit = operation ? money(isReview && !protectedReview && !toDollars && quote?.conversionEstimate ? conversionCost(quote.conversionEstimate) : BigInt(operation.max_debit), !toDollars) : '';
  const conversion = quote?.conversionEstimate;
  const liveRate = conversion && conversion.amountIn > 0n && conversion.amountOut > 0n
    ? dollarAmount(toDollars ? conversion.amountOut * 100000000n / conversion.amountIn : conversion.amountIn * 100000000n / conversion.amountOut) : null;
  const errorMessage = !operation && quoteRetryAt > 0 && transferRetrySeconds(error) !== null
    ? quoteRetrySeconds > 0
      ? `The mint is busy. Try again in ${quoteRetrySeconds} seconds. No money was moved.`
      : 'You can try again now. No money was moved.'
    : transferErrorMessage(error, operation && !['quoted', 'cancelled'].includes(operation.stage) ? 'pending' : 'review');
  const edit = () => operation ? void run(async () => { if (operation.stage === 'quoted') setAmount(formatUnits(BigInt(operation.max_debit), sourceDecimals)); await cancelConversion(operation); }) : onClose();
  const review = () => void run(() => {
    if (Date.now() < quoteRetryAt) throw new Error('Wait for the mint’s retry delay before requesting another quote.');
    if (!canReview || estimate === null) throw new Error('Enter an amount within your available balance.');
    return quoteStableConversion(direction, conservativeOutput(estimate), mintUrl, cashuBalance, sourceAmount, {protected:true});
  });

  return (
    <main className="transfer-screen flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding md:px-10 pt-6 pb-6">
      <PageHeader
        title={operation?.stage === 'refunded' ? 'Transfer returned' : done ? 'Transfer complete' : isReview ? 'Review transfer' : operation ? 'Your transfer' : 'Transfer funds'}
        subtitle={done ? 'Return to your wallet to see your balance' : isReview ? 'Check your amount and fees' : operation ? 'View the progress of your transfer' : 'Move between Bitcoin and dollars'}
        onBack={isReview ? edit : onClose}
        backDisabled={busy || reviewRefresh.refreshing}
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
            <div id="transfer-constraints" className="transfer-constraints" aria-live="polite"><p>{constraintMessage}</p>{amountMessage && <p className={insufficient || availability.belowMinimum ? 'transfer-hint-error' : ''}>{amountMessage}</p>}</div>
            <div className="transfer-entry-controls">
              <div className="transfer-percentages" aria-label="Choose a share of your balance">
                {[25, 50, 75, 100].map(percent => <button key={percent} disabled={busy || sourceBalance === null || sourceBalance === 0n || (suggestedMinimum !== null && sourceBalance !== null && percentageAmount(sourceBalance, percent) < suggestedMinimum)} aria-pressed={selectedPercent === percent} onClick={() => {setAmount(formatUnits(percentageAmount(sourceBalance!, percent), sourceDecimals)); setSelectedPercent(percent); setError('');}}>{percent}%</button>)}
              </div>
              <div className="transfer-keypad" aria-label="Amount keypad">
                {['1','2','3','4','5','6','7','8','9','.','0','delete'].map(value => <button key={value} type="button" disabled={busy || (value === '.' && toDollars)} onClick={() => key(value)} aria-label={value === 'delete' ? 'Delete last digit' : value === '.' ? 'Decimal point' : value}>{value === 'delete' ? <Delete size={23}/> : value}</button>)}
              </div>
              {sourceBalance === null && <button className="transfer-text-button" disabled={busy} onClick={onChange}>Refresh balance</button>}
              {!usdRate && <button className="transfer-text-button" disabled={busy} onClick={() => void fetchRates()}>Refresh exchange rate</button>}
              <button className="transfer-primary" disabled={busy || !mintUrl || !canReview || quoteRetrySeconds > 0} onClick={review}>{busy ? <><Loader2 className="animate-spin" size={19}/>Getting rate and fees…</> : quoteRetrySeconds > 0 ? `Try again in ${quoteRetrySeconds}s` : <>Review transfer<ChevronRight size={19}/></>}</button>
            </div>
          </>}
          {operation && <>
            <div className="transfer-receipt">
              <div className={`transfer-receipt-symbol ${done ? 'is-done' : ''}`}>{done ? <Check size={26}/> : busy ? <Loader2 className="animate-spin" size={25}/> : <ArrowDown size={25}/>}</div>
              <p className="transfer-receipt-label">{operation.stage === 'refunded' ? 'Your money has been returned' : done ? isReturn ? 'Returned to Bitcoin' : 'Added to your balance' : isReturn ? 'Return to Bitcoin' : protectedReview && !done ? 'You receive at least' : 'You receive'}</p>
              <p className="transfer-receipt-amount">{operation.stage === 'refunded' ? 'Transfer cancelled' : output}</p>
              <p className="transfer-receipt-currency">{isReturn || !toDollars ? 'Bitcoin balance' : 'Dollar balance'}</p>
            </div>
            {isReview && <>
              <dl className="transfer-summary">
                {!isReturn && <><div><dt>From</dt><dd>{toDollars ? 'Bitcoin' : 'Dollar'} balance</dd></div><div><dt>{protectedReview ? 'Maximum you pay' : toDollars ? 'You pay up to' : 'Estimated total'}</dt><dd>{debit}</dd></div></>}
                {!isReturn && !protectedReview && !toDollars && <div><dt>Maximum you pay</dt><dd>{money(BigInt(operation.max_debit), true)}</dd></div>}
                <div><dt>Fees</dt><dd>{isReturn && quote?.paymentMethod.type === 'bolt11Invoice' ? `${quote.paymentMethod.lightningFeeSats + (quote.paymentMethod.sparkTransferFeeSats ?? 0)} sats` : 'Included in total'}</dd></div>
                {!isReturn && liveRate && <div><dt>Rate</dt><dd>1 BTC ≈ {liveRate}</dd></div>}
              </dl>
              {!isReturn && <p className="transfer-hint" role="status">{protectedReview ? expired ? 'Review expired. Get a new quote before confirming.' : `Fixed review · ${Math.max(0, Math.ceil((operation.expires_at * 1000 - now) / 1000))}s to confirm` : reviewRefresh.refreshing ? 'Updating rate and fees…' : reviewRefresh.error ? reviewRetrySeconds > 0 ? `Couldn’t update the rate. Retrying in ${reviewRetrySeconds}s…` : 'Couldn’t update the rate. Check again before confirming.' : `Live quote · updates in ${Math.max(0, Math.ceil((operation.expires_at * 1000 - 40000 - now) / 1000))}s`}</p>}
              {!isReturn && reviewRefresh.error && <details className="transfer-details"><summary>Connection details</summary><p>{transferErrorDetails(reviewRefresh.error)}</p></details>}
              <p className="transfer-hint">{protectedReview ? toDollars ? 'A 3% movement allowance is included in your maximum. Unused sats remain yours and return automatically when at least 100 sats are available.' : 'Your maximum includes a 3% movement allowance. Any unused dollars stay in your Dollar balance.' : isReturn ? 'Return your Bitcoin without completing the transfer. A small amount may remain to cover fees.' : toDollars ? 'Only this amount moves. The rest of your Bitcoin stays in your balance.' : 'The rate may move slightly before the transfer completes.'}</p>
              {!isReturn && <details className="transfer-details"><summary>About this transfer</summary><p>{protectedReview ? `Minimum received: ${exactOutput}. We recheck the provider price within your approved spending limit. If it no longer fits, we stop safely rather than spend more. Network or provider failures can still delay a transfer.` : `Exact amount: ${exactOutput}. Provider slippage is limited to 0.1%.`} Your Dollar balance is held as a dollar-linked digital asset, rather than a bank deposit. Its value depends on it maintaining its link to the dollar.</p></details>}
              <div className="transfer-actions"><button className="transfer-primary" disabled={busy || reviewRefresh.refreshing || !!expired || (!isReturn && !!reviewRefresh.error)} onClick={() => void run(() => isReturn ? executeFundingReturn(operation.id) : executeStableConversion(operation.id))}>{busy ? <><Loader2 className="animate-spin" size={19}/>Transferring…</> : reviewRefresh.refreshing ? <><Loader2 className="animate-spin" size={19}/>Updating rate…</> : expired ? 'Review expired' : isReturn ? 'Confirm return' : 'Confirm transfer'}</button>{!isReturn && (reviewRefresh.error || expired) && <button className="transfer-secondary" disabled={busy || reviewRefresh.refreshing || reviewRetrySeconds > 0} onClick={protectedReview ? edit : reviewRefresh.retry}>{reviewRetrySeconds > 0 ? `Try again in ${reviewRetrySeconds}s` : protectedReview ? 'Edit and get new quote' : 'Update quote'}</button>}{!(protectedReview && expired) && <button className="transfer-secondary" disabled={busy || reviewRefresh.refreshing} onClick={edit}>{isReturn ? 'Back to transfer' : 'Edit amount'}</button>}</div>
            </>}
            {!isReview && !done && <>
              <p className="transfer-progress" role="status">{stages[operation.stage] ?? 'Your transfer is saved'}. {!error && ['funding', 'converting', 'settling', 'returning'].includes(operation.stage) ? 'We’ll check progress automatically. ' : ''}You can leave this screen and return later.</p>
              {progressDetails && <details className="transfer-details"><summary>Transfer details</summary><p>{progressDetails}</p></details>}
              <div className="transfer-actions"><button className="transfer-primary" disabled={busy || checkingProgress} onClick={() => void run(() => operation.stage === 'funded' ? executeStableConversion(operation.id) : checkStableConversion(operation.id))}>{busy || checkingProgress ? <><Loader2 className="animate-spin" size={19}/>Checking…</> : operation.stage === 'funded' ? 'Continue transfer' : 'Check progress'}</button>
              {operation.stage === 'funded' && <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={() => void run(() => quoteFundingReturn(operation.id))}>Return to Bitcoin balance</button>}
              {operation.stage === 'converting' && <button className="transfer-secondary" disabled={busy || checkingProgress} onClick={() => void run(() => recoverPendingConversion(operation.id))}>Recover transfer</button>}</div>
              <button className="transfer-secondary" onClick={onClose}>Back to wallet</button>
            </>}
            {done && <div className="transfer-actions"><button className="transfer-primary" onClick={onDone}>Back to wallet</button></div>}
          </>}
          {error && <div className="transfer-error" role="alert"><p>{errorMessage}</p><details><summary>Technical details</summary><p>{error}</p></details></div>}
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
