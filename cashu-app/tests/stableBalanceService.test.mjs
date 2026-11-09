import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const serviceUrl = new URL('../src/services/stableBalanceService.ts', import.meta.url).href;
const stub = source => 'data:text/javascript,' + encodeURIComponent(source);
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === serviceUrl) {
    if (specifier === '@tauri-apps/api/core') return {url: stub('export const invoke = (...args) => globalThis.__stableTest.invoke(...args);'), shortCircuit: true};
    if (specifier === './sparkService') return {url: stub('export const getSparkSdk = async () => globalThis.__stableTest.sdk;'), shortCircuit: true};
    if (specifier.startsWith('./')) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return next(specifier, context);
}});
const service = await import(serviceUrl);
const {USDB_TOKEN_ID} = await import('../src/services/stableBalanceModel.ts');
const metadata = {identifier: USDB_TOKEN_ID, decimals: 6};
const complete = {id: 'payment-one', status: 'completed', amount: 1000000n, paymentType: 'receive', details: {type: 'token', metadata, conversionInfo: {type: 'amm', purpose: {type: 'selfTransfer'}}}};
function fixture() {
  const f = { operations: [], calls: [], sends: 0, funding: 0, infoSats: 1000, raised: false, timeout: false, paidMint: true, payments: [], sendRequests: [] };
  const prep = (request) => {
    const toUsd = request.conversionOptions?.conversionType.type === 'fromBitcoin';
    return { amount: request.amount, feePolicy: 'feesExcluded', paymentMethod: request.paymentRequest.input === 'own-spark-address' ? {type: 'sparkAddress', address: 'own-spark-address', fee: 0n} : {type: 'bolt11Invoice', lightningFeeSats: 1, invoiceDetails: {invoice: {bolt11: 'mint-invoice', source: 'manual'}}}, conversionEstimate: request.conversionOptions ? {options: request.conversionOptions, amountIn: toUsd ? (f.raised ? 1200n : 998n) : 1000000n, amountOut: toUsd ? 1000000n : request.amount + 1n, fee: toUsd ? 2n : 100n} : undefined };
  };
  f.sdk = {
    getTokensMetadata: async () => ({tokensMetadata: [metadata]}),
    getInfo: async () => ({balanceSats: f.infoSats, tokenBalances: new Map([[USDB_TOKEN_ID, {balance: 2000000n, tokenMetadata: metadata}]])}),
    fetchConversionLimits: async () => ({minToAmount: 1n}),
    receivePayment: async req => ({paymentRequest: req.paymentMethod.type === 'sparkAddress' ? 'own-spark-address' : 'funding-invoice', fee: 0n}),
    prepareSendPayment: async req => prep(req),
    listPayments: async () => ({payments: f.payments}),
    syncWallet: async () => {},
    sendPayment: async request => {
      f.sendRequests.push(request);
      if (request.idempotencyKey != null && (request.prepareResponse.tokenIdentifier != null || request.prepareResponse.conversionEstimate != null)) {
        throw Error('Invalid input: Idempotency key is not supported for payments with a token transfer leg (direct token send or AMM conversion).');
      }
      f.sends++;
      if(f.timeout) throw Error('timeout');
      return {payment: complete};
    },
  };
  f.invoke = async (cmd, args) => {
    f.calls.push({cmd, args});
    if(cmd === 'stable_operations') return structuredClone(f.operations);
    if(cmd === 'spark_is_sending') return false;
    if(cmd === 'stable_funding_quote') return 1005;
    if(cmd === 'receive_lightning' || cmd === 'stable_mint_quote_preview') return {quote_id: 'mint-quote', invoice: 'mint-invoice'};
    if(cmd === 'stable_begin') {f.operations.push(structuredClone(args.operation)); return structuredClone(args.operation);}
    const op = f.operations.find(o => o.id === args?.id);
    if(cmd === 'stable_fund') {assert.equal(op.stage, 'quoted'); f.funding++; op.stage = 'funded'; return structuredClone(op);}
    if(cmd === 'stable_recover_legacy_conversion') {
      assert.equal(op.stage, 'converting'); assert.equal(op.conversion_request_version ?? 0, 0); assert.equal(op.payment_id, null);
      op.stage = op.direction === 'toUsd' ? 'funded' : 'quoted'; op.conversion_request_version = 1; return structuredClone(op);
    }
    if(cmd === 'stable_advance') {assert.equal(op.stage, args.expectedStage); if(op.stage !== 'converting' && args.nextStage === 'converting') op.conversion_request_version = 1; op.stage = args.nextStage; if(args.paymentId) op.payment_id = args.paymentId; return structuredClone(op);}
    if(cmd === 'stable_prepare_return') {op.stage = 'returnQuoted'; op.return_quote_id = args.quoteId; op.return_quote_json = args.quoteJson; op.return_amount = args.amount; return structuredClone(op);}
    if(cmd === 'check_transaction_status') { if(!f.paidMint) throw Error('mint unavailable'); return 'Success'; }
    throw Error('Unexpected command ' + cmd);
  };
  globalThis.__stableTest = f;
  return f;
}
test('quotes without moving money, confirms ecash funding once, and completes USDB conversion', async () => {
  const f = fixture();
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'https://mint.example', 2000);
  assert.equal(f.sends, 0); assert.equal(f.funding, 0); assert.equal(op.max_debit, '1005');
  const result = await service.executeStableConversion(op.id);
  assert.equal(result.stage, 'complete'); assert.equal(f.funding, 1); assert.equal(f.sends, 1);
  await assert.rejects(service.executeStableConversion(op.id));
  assert.equal(f.sends, 1); assert.equal(f.funding, 1);
});
test('insufficient ecash and expired quotes do not move funds', async () => {
  const f = fixture();
  await assert.rejects(service.quoteStableConversion('toUsd', 1000000n, 'mint', 1), /Insufficient balance/);
  assert.equal(f.operations.length, 0);
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  f.operations[0].expires_at = 0;
  await assert.rejects(service.executeStableConversion(op.id), /expired/);
  assert.equal(f.funding, 0); assert.equal(f.sends, 0);
});
test('repricing cannot silently fund additional sats; funded amount can be returned', async () => {
  const f = fixture();
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  f.raised = true;
  await assert.rejects(service.executeStableConversion(op.id), /price increased/);
  assert.equal(f.operations[0].stage, 'funded'); assert.equal(f.sends, 0);
  const quote = await service.quoteFundingReturn(op.id);
  assert.equal(quote.stage, 'returnQuoted'); assert.equal(quote.return_amount, 985);
  assert.equal((await service.executeFundingReturn(op.id)).stage, 'complete');
  assert.equal(f.funding, 1); assert.equal(f.sends, 1);
});
test('ambiguous conversion cannot be resent, including after reloading journal', async () => {
  const f = fixture();
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  f.timeout = true;
  await assert.rejects(service.executeStableConversion(op.id), /timeout/);
  assert.equal(f.operations[0].stage, 'converting');
  await assert.rejects(service.executeStableConversion(op.id));
  await assert.rejects(service.checkStableConversion(op.id), /not confirmed/);
  assert.equal(f.sends, 1);
  f.payments = [complete];
  assert.equal((await service.checkStableConversion(op.id)).stage, 'complete');
  assert.equal(f.sends, 1);
});
test('USD conversion pays a unique mint invoice and waits for issued ecash', async () => {
  const f = fixture();
  const op = await service.quoteStableConversion('toSats', 500n, 'mint', 0);
  f.paidMint = false;
  await assert.rejects(service.executeStableConversion(op.id), /mint unavailable/);
  assert.equal(f.operations[0].stage, 'settling'); assert.equal(f.funding, 0);
  f.paidMint = true;
  assert.equal((await service.checkStableConversion(op.id)).stage, 'complete');
  assert.equal(f.sends, 1);
});
test('unexpected token metadata fails closed before a quote or transfer', async () => {
  const f = fixture();
  f.sdk.getTokensMetadata = async () => ({tokensMetadata: [{identifier: 'fake-usdb', decimals: 6}]});
  await assert.rejects(service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000), /verify/);
  assert.equal(f.sends, 0); assert.equal(f.operations.length, 0);
});

test('recovery ignores preexisting transfers and waits when more than one receipt matches', async () => {
  const f = fixture(); f.payments = [complete];
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  f.timeout = true; await assert.rejects(service.executeStableConversion(op.id));
  await assert.rejects(service.checkStableConversion(op.id), /not confirmed/);
  f.payments.push({...complete,id:'other-one'}, {...complete,id:'other-two'});
  await assert.rejects(service.checkStableConversion(op.id), /not confirmed/);
  assert.equal(f.sends,1);
});
test('provider-confirmed swap refunds release the reservation without resending', async () => {
  const f = fixture(); const op = await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
  f.timeout = true; await assert.rejects(service.executeStableConversion(op.id));
  f.sdk.refundPendingConversions = async () => { f.payments = [{...complete, paymentType:'send', conversionDetails:{status:'refunded'}}]; return {refunded:1, skipped:0, failed:0}; };
  assert.equal((await service.recoverPendingConversion(op.id)).stage,'refunded');
  assert.equal(await service.getActiveConversion(),null); assert.equal(f.sends,1);
});


test('both AMM conversion directions omit unsupported idempotency keys', async () => {
  for (const direction of ['toUsd', 'toSats']) {
    const f = fixture();
    const op = await service.quoteStableConversion(direction, direction === 'toUsd' ? 1000000n : 500n, 'mint', 2000);
    assert.equal((await service.executeStableConversion(op.id)).stage, 'complete');
    assert.equal(f.sendRequests.length, 1);
    assert.equal(Object.hasOwn(f.sendRequests[0], 'idempotencyKey'), false);
  }
});

test('plain BTC funding returns retain their supported idempotency key', async () => {
  const f = fixture();
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  f.raised = true;
  await assert.rejects(service.executeStableConversion(op.id), /price increased/);
  await service.quoteFundingReturn(op.id);
  await service.executeFundingReturn(op.id);
  assert.equal(f.sendRequests[0].idempotencyKey, op.id);
  assert.equal(f.sendRequests[0].prepareResponse.conversionEstimate, undefined);
});


test('saved attempts rejected by the old SDK call resume without funding ecash twice', async () => {
  for (const direction of ['toUsd', 'toSats']) {
    const f = fixture();
    const quote = await service.quoteStableConversion(direction, direction === 'toUsd' ? 1000000n : 500n, 'mint', 2000);
    const saved = f.operations[0];
    saved.stage = 'converting';
    delete saved.conversion_request_version; // encrypted journal written by the old build
    f.funding = direction === 'toUsd' ? 1 : 0;
    const reset = await service.checkStableConversion(quote.id);
    assert.equal(reset.stage, direction === 'toUsd' ? 'funded' : 'quoted');
    assert.equal(f.sendRequests.length, 0);
    assert.equal((await service.executeStableConversion(quote.id)).stage, 'complete');
    assert.equal(f.funding, direction === 'toUsd' ? 1 : 0);
    assert.equal(f.sends, 1);
  }
});

test('updated frontend cannot send through an old backend without a persisted request marker', async () => {
  const f = fixture();
  const invoke = f.invoke;
  f.invoke = async (cmd, args) => {
    const result = await invoke(cmd, args);
    if (cmd === 'stable_advance' && args.nextStage === 'converting') {
      delete result.conversion_request_version;
      delete f.operations[0].conversion_request_version;
    }
    return result;
  };
  const op = await service.quoteStableConversion('toUsd', 1000000n, 'mint', 2000);
  await assert.rejects(service.executeStableConversion(op.id), /updated wallet backend/);
  assert.equal(f.sendRequests.length, 0);
  assert.equal(f.funding, 1);
});


test('source amount and full-balance shortcuts leave room for fees before review', async () => {
  const f = fixture();
  f.sdk.prepareSendPayment = async req => ({amount:req.amount, feePolicy:'feesExcluded', paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n}, conversionEstimate:{options:req.conversionOptions,amountIn:req.amount / 1000n,amountOut:req.amount,fee:2n}});
  f.sdk.receivePayment = async req => ({paymentRequest:req.paymentMethod.type === 'sparkAddress' ? 'own-spark-address' : 'fund-'+req.paymentMethod.amountSats,fee:0n});
  const original = f.invoke;
  f.invoke = async (cmd,args) => cmd === 'stable_funding_quote' ? Number(args.invoice.slice(5)) + 5 : original(cmd,args);
  const op = await service.quoteStableConversion('toUsd',1000000n,'mint',1000,1000n);
  assert.ok(BigInt(op.max_debit) <= 1000n);
  assert.ok(BigInt(op.output_amount) < 1000000n);
  assert.equal(f.operations.length,1);
  assert.equal(f.sends,0); assert.equal(f.funding,0);
});

test('Dollar source quotes fit fees before saving one reviewed operation', async () => {
  const f = fixture();
  f.sdk.prepareSendPayment = async req => ({amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'bolt11Invoice',lightningFeeSats:1,invoiceDetails:{invoice:{bolt11:'mint-invoice'}}},conversionEstimate:{options:req.conversionOptions,amountIn:req.amount * 1000n,amountOut:req.amount,fee:10000n}});
  const op = await service.quoteStableConversion('toSats',1000n,'mint',0,1000000n);
  assert.ok(BigInt(op.max_debit) <= 1000000n);
  assert.ok(BigInt(op.output_amount) < 1000n);
  assert.equal(f.operations.length,1); assert.equal(f.sends,0);
});
test('quoting never saves a transfer if the provider cannot fit its source budget', async () => {
  const f = fixture();
  await assert.rejects(service.quoteStableConversion('toUsd',1000000n,'mint',1000,1000n), /within this amount/);
  assert.equal(f.operations.length,0); assert.equal(f.funding,0); assert.equal(f.sends,0);
});

test('exposes provider minimums in the correct source currency before review', async () => {
  const f = fixture(); const requests = [];
  f.sdk.fetchConversionLimits = async req => {requests.push(req); return {minFromAmount:req.conversionType.type==='fromBitcoin'?800n:1000000n,minToAmount:1n};};
  assert.equal((await service.getStableTransferLimits('toUsd')).minSource,800n);
  assert.equal((await service.getStableTransferLimits('toSats')).minSource,1000000n);
  assert.equal(requests[1].conversionType.fromTokenIdentifier,USDB_TOKEN_ID);
  assert.equal(f.sends,0);
});
test('corrects the reported 723 versus 800 minimum mismatch without increasing source budget', async () => {
  const f = fixture();
  f.sdk.fetchConversionLimits = async () => ({minFromAmount:800n});
  f.sdk.prepareSendPayment = async req => {
    const input = req.amount * 723n / 750000n;
    if(input<800n)throw Error(`Generic: Amount in ${input} is less than minimum required 800 for asset 02020202`);
    return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:input,amountOut:req.amount,fee:2n}};
  };
  f.sdk.receivePayment = async req => ({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
  const invoke = f.invoke;
  f.invoke = async (cmd,args) => cmd==='stable_funding_quote'?Number(args.invoice.slice(5))+5:invoke(cmd,args);
  const op = await service.previewStableTransfer('toUsd',750000n,'mint',4276,1000n);
  assert.ok(BigInt(op.max_debit)<=1000n); assert.ok(op.funding_sats>=800);
  assert.equal(f.operations.length,0); assert.equal(f.funding,0); assert.equal(f.sends,0);
});
test('live previews do not create history or save an operation in either direction', async () => {
  for(const direction of ['toUsd','toSats']) {
    const f=fixture();
    await service.previewStableTransfer(direction, direction==='toUsd'?1000000n:500n,'mint',2000,direction==='toUsd'?2000n:2000000n);
    assert.equal(f.operations.length,0);
    assert.equal(f.calls.some(c=>c.cmd==='receive_lightning'),false);
    assert.equal(f.funding,0);assert.equal(f.sends,0);
  }
});
test('below-minimum budgets fail with a usable threshold before requesting a payment quote', async () => {
  const f=fixture();f.sdk.fetchConversionLimits=async()=>({minFromAmount:800n});
  f.sdk.prepareSendPayment=async()=>{throw Error('should not quote');};
  await assert.rejects(service.previewStableTransfer('toUsd',500000n,'mint',2000,500n),error=>error.minimum===800n && error.includesFees===false);
  assert.equal(f.calls.some(c=>c.cmd==='receive_lightning'),false);assert.equal(f.funding,0);
});

test('a budget at the provider minimum gets a fee-inclusive recommendation before review', async () => {
  const f=fixture();f.sdk.fetchConversionLimits=async()=>({minFromAmount:800n});
  f.sdk.prepareSendPayment=async req=>{
    const input=req.amount/1000n;
    if(input<800n)throw Error(`Amount in ${input} is less than minimum required 800 for asset btc`);
    return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:input,amountOut:req.amount,fee:2n}};
  };
  f.sdk.receivePayment=async req=>({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
  const invoke=f.invoke;f.invoke=async(cmd,args)=>cmd==='stable_funding_quote'?Number(args.invoice.slice(5))+5:invoke(cmd,args);
  await assert.rejects(service.previewStableTransfer('toUsd',800000n,'mint',1000,800n),error=>error.minimum===807n&&error.includesFees);
  assert.equal(f.operations.length,0);assert.equal(f.funding,0);assert.equal(f.sends,0);
});
test('obsolete live checks abort before querying the wallet or provider', async()=>{
  const f=fixture();const controller=new AbortController();controller.abort();
  await assert.rejects(service.previewStableTransfer('toUsd',750000n,'mint',1000,1000n,controller.signal),error=>error.name==='AbortError');
  assert.equal(f.calls.length,0);assert.equal(f.sends,0);
});

test('fee-inclusive minimum is quoted at the provider minimum, not an oversized cached-price quote', async()=>{
  const f=fixture();f.sdk.fetchConversionLimits=async()=>({minFromAmount:800n});
  f.sdk.prepareSendPayment=async req=>{
    const input=req.amount/1000n;
    if(input<800n)throw Error(`Amount in ${input} is less than minimum required 800 for asset btc`);
    return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:input,amountOut:req.amount,fee:2n}};
  };
  f.sdk.receivePayment=async req=>({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
  const invoke=f.invoke;f.invoke=async(cmd,args)=>cmd==='stable_funding_quote'?Number(args.invoice.slice(5))+500:invoke(cmd,args);
  // Integer provider inputs can round the rescaled minimum up by one sat.
  await assert.rejects(service.previewStableTransfer('toUsd',10000000n,'mint',5000,1000n),error=>error.minimum>=1302n&&error.minimum<=1303n&&error.includesFees);
  assert.equal(f.operations.length,0);assert.equal(f.sends,0);
});

test('reuses verified asset metadata and short-lived limits across amount checks',async()=>{
 const f=fixture();let metadataCalls=0,limitCalls=0;
 const metadata=f.sdk.getTokensMetadata,limits=f.sdk.fetchConversionLimits;
 f.sdk.getTokensMetadata=async req=>{metadataCalls++;return metadata(req)};
 f.sdk.fetchConversionLimits=async req=>{limitCalls++;return limits(req)};
 await service.getStableTransferLimits('toUsd');await service.getStableTransferLimits('toUsd');
 assert.equal(metadataCalls,1);assert.equal(limitCalls,1);
});
test('read-only amount checks do not wait behind background balance work',async()=>{
 const f=fixture();const {withSparkBalanceLock}=await import('../src/services/sparkBalanceLock.ts');
 let release;const blocked=new Promise(resolve=>{release=resolve});
 const background=withSparkBalanceLock(()=>blocked);
 const preview=service.previewStableTransfer('toUsd',1000000n,'mint',2000,1005n);
 const finished=await Promise.race([preview.then(()=>true),new Promise(resolve=>setImmediate(()=>resolve(false)))]);
 release();await background;await preview;
 assert.equal(finished,true);assert.equal(f.sends,0);
});
test('Bitcoin review reuses a fresh checked preview instead of quoting all over again',async()=>{
 const f=fixture();let prepares=0;
 const prepare=f.sdk.prepareSendPayment;
 f.sdk.prepareSendPayment=async req=>{prepares++;return prepare(req)};
 const preview=await service.previewStableTransfer('toUsd',1000000n,'mint',2000,1005n);
 const before=prepares,feeCalls=f.calls.filter(c=>c.cmd==='stable_funding_quote').length;
 const reviewed=await service.reviewStableTransfer(preview,1005n,2000);
 assert.equal(reviewed.stage,'quoted');assert.equal(prepares,before);
 assert.equal(f.calls.filter(c=>c.cmd==='stable_funding_quote').length,feeCalls);
 assert.equal(f.operations.length,1);assert.equal(f.funding,0);assert.equal(f.sends,0);
});

test('fresh preview reuse assigns a new operation ID after editing a reviewed quote',async()=>{
 const f=fixture();const preview=await service.previewStableTransfer('toUsd',1000000n,'mint',2000,1005n);
 const first=await service.reviewStableTransfer(preview,1005n,2000);await service.cancelConversion(first);
 const second=await service.reviewStableTransfer(preview,1005n,2000);
 assert.notEqual(first.id,second.id);assert.notEqual(first.id,preview.id);assert.equal(second.stage,'quoted');
});
test('a preview cannot be reused after switching wallets',async()=>{
 const f=fixture();const preview=await service.previewStableTransfer('toUsd',1000000n,'mint',2000,1005n);
 f.sdk={...f.sdk};
 await assert.rejects(service.reviewStableTransfer(preview,1005n,2000),/Wallet or amount changed/);
 assert.equal(f.operations.length,0);assert.equal(f.sends,0);
});
test('older checked previews refresh before review',async()=>{
 const f=fixture();let prepares=0;const prepare=f.sdk.prepareSendPayment;
 f.sdk.prepareSendPayment=async req=>{prepares++;return prepare(req)};
 const preview=await service.previewStableTransfer('toUsd',1000000n,'mint',2000,1005n);const before=prepares;
 preview.created_at-=16;
 await service.reviewStableTransfer(preview,1005n,2000);
 assert.ok(prepares>before);assert.equal(f.operations.length,1);assert.equal(f.sends,0);
});

test('a temporary asset validation failure does not poison later checks',async()=>{
 const f=fixture();const valid=f.sdk.getTokensMetadata;
 f.sdk.getTokensMetadata=async()=>{throw Error('temporary network failure')};
 await assert.rejects(service.getStableTransferLimits('toUsd'),/temporary/);
 f.sdk.getTokensMetadata=valid;
 assert.equal((await service.getStableTransferLimits('toUsd')).minReceive,1n);
});
test('Dollar preview avoids a full sync but review still prepares recoverable ecash outputs',async()=>{
 const f=fixture();const syncing=[];const getInfo=f.sdk.getInfo;
 f.sdk.getInfo=async request=>{syncing.push(request.ensureSynced);return getInfo(request)};
 const preview=await service.previewStableTransfer('toSats',500n,'mint',0,1000100n);
 assert.deepEqual(syncing,[false]);
 await service.reviewStableTransfer(preview,1000100n,0);
 assert.ok(syncing.includes(true));
 assert.ok(f.calls.some(c=>c.cmd==='receive_lightning'));
 assert.equal(f.operations.length,1);assert.equal(f.sends,0);
});

test('fee rounding plateaus still find a valid quote within the selected budget', async () => {
  const f=fixture();let prepares=0;
  f.sdk.prepareSendPayment=async req=>{prepares++;return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:(req.amount+999n)/1000n,amountOut:req.amount,fee:0n}}};
  f.sdk.receivePayment=async req=>({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
  const invoke=f.invoke;
  // A stepped Lightning fee reserve: several output reductions return the same debit.
  f.invoke=async(cmd,args)=>cmd==='stable_funding_quote'?Math.ceil(Number(args.invoice.slice(5))/100)*100+5:invoke(cmd,args);
  const op=await service.previewStableTransfer('toUsd',1000000n,'mint',1000,1000n);
  assert.ok(BigInt(op.max_debit)<=1000n);
  assert.ok(BigInt(op.output_amount)>0n);
  assert.ok(prepares<=12);
  assert.equal(f.operations.length,0);assert.equal(f.sends,0);assert.equal(f.funding,0);
});

test('a valid quote is retained when further budget fitting encounters a fee step', async () => {
 const f=fixture();let prepares=0;
 f.sdk.prepareSendPayment=async req=>{prepares++;return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:(req.amount+999n)/1000n,amountOut:req.amount,fee:0n}}};
 f.sdk.receivePayment=async req=>({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
 const invoke=f.invoke;
 f.invoke=async(cmd,args)=>cmd==='stable_funding_quote'?Number(args.invoice.slice(5))+(Number(args.invoice.slice(5))>950?100:5):invoke(cmd,args);
 const op=await service.previewStableTransfer('toUsd',900000n,'mint',1000,1000n);
 assert.ok(BigInt(op.max_debit)<=1000n);
 assert.ok(BigInt(op.output_amount)>=900000n);
 assert.ok(prepares<=12);
 assert.equal(f.operations.length,0);assert.equal(f.sends,0);
});

test('Dollar-to-Bitcoin fitting handles stepped conversion fees without exceeding the Dollar budget', async () => {
  const f=fixture();let prepares=0;
  f.sdk.prepareSendPayment=async req=>{
    prepares++;
    const input=req.amount*1000n;
    return {amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'bolt11Invoice',lightningFeeSats:1,invoiceDetails:{invoice:{bolt11:'mint-invoice'}}},conversionEstimate:{options:req.conversionOptions,amountIn:input,amountOut:req.amount,fee:(100000n-input%100000n)%100000n+5000n}};
  };
  const op=await service.previewStableTransfer('toSats',1000n,'mint',0,1000000n);
  assert.ok(BigInt(op.max_debit)<=1000000n);
  assert.ok(BigInt(op.output_amount)>=890n);
  assert.ok(prepares<=12);
  assert.equal(f.operations.length,0);assert.equal(f.sends,0);assert.equal(f.funding,0);
});

test('bounded fitting keeps the best fitting invoice and preparation together when reviewed', async () => {
  const f=fixture();
  f.sdk.prepareSendPayment=async req=>({amount:req.amount,feePolicy:'feesExcluded',paymentMethod:{type:'sparkAddress',address:'own-spark-address',fee:0n},conversionEstimate:{options:req.conversionOptions,amountIn:(req.amount+999n)/1000n,amountOut:req.amount,fee:0n}});
  f.sdk.receivePayment=async req=>({paymentRequest:req.paymentMethod.type==='sparkAddress'?'own-spark-address':'fund-'+req.paymentMethod.amountSats,fee:0n});
  const invoke=f.invoke;
  f.invoke=async(cmd,args)=>cmd==='stable_funding_quote'?Math.ceil(Number(args.invoice.slice(5))/100)*100+5:invoke(cmd,args);
  const preview=await service.previewStableTransfer('toUsd',1000000n,'mint',1000,1000n);
  const op=await service.reviewStableTransfer(preview,1000n,1000);
  assert.equal(op.funding_invoice,'fund-'+op.funding_sats);
  assert.equal(op.funding_sats,Number((BigInt(op.output_amount)+999n)/1000n));
  assert.ok(BigInt(op.max_debit)<=1000n);
  assert.equal(f.operations.length,1);assert.equal(f.sends,0);assert.equal(f.funding,0);
});

test('a submitted pending conversion is processing, then completes without another send', async()=>{
 const f=fixture();const send=f.sdk.sendPayment;
 f.sdk.sendPayment=async request=>{const result=await send(request);return {payment:{...result.payment,status:'pending'}}};
 f.sdk.getPayment=async()=>({payment:complete});
 const quoted=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 const processing=await service.executeStableConversion(quoted.id);
 assert.equal(processing.stage,'converting');assert.equal(processing.payment_id,complete.id);
 assert.equal((await service.checkStableConversion(quoted.id)).stage,'complete');
 assert.equal(f.sends,1);assert.equal(f.funding,1);
});

test('a paid Dollar conversion waits until the mint actually confirms issued ecash', async()=>{
 const f=fixture();const invoke=f.invoke;let mintStatus='Pending';
 f.invoke=async(cmd,args)=>cmd==='check_transaction_status'?mintStatus:invoke(cmd,args);
 const quoted=await service.quoteStableConversion('toSats',500n,'mint',0);
 assert.equal((await service.executeStableConversion(quoted.id)).stage,'settling');
 assert.equal((await service.checkStableConversion(quoted.id)).stage,'settling');
 mintStatus='Success';assert.equal((await service.checkStableConversion(quoted.id)).stage,'complete');
 assert.equal(f.sends,1);
});

test('a send timeout preserves its cause as an unconfirmed outcome, never an invitation to resend', async()=>{
 const {TransferPendingError}=await import('../src/services/transferError.ts');
 const f=fixture();f.timeout=true;
 const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 await assert.rejects(service.executeStableConversion(op.id),error=>error instanceof TransferPendingError && error.message.includes('timeout'));
 assert.equal(f.operations[0].stage,'converting');assert.equal(f.sends,1);
});

test('an explicitly failed payment is reported as a real failure instead of pending or complete',async()=>{
 const {TransferFailedError}=await import('../src/services/transferError.ts');
 const f=fixture();const send=f.sdk.sendPayment;
 f.sdk.sendPayment=async request=>({payment:{...(await send(request)).payment,status:'failed'}});
 const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 await assert.rejects(service.executeStableConversion(op.id),error=>error instanceof TransferFailedError);
 assert.equal(f.operations[0].stage,'converting');assert.equal(f.sends,1);
});

test('pending funding is not advanced until its Cashu funding receipt succeeds',async()=>{
 const f=fixture(),invoke=f.invoke;let status='Pending';
 f.invoke=async(cmd,args)=>cmd==='check_transaction_status'?status:invoke(cmd,args);
 const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 f.operations[0].stage='funding';
 assert.equal((await service.checkStableConversion(op.id)).stage,'funding');
 status='Success';assert.equal((await service.checkStableConversion(op.id)).stage,'funded');
 assert.equal(f.sends,0);assert.equal(f.funding,0);
});

test('funding returns wait for the Cashu receipt and never send again during reconciliation',async()=>{
 const f=fixture(),invoke=f.invoke;let status='Pending';
 f.invoke=async(cmd,args)=>cmd==='check_transaction_status'?status:invoke(cmd,args);
 const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 f.operations[0].stage='funded';
 await service.quoteFundingReturn(op.id);
 assert.equal((await service.executeFundingReturn(op.id)).stage,'returning');
 assert.equal((await service.checkStableConversion(op.id)).stage,'returning');
 status='Success';assert.equal((await service.checkStableConversion(op.id)).stage,'complete');
 assert.equal(f.sends,1);
});

test('an explicit mint settlement failure stays unresolved and cannot produce success',async()=>{
 const {TransferFailedError}=await import('../src/services/transferError.ts');
 const f=fixture(),invoke=f.invoke;
 f.invoke=async(cmd,args)=>cmd==='check_transaction_status'?'FailedMintError':invoke(cmd,args);
 const op=await service.quoteStableConversion('toSats',500n,'mint',0);
 await assert.rejects(service.executeStableConversion(op.id),error=>error instanceof TransferFailedError);
 assert.equal(f.operations[0].stage,'settling');assert.equal(f.sends,1);
});

test('a completed journal receipt can be displayed without another provider sync',async()=>{
 const f=fixture();const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 await service.executeStableConversion(op.id);
 f.sdk={}; // Provider unavailable after completion; the saved receipt remains authoritative.
 assert.equal((await service.checkStableConversion(op.id)).stage,'complete');
 assert.equal(f.sends,1);
});

test('a completed transport payment still waits if its conversion is pending',async()=>{
 const f=fixture(),send=f.sdk.sendPayment;
 f.sdk.sendPayment=async request=>({payment:{...(await send(request)).payment,conversionDetails:{status:'pending'}}});
 const op=await service.quoteStableConversion('toUsd',1000000n,'mint',2000);
 assert.equal((await service.executeStableConversion(op.id)).stage,'converting');
 f.sdk.getPayment=async()=>({payment:{...complete,conversionDetails:{status:'completed'}}});
 assert.equal((await service.checkStableConversion(op.id)).stage,'complete');assert.equal(f.sends,1);
});
