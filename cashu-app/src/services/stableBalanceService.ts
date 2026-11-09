import { invoke } from '@tauri-apps/api/core';
import type { BreezSdk, Payment, PrepareSendPaymentResponse, FetchConversionLimitsResponse } from '@breeztech/breez-sdk-spark/web';
import { getSparkSdk } from './sparkService';
import { TransferPendingError, TransferFailedError, transferErrorDetails } from './transferError';
import { withSparkBalanceLock } from './sparkBalanceLock';
import { resizeTransferOutput, TransferMinimumError, providerMinimum } from './transferAmount';
import { USDB_TOKEN_ID, USDB_TOKEN_HEX, USD_DECIMALS, SLIPPAGE_BPS, conversionCost, encodeQuote, decodeQuote } from './stableBalanceModel';
import type { StableDirection, StableOperation, StableStage } from './stableBalanceModel';

export const getStableOperations = () => invoke<StableOperation[]>('stable_operations');
export const getActiveConversion = async () => (await getStableOperations()).find(o => !['complete', 'cancelled', 'refunded'].includes(o.stage)) ?? null;
function isUsdb(id: string): boolean { return id === USDB_TOKEN_ID || id === USDB_TOKEN_HEX; }
const verifiedAssets = new WeakMap<BreezSdk, Promise<void>>();
const limitCache = new WeakMap<BreezSdk, Map<StableDirection, {expires: number; request: Promise<FetchConversionLimitsResponse>}>>();
const previewContexts = new WeakMap<StableOperation, {sdk: BreezSdk; sourceBudget: bigint | undefined}>();

async function checkedSdk(): Promise<BreezSdk> {
  const sdk = await getSparkSdk();
  let verification = verifiedAssets.get(sdk);
  if (!verification) {
    verification = sdk.getTokensMetadata({tokenIdentifiers:[USDB_TOKEN_ID]}).then(({tokensMetadata}) => {
      if (!tokensMetadata.some(t => isUsdb(t.identifier) && t.decimals === USD_DECIMALS)) throw new Error('Spark could not verify the mainnet USDB asset. Conversion is unavailable.');
    });
    verifiedAssets.set(sdk, verification);
  }
  try { await verification; } catch (error) { if (verifiedAssets.get(sdk) === verification) verifiedAssets.delete(sdk); throw error; }
  return sdk;
}
async function conversionLimits(sdk: BreezSdk, direction: StableDirection): Promise<FetchConversionLimitsResponse> {
  let entries = limitCache.get(sdk);
  if (!entries) { entries = new Map(); limitCache.set(sdk, entries); }
  const cached = entries.get(direction);
  if (cached && cached.expires > Date.now()) return cached.request;
  const request = sdk.fetchConversionLimits({
    conversionType: direction === 'toUsd' ? {type:'fromBitcoin'} : {type:'toBitcoin',fromTokenIdentifier:USDB_TOKEN_ID},
    tokenIdentifier: direction === 'toUsd' ? USDB_TOKEN_ID : undefined,
  }).then(limits => ({...limits}));
  entries.set(direction, {expires:Date.now()+20000, request});
  try { return await request; } catch (error) { if (entries.get(direction)?.request === request) entries.delete(direction); throw error; }
}
export async function getStableBalance(ensureSynced = true): Promise<bigint> {
  const info = await (await checkedSdk()).getInfo({ ensureSynced });
  if (info.lastSyncError) throw new Error('Spark could not sync the stable balance.');
  for (const [id, token] of info.tokenBalances) {
    if (isUsdb(id) && isUsdb(token.tokenMetadata.identifier) && token.tokenMetadata.decimals === USD_DECIMALS) return token.balance;
  }
  return 0n;
}
function checkedEstimate(prep: PrepareSendPaymentResponse, direction: StableDirection) {
  const estimate = prep.conversionEstimate;
  if (!estimate || estimate.options.conversionType.type !== (direction === 'toUsd' ? 'fromBitcoin' : 'toBitcoin')) throw new Error('Spark did not return a conversion quote.');
  return estimate;
}
async function advance(op: StableOperation, stage: StableStage, paymentId?: string): Promise<StableOperation> {
  return invoke('stable_advance', { id: op.id, expectedStage: op.stage, nextStage: stage, paymentId: paymentId ?? null });
}
export async function cancelConversion(op: StableOperation): Promise<void> {
  await withSparkBalanceLock(() => advance(op, op.stage === 'returnQuoted' ? 'funded' : 'cancelled'));
}

export interface StableTransferLimits { minSource: bigint | null; minReceive: bigint | null }
// https://sdk-doc-spark.breez.technology/guide/token_conversion.html#fetching-conversion-limits
export async function getStableTransferLimits(direction: StableDirection): Promise<StableTransferLimits> {
  const sdk = await checkedSdk();
  const limits = await conversionLimits(sdk, direction);
  return {minSource: limits.minFromAmount ?? null, minReceive: limits.minToAmount ?? null};
}
export function previewStableTransfer(direction: StableDirection, outputAmount: bigint, mintUrl: string, cashuBalance: number, sourceBudget: bigint, signal?: AbortSignal): Promise<StableOperation> {
  return quoteStableConversion(direction, outputAmount, mintUrl, cashuBalance, sourceBudget, {preview: true, signal});
}

// Manual conversions keep only the selected amount in USDB; automatic conversion stays off.
// https://sdk-doc-spark.breez.technology/guide/token_conversion.html
export async function quoteStableConversion(direction: StableDirection, outputAmount: bigint, mintUrl: string, cashuBalance: number, sourceBudget?: bigint, mode?: {preview: boolean; signal?: AbortSignal}): Promise<StableOperation> {
  const prepare = async (): Promise<StableOperation> => {
    mode?.signal?.throwIfAborted();
    if (await getActiveConversion()) throw new Error('Finish the saved conversion first.');
    if (await invoke<boolean>('spark_is_sending')) throw new Error('Wait for the current Bitcoin operation to finish.');
    const sdk = await checkedSdk();
    mode?.signal?.throwIfAborted();
    const options = { conversionType: direction === 'toUsd' ? { type: 'fromBitcoin' as const } : { type: 'toBitcoin' as const, fromTokenIdentifier: USDB_TOKEN_ID }, maxSlippageBps: SLIPPAGE_BPS, completionTimeoutSecs: 60 };
    const limits = await conversionLimits(sdk, direction);
    const available = direction === 'toUsd' ? BigInt(cashuBalance) : await getStableBalance(!mode?.preview);
    mode?.signal?.throwIfAborted();
    if (sourceBudget !== undefined && (sourceBudget <= 0n || sourceBudget > available)) throw new Error('Not enough balance for this transfer.');
    if (sourceBudget !== undefined && limits.minFromAmount && sourceBudget < limits.minFromAmount) throw new TransferMinimumError(limits.minFromAmount);
    if (sourceBudget !== undefined && limits.minToAmount && outputAmount < limits.minToAmount) outputAmount = limits.minToAmount;
    const ownAddress = direction === 'toUsd' ? (await sdk.receivePayment({paymentMethod:{type:'sparkAddress'}})).paymentRequest : '';
    let quotingMinimum = false;
    let best: StableOperation | null = null;
    let upperOutput: bigint | null = null;
    let previousRejectedDebit: bigint | null = null;
    const smallerOutput = (debit: bigint, principal: bigint): bigint => {
      const rejected = outputAmount - 1n;
      upperOutput = upperOutput === null || rejected < upperOutput ? rejected : upperOutput;
      const lower = best ? BigInt(best.output_amount) : 0n;
      const predicted = resizeTransferOutput(outputAmount, sourceBudget!, debit, principal);
      // Fee reserves and whole-sat rounding can keep the debit unchanged across many outputs.
      // Bisect a repeated plateau instead of taking the same tiny reduction indefinitely.
      const next = previousRejectedDebit === debit || predicted > upperOutput || predicted <= lower
        ? (lower + upperOutput) / 2n : predicted;
      previousRejectedDebit = debit;
      return next;
    };
    for (let attempt = 0; attempt < (sourceBudget === undefined ? 1 : 12); attempt++) {
      mode?.signal?.throwIfAborted();
      if (outputAmount <= 0n) throw new Error('Amount is too small after fees. Try a larger amount.');
      if (limits.minToAmount && outputAmount < limits.minToAmount) throw new Error('Amount is below Spark’s conversion minimum. Try a larger amount.');
      let paymentRequest: string;
      let mintQuoteId = '';
      if (direction === 'toUsd') {
        paymentRequest = ownAddress;
      } else {
        const quote = await invoke<{quote_id: string; invoice: string}>(mode?.preview ? 'stable_mint_quote_preview' : 'receive_lightning', {mintUrl, amount: Number(outputAmount)});
        paymentRequest = quote.invoice;
        mintQuoteId = quote.quote_id;
      }
      let prep: PrepareSendPaymentResponse;
      try {
        prep = await sdk.prepareSendPayment({ paymentRequest: {type: 'input', input: paymentRequest}, amount: outputAmount, tokenIdentifier: direction === 'toUsd' ? USDB_TOKEN_ID : undefined, conversionOptions: options, feePolicy: 'feesExcluded' });
      } catch (error) {
        const minimum = providerMinimum(error);
        if (!minimum || sourceBudget === undefined) throw error;
        limits.minFromAmount = limits.minFromAmount && limits.minFromAmount > minimum.minimum ? limits.minFromAmount : minimum.minimum;
        if (sourceBudget < minimum.minimum) throw new TransferMinimumError(minimum.minimum);
        // The cached display price can undersize the actual conversion. Scale using the provider's own input amount.
        outputAmount = (outputAmount * minimum.minimum + minimum.attempted - 1n) / minimum.attempted + 1n;
        quotingMinimum = true;
        continue;
      }
      mode?.signal?.throwIfAborted();
      const cost = conversionCost(checkedEstimate(prep, direction));
      if (limits.minFromAmount && prep.conversionEstimate!.amountIn < limits.minFromAmount) {
        const input = prep.conversionEstimate!.amountIn;
        if (sourceBudget === undefined || sourceBudget < limits.minFromAmount || input <= 0n) throw new TransferMinimumError(limits.minFromAmount);
        outputAmount = (outputAmount * limits.minFromAmount + input - 1n) / input + 1n;
        quotingMinimum = true;
        continue;
      }
      if (limits.minFromAmount && prep.conversionEstimate!.amountIn === limits.minFromAmount) quotingMinimum = true;
      if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Conversion is too large.');
      if (sourceBudget !== undefined && cost > sourceBudget && !quotingMinimum) {
        // Avoid generating funding invoices and mint fee quotes for an already oversized conversion.
        const principal = prep.conversionEstimate!.amountIn;
        const resized = smallerOutput(cost, principal);
        if (resized <= 0n && limits.minFromAmount) {
          outputAmount = (outputAmount * limits.minFromAmount + principal - 1n) / principal + 1n;
          quotingMinimum = true;
        } else outputAmount = resized;
        continue;
      }
      let fundingInvoice = '';
      let fundingSats = 0;
      let maxDebit = cost;
      if (direction === 'toUsd') {
        if (prep.paymentMethod.type !== 'sparkAddress') throw new Error('Unexpected conversion destination.');
        if (prep.paymentMethod.fee !== 0n) throw new Error('Spark returned an unsupported self-conversion fee.');
        fundingSats = Number(cost);
        const received = await sdk.receivePayment({paymentMethod: {type: 'bolt11Invoice', description: 'Bitnotes stable balance funding', amountSats: fundingSats, expirySecs: 600}});
        if (received.fee !== 0n) throw new Error('Spark charges a receive fee for this amount. Choose a larger conversion.');
        mode?.signal?.throwIfAborted();
        fundingInvoice = received.paymentRequest;
        maxDebit = BigInt(await invoke<number>('stable_funding_quote', {invoice: fundingInvoice, mintUrl}));
      }
      if (sourceBudget !== undefined && maxDebit > sourceBudget) {
        if (quotingMinimum) throw new TransferMinimumError(maxDebit, true);
        const principal = prep.conversionEstimate!.amountIn;
        const resized = smallerOutput(maxDebit, principal);
        if (resized <= 0n && limits.minFromAmount) {
          outputAmount = (outputAmount * limits.minFromAmount + principal - 1n) / principal + 1n;
          quotingMinimum = true;
        } else outputAmount = resized;
        continue;
      }
      if (maxDebit > available) throw new Error('Insufficient balance for this transfer and its fees.');
      mode?.signal?.throwIfAborted();
      const op: StableOperation = {
        id: crypto.randomUUID(), direction, stage: 'quoted', mint_url: mintUrl,
        created_at: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 60,
        output_amount: outputAmount.toString(), max_debit: maxDebit.toString(), funding_invoice: fundingInvoice,
        funding_sats: fundingSats, mint_quote_id: mintQuoteId, quote_json: encodeQuote(prep), payment_id: null, conversion_request_version: 0,
        prior_payment_ids: [], return_quote_id: '', return_quote_json: '', return_amount: 0,
      };
      if (!best || outputAmount > BigInt(best.output_amount)) best = op;
      if (sourceBudget === undefined || maxDebit * 100n >= sourceBudget * 99n) break;
      const lower = BigInt(best.output_amount);
      if (upperOutput !== null && upperOutput <= lower + 1n) break;
      const predicted = resizeTransferOutput(outputAmount, sourceBudget, maxDebit, prep.conversionEstimate!.amountIn);
      const next = upperOutput !== null && predicted >= upperOutput ? (lower + upperOutput) / 2n : predicted;
      if (next <= lower) break;
      quotingMinimum = false;
      outputAmount = next;
    }
    mode?.signal?.throwIfAborted();
    if (!best) throw new Error('Could not find a transfer quote within this amount. Try a smaller amount.');
    if (mode?.preview) { previewContexts.set(best, {sdk, sourceBudget}); return best; }
    const prior = await sdk.listPayments({limit: 1000});
    return invoke('stable_begin', {operation: {...best, prior_payment_ids: prior.payments.map(p => p.id)}});
  };
  // Read-only previews must not queue behind a potentially slow background sweep.
  return mode?.preview ? prepare() : withSparkBalanceLock(prepare);
}
/** Persist a fresh Bitcoin preview directly; reverse payments still prepare their blinded receive outputs. */
export async function reviewStableTransfer(preview: StableOperation, sourceBudget: bigint, cashuBalance: number): Promise<StableOperation> {
  const context = previewContexts.get(preview);
  const sdk = await getSparkSdk();
  if (!context || context.sdk !== sdk || context.sourceBudget !== sourceBudget) throw new Error('Wallet or amount changed. Check the amount again.');
  if (preview.direction === 'toSats' || Date.now() - preview.created_at * 1000 > 15000) {
    return quoteStableConversion(preview.direction, BigInt(preview.output_amount), preview.mint_url, cashuBalance, sourceBudget);
  }
  return withSparkBalanceLock(async () => {
    if (await getSparkSdk() !== context.sdk) throw new Error('Wallet changed. Check the amount again.');
    if (preview.expires_at * 1000 <= Date.now() || sourceBudget > BigInt(cashuBalance) || BigInt(preview.max_debit) > sourceBudget) throw new Error('Amount or balance changed. Check the amount again.');
    const prior = await sdk.listPayments({limit:1000});
    return invoke('stable_begin', {operation:{...preview, id:crypto.randomUUID(), prior_payment_ids:prior.payments.map(p=>p.id)}});
  });
}
async function checkCashuReceipt(op: StableOperation, txId: string, nextStage: 'complete' | 'funded' = 'complete'): Promise<StableOperation> {
  const status = await invoke<string>('check_transaction_status', {txId});
  if (status === 'Success') return advance(op, nextStage);
  if (status === 'Pending') return op;
  throw new TransferFailedError(`The mint settlement returned ${status}. Keep this transfer saved and review its recovery options.`);
}
async function settle(op: StableOperation, payment: Payment): Promise<StableOperation> {
  if (payment.conversionDetails?.status === 'refunded') return advance(op, 'refunded', payment.id);
  if (payment.status === 'failed' || ['failed', 'refundNeeded'].includes(payment.conversionDetails?.status ?? '')) throw new TransferFailedError('The conversion payment failed or needs recovery. Keep this transfer saved.');
  if (payment.status !== 'completed' || payment.conversionDetails?.status === 'pending') return op;
  if (op.direction === 'toUsd') {
    if (payment.details?.type !== 'token' || !isUsdb(payment.details.metadata.identifier) || payment.amount < BigInt(op.output_amount)) throw new TransferPendingError('The Dollar conversion receipt is not confirmed yet.', op);
    return advance(op, 'complete', payment.id);
  }
  if (op.stage === 'converting') op = await advance(op, 'settling', payment.id);
  return checkCashuReceipt(op, op.mint_quote_id);
}
async function waitForFunding(sdk: BreezSdk, sats: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const info = await sdk.getInfo({ensureSynced: true});
    if (info.balanceSats >= sats) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Funding was sent. Spark is still syncing it; use Continue conversion shortly.');
}
export async function executeStableConversion(id: string): Promise<StableOperation> {
  return withSparkBalanceLock(async () => {
    let op = (await getStableOperations()).find(o => o.id === id);
    if (!op || !['quoted', 'funded'].includes(op.stage)) throw new Error('Check the saved conversion status before continuing.');
    const sdk = await checkedSdk();
    if (op.stage === 'quoted' && op.expires_at * 1000 <= Date.now()) throw new Error('Quote expired. Cancel it and request a new quote.');
    if (op.direction === 'toUsd' && op.stage === 'quoted') op = await invoke<StableOperation>('stable_fund', {id});
    let prep = decodeQuote<PrepareSendPaymentResponse>(op.quote_json);
    if (op.direction === 'toUsd') {
      await waitForFunding(sdk, op.funding_sats);
      // Requote after bridge confirmation. Never top up or exceed the approved amount.
      if (prep.paymentMethod.type !== 'sparkAddress') throw new Error('Invalid saved destination.');
      prep = await sdk.prepareSendPayment({paymentRequest: {type: 'input', input: prep.paymentMethod.address}, amount: BigInt(op.output_amount), tokenIdentifier: USDB_TOKEN_ID, conversionOptions: prep.conversionEstimate!.options, feePolicy: 'feesExcluded'});
      if (prep.paymentMethod.type !== 'sparkAddress' || conversionCost(checkedEstimate(prep, 'toUsd')) + prep.paymentMethod.fee > BigInt(op.funding_sats)) throw new Error('The conversion price increased. Your funded sats remain in Spark. Continue later or recover them to ecash.');
    }
    if (op.direction === 'toSats') {
      if (prep.paymentMethod.type !== 'bolt11Invoice') throw new Error('Invalid saved ecash invoice.');
      prep = await sdk.prepareSendPayment({paymentRequest: {type: 'input', input: prep.paymentMethod.invoiceDetails.invoice.bolt11}, amount: BigInt(op.output_amount), conversionOptions: prep.conversionEstimate!.options, feePolicy: 'feesExcluded'});
      if (conversionCost(checkedEstimate(prep, 'toSats')) > BigInt(op.max_debit)) throw new Error('The USD quote changed. Cancel it and request a fresh quote.');
    }
    op = await advance(op, 'converting');
    if (op.conversion_request_version !== 1) throw new Error('Restart the app to load the updated wallet backend before converting.');
    // AMM/token legs reject idempotency keys before sending. The durable stage prevents retries.
    // https://github.com/breez/spark-sdk/blob/main/crates/breez-sdk/core/src/sdk/payments/send/mod.rs
    try {
      const sent = await sdk.sendPayment({prepareResponse: prep});
      op = await advance(op, 'converting', sent.payment.id);
      return await settle(op, sent.payment);
    } catch (error) {
      if (error instanceof TransferFailedError) throw error;
      // The durable converting stage already reserves the funds. A transport or sync
      // error after submission cannot establish failure; recover by checking, never resending.
      throw new TransferPendingError(transferErrorDetails(error), op);
    }
  });
}
export async function checkStableConversion(id: string): Promise<StableOperation> {
  return withSparkBalanceLock(async () => {
    let op = (await getStableOperations()).find(o => o.id === id);
    if (!op) throw new Error('Conversion not found.');
    if (op.stage === 'converting' && (op.conversion_request_version ?? 0) === 0 && !op.payment_id) {
      // Every legacy AMM attempt included a key, so the SDK rejected it before conversion.
      return invoke<StableOperation>('stable_recover_legacy_conversion', {id});
    }
    if (!['funding', 'converting', 'settling', 'returning'].includes(op.stage)) return op;
    if (op.stage === 'funding') {
      return checkCashuReceipt(op, `stable-fund-${op.id}`, 'funded');
    }
    const sdk = await checkedSdk();
    await sdk.syncWallet({});
    if (op.stage === 'returning') {
      return checkCashuReceipt(op, op.return_quote_id);
    }
    if (op.stage === 'settling') {
      return checkCashuReceipt(op, op.mint_quote_id);
    }
    if (op.stage !== 'converting') return op;
    if (op.payment_id) return settle(op, (await sdk.getPayment({paymentId: op.payment_id})).payment);
    if (op.direction === 'toSats') {
      const status = await invoke<string>('check_transaction_status', {txId: op.mint_quote_id});
      if (status === 'Success') return advance(op, 'complete');
    }
    const payments = (await sdk.listPayments({fromTimestamp: op.created_at - 5, limit: 1000})).payments;
    const refunded = payments.filter(p => !op!.prior_payment_ids.includes(p.id) && p.conversionDetails?.status === 'refunded' && (p.details?.type === 'spark' || p.details?.type === 'token') && p.details.conversionInfo?.type === 'amm' && p.details.conversionInfo.purpose?.type === 'selfTransfer');
    if (op.direction === 'toUsd' && refunded.length === 1) return advance(op, 'refunded', refunded[0].id);
    const candidates = payments.filter(p => {
      if (op!.prior_payment_ids.includes(p.id) || p.paymentType !== 'receive' || p.status !== 'completed') return false;
      const details = p.details;
      if (op!.direction !== 'toUsd' || details?.type !== 'token' || !isUsdb(details.metadata.identifier)) return false;
      const conversion = details.conversionInfo;
      return conversion?.type === 'amm' && conversion.purpose?.type === 'selfTransfer' && details.metadata.decimals === USD_DECIMALS && p.amount >= BigInt(op!.output_amount) && p.amount <= BigInt(op!.output_amount) * 10010n / 10000n + 1n;
    });
    if (candidates.length === 1) return settle(op, candidates[0]);
    throw new TransferPendingError('Conversion is not confirmed yet. No payment was repeated. Keep this operation saved and check again.', op);
  });
}

export async function quoteFundingReturn(id: string): Promise<StableOperation> {
  return withSparkBalanceLock(async () => {
    const op = (await getStableOperations()).find(o => o.id === id);
    if (!op || op.stage !== 'funded') throw new Error('Only unconverted funding can be returned.');
    const sdk = await checkedSdk();
    const budget = Math.min(op.funding_sats, (await sdk.getInfo({ensureSynced: true})).balanceSats);
    const amount = budget - Math.max(15, Math.ceil(budget * 0.005));
    if (amount <= 0) throw new Error('The funded amount is too small to cover the return fee.');
    const quote = await invoke<{quote_id: string; invoice: string}>('receive_lightning', {mintUrl: op.mint_url, amount});
    const prep = await sdk.prepareSendPayment({paymentRequest: {type: 'input', input: quote.invoice}, amount: BigInt(amount), feePolicy: 'feesExcluded'});
    if (prep.paymentMethod.type !== 'bolt11Invoice') throw new Error('Unexpected ecash return payment method.');
    const fee = prep.paymentMethod.lightningFeeSats + (prep.paymentMethod.sparkTransferFeeSats ?? 0);
    if (BigInt(amount + fee) > BigInt(budget)) throw new Error('The return fee exceeds the available funding. Try again later.');
    return invoke('stable_prepare_return', {id, quoteId: quote.quote_id, quoteJson: encodeQuote(prep), amount});
  });
}
export async function executeFundingReturn(id: string): Promise<StableOperation> {
  return withSparkBalanceLock(async () => {
    let op = (await getStableOperations()).find(o => o.id === id);
    if (!op || op.stage !== 'returnQuoted') throw new Error('Review the return quote first.');
    const sdk = await checkedSdk();
    const prep = decodeQuote<PrepareSendPaymentResponse>(op.return_quote_json);
    op = await advance(op, 'returning');
    const result = await sdk.sendPayment({prepareResponse: prep, idempotencyKey: op.id});
    op = await advance(op, 'returning', result.payment.id);
    return checkCashuReceipt(op, op.return_quote_id);
  });
}

/** The SDK refunds eligible conversion swaps; it never resends the original payment. */
export async function recoverPendingConversion(id: string): Promise<StableOperation> {
  const restored = await withSparkBalanceLock(async () => {
    const op = (await getStableOperations()).find(o => o.id === id);
    if (!op || op.stage !== 'converting') throw new Error('This conversion has no pending swap to recover.');
    if ((op.conversion_request_version ?? 0) === 0 && !op.payment_id) {
      return invoke<StableOperation>('stable_recover_legacy_conversion', {id});
    }
    await (await checkedSdk()).refundPendingConversions();
    return null;
  });
  return restored ?? checkStableConversion(id);
}
