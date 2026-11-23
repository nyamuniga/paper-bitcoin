import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createManualScheduler } from './helpers/manualScheduler.ts';
const source = new URL('../src/services/flowServices.ts', import.meta.url).href;
const fulfillmentOperationsSource = new URL('../src/services/momoFulfillmentOperations.ts', import.meta.url).href;
const transactionAccessSource = new URL('../src/services/momoTransactionAccess.ts', import.meta.url).href;
const balanceSource = new URL('../src/services/proxyBalanceService.ts', import.meta.url).href;
const stub = code => ({url:'data:text/javascript,'+encodeURIComponent(code), shortCircuit:true});
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === balanceSource) {
    if (specifier === '@tauri-apps/plugin-http') return stub('export const fetch=(...args)=>globalThis.__momo.fetch(...args);');
    if (specifier === '../constants.local') return stub('export const MOMO_API_BASE_URL="https://proxy.example";');
  }
  if (context.parentURL === source || context.parentURL === fulfillmentOperationsSource || context.parentURL === transactionAccessSource) {
    if (specifier === './momoService') return stub(`
      export const initiateMomoPaymentRequest=(...a)=>globalThis.__momo.init(...a);
      export const initiateMomoPayout=(...a)=>globalThis.__momo.payout(...a);
      export const checkMomoPaymentStatus=(...a)=>globalThis.__momo.status(...a);
      export const checkMomoPayoutStatus=()=>globalThis.__momo.status();`);
    if (specifier === './lightningService') return stub(`export const payLightningInvoice=()=>{globalThis.__momo.lightning++; return {success:true}}; export const createLightningInvoice=(...a)=>globalThis.__momo.createInvoice(...a);`);
    if (specifier === '../store/transactionStore') return stub('export const useTransactionStore={getState:()=>globalThis.__momo.store};');
    if (specifier === '../store/wallet') return stub('export const useWalletStore={getState:()=>({refreshWallet:async()=>{}})};');
    if (specifier === '../store/addressBookStore') return stub('export const useAddressBookStore={getState:()=>({recordSuccessfulUse:()=>{}})};');
    if (specifier === '@tauri-apps/api/core') return stub('export const invoke=(...a)=>globalThis.__momo.invoke(...a);');
    if (specifier === '@tauri-apps/plugin-http') return stub('export const fetch=(...args)=>globalThis.__momo.fetch(...args);');
    if (specifier === '../constants.local') return stub('export const EXCHANGE_RATE_API_URL="https://rate.example", SATS_PER_BTC=1e8, SPREAD=0.021, MOMO_WITHDRAWAL_FIXED_FEE=120, ECASH_LIGHTNING_FEE=10, RWF_USD_PEG=1400, POLLING_INTERVAL_MS=5000, POLLING_TIMEOUT_MS=120000, MOMO_API_BASE_URL="https://proxy.example";');
  }
  if (context.parentURL?.includes('/src/') && specifier.startsWith('.')) return next(new URL(specifier+'.ts',context.parentURL).href,context);
  return next(specifier,context);
},load(url,context,next) {
  if(url.endsWith('/types/momo.ts')) return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const flow = await import(source);
const { startPayoutInitiation } = await import('../src/services/payoutInitiation.ts');
const { fetchProxyBlinkBalance } = await import(balanceSource);
const {AppPhase} = await import('../src/types/momo.ts');
const base={id:'saved-id',direction:'SATS_TO_RWF',rwfAmount:1000,satsAmount:800,invoice:'same-invoice',mintQuoteId:'same-quote',status:'PENDING',invoicePaid:true,currentPhase:AppPhase.RECOVERY_REQUIRED};
function fixture(tx=null) {
  const f={posts:0,lightning:0,invocations:[],callArgs:[]};
  f.store={activeTransaction:tx,history:[],error:null,
    setActiveTransaction(t){this.activeTransaction=t},
    updateTransaction(t){this.activeTransaction={...this.activeTransaction,...t}},
    updateTransactionById(id,updates){
      const tx=this.activeTransaction?.id===id?this.activeTransaction:this.history.find(t=>t.id===id);
      if(!tx)return;
      const updated={...tx,...updates};
      if(this.activeTransaction?.id===id)this.activeTransaction=updated;
      this.history=[updated,...this.history.filter(t=>t.id!==id)];
    },
    updateTransactionPhase(p){this.updateTransaction({currentPhase:p})},
    setErrorForTransaction(id,error){if(this.activeTransaction?.id===id)this.error=error},
    setError(e){this.error=e},moveToHistory(t){this.history=[t,...this.history.filter(old=>old.id!==t.id)]},
  };
  f.createInvoice=async()=>{throw Error('Update required')};
  f.init=async()=>({success:false,submission:'rejected',message:'Update required'});
  f.payout=async()=>{f.posts++;return {success:false,submission:'rejected',message:'Update required'}};
  f.status=async()=>({status:'UNKNOWN',message:'No confirmation available'});
  f.paymentStatus=async()=>({status:'UNKNOWN',message:'No confirmation available'});
  f.payoutStatus=async()=>({status:'UNKNOWN',message:'No confirmation available'});
  f.fetch=async()=>({ok:true,json:async()=>({USD:{last:100000}})});
  f.invoke=async(cmd,args)=>{f.invocations.push(cmd);f.callArgs.push(args);return cmd==='receive_lightning'?{invoice:'invoice',quote_id:'quote'}:'Success'};
  // The real store exposes stable closures rather than methods bound to `this`.
  for(const key of ['setActiveTransaction','updateTransaction','updateTransactionById','updateTransactionPhase','setError','setErrorForTransaction','moveToHistory']) f.store[key]=f.store[key].bind(f.store);
  globalThis.__momo=f;return f;
}

// Synthetic balance responses; no provider or funded wallet is contacted.
const balancePayload = balance => ({
  data: { me: { defaultAccount: { wallets: [{ walletCurrency: 'BTC', balance }] } } },
});

test('proxy balance preserves a confirmed zero instead of marking it unavailable', async () => {
  const f = fixture();
  f.fetch = async (url, options) => {
    assert.equal(url, 'https://proxy.example/payment/balance');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => balancePayload(0) };
  };
  assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'available', balanceSats: 0 });
});

test('proxy balance reads BTC sats and ignores wallets in other currencies', async () => {
  const f = fixture();
  const payload = balancePayload(12345);
  payload.data.me.defaultAccount.wallets.unshift({ walletCurrency: 'USD', balance: 50 });
  f.fetch = async () => ({ ok: true, json: async () => payload });
  assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'available', balanceSats: 12345 });
});

test('proxy HTTP failures are unavailable with their status, never a zero balance', async () => {
  const f = fixture();
  for (const status of [401, 503]) {
    f.fetch = async () => ({ ok: false, status, json: async () => assert.fail('do not parse a failed response') });
    assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'unavailable', reason: 'http', statusCode: status });
  }
});

test('proxy connection failures are unavailable rather than a zero balance', async () => {
  const f = fixture();
  f.fetch = async () => { throw new TypeError('synthetic connection failure'); };
  assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'unavailable', reason: 'network' });
});

test('a proxy balance request that never settles times out and aborts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let signal;
  f.fetch = async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  const pending = fetchProxyBlinkBalance();
  t.mock.timers.tick(60000);
  assert.deepEqual(await pending, { status: 'unavailable', reason: 'timeout' });
  assert.equal(signal.aborted, true);
});

test('the proxy balance deadline includes reading the response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let startBody;
  const bodyStarted = new Promise(resolve => { startBody = resolve; });
  f.fetch = async () => ({ ok: true, json: () => {
    startBody();
    return new Promise(() => {});
  } });
  const pending = fetchProxyBlinkBalance();
  await bodyStarted;
  t.mock.timers.tick(60000);
  assert.deepEqual(await pending, { status: 'unavailable', reason: 'timeout' });
});

test('missing, invalid and partial proxy wallet data never invents a zero balance', async () => {
  const f = fixture();
  const invalidPayloads = [null, {}, { data: { me: { defaultAccount: { wallets: [] } } } },
    { ...balancePayload(0), errors: [{ message: 'synthetic provider failure' }] },
    ...['0', null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(balancePayload)];
  for (const payload of invalidPayloads) {
    f.fetch = async () => ({ ok: true, json: async () => payload });
    assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'unavailable', reason: 'invalid-response' });
  }
});

test('malformed proxy JSON is unavailable rather than a zero balance', async () => {
  const f = fixture();
  f.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('synthetic malformed JSON'); } });
  assert.deepEqual(await fetchProxyBlinkBalance(), { status: 'unavailable', reason: 'invalid-response' });
});

test('a rejected topup leaves a dismissible failure, not a persisted initiating spinner',async()=>{
  const f=fixture();await flow.calculateQuote('1000','0781234567','ecash','https://mint.example');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
  assert.equal(f.store.history[0].momoSubmission,'rejected');
});
test('lost initiation response keeps the topup pending for status recovery',async()=>{
  const f=fixture();f.init=async()=>({success:false,submission:'unknown',message:'Timed out'});
  await flow.calculateQuote('1000','0781234567','ecash','https://mint.example');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.store.activeTransaction.status,'PENDING');
  assert.equal(f.store.activeTransaction.mintQuoteId,'quote');
});
test('cashout credentials rejected before funding produce a safe failure',async()=>{
  const f=fixture();await flow.calculateSendQuote('1000','0781234567','ecash','https://mint.example');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
  assert.deepEqual(f.invocations,[]);
});
test('rejected funded cashout preserves its funding and saved record',async()=>{
  const f=fixture({...base,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  const stop=startPayoutInitiation(initiationDependencies(f));
  await flushPolling();stop?.();
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.store.history[0].invoicePaid,true);
  assert.equal(f.store.history[0].momoSubmission,'rejected');
  assert.equal(f.posts,1);
});
test('an interrupted submission never automatically posts another payout',async()=>{
  for (const momoSubmission of ['submitting','accepted','rejected',undefined]) {
    const f=fixture({...base,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission});
    const stop=startPayoutInitiation(initiationDependencies(f));
    await flushPolling();stop?.();
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
    assert.equal(f.posts,0);
  }
});
test('recovery status checks never re-fund or re-submit an uncertain cashout',async()=>{
  const f=fixture({...base,invoicePaid:false});
  await flow.checkMomoRecovery();
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.posts,0);assert.equal(f.lightning,0);assert.deepEqual(f.invocations,[]);
});
test('provider success completes a saved cashout without sending again',async()=>{
  const f=fixture({...base});f.status=async()=>({status:'SUCCESSFUL'});
  await flow.checkMomoRecovery();
  assert.equal(f.store.activeTransaction.status,'COMPLETED');
  assert.equal(f.posts,0);assert.equal(f.lightning,0);
});
test('provider payout failure keeps already funded cashout recoverable',async()=>{
  const f=fixture({...base});f.status=async()=>({status:'FAILED'});
  await flow.checkMomoRecovery();
  assert.equal(f.store.activeTransaction.status,'PENDING');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.match(f.store.activeTransaction.recoveryMessage,/support/);
});
test('already claimed topup completes recovery without asking proxy to pay again',async()=>{
  const f=fixture({...base,direction:'RWF_TO_SATS'});f.status=async()=>({status:'SUCCESSFUL'});
  await flow.checkMomoRecovery();
  assert.equal(f.store.activeTransaction.status,'COMPLETED');
  assert.equal(f.lightning,0);
});
test('obsolete polling responses cannot advance a replaced effect',async()=>{
  const f=fixture({...base,direction:'RWF_TO_SATS',momoReferenceId:'ref'});f.paymentStatus=async()=>({status:'SUCCESSFUL'});
  const clock=createManualScheduler();
  flow.startPaymentVerification({transactionId:base.id,transactions:pollingTransactions(f),checkPaymentStatus:f.paymentStatus,scheduler:clock.scheduler,isCurrent:()=>false});
  await flushPolling();
  assert.equal(f.lightning,0);assert.deepEqual(f.invocations,[]);
  assert.equal(clock.pendingCount,0);
});
test('saved cashout completes without changing a different foreground topup',async()=>{
  const current={...base,id:'new-topup',direction:'RWF_TO_SATS',currentPhase:AppPhase.INITIATING_PAYMENT};
  const f=fixture(current);f.store.history=[{...base}];f.status=async()=>({status:'SUCCESSFUL'});
  await flow.checkMomoRecovery('saved-id');
  assert.deepEqual(f.store.activeTransaction,current);
  assert.equal(f.store.history.find(t=>t.id==='saved-id').status,'COMPLETED');
  assert.equal(f.posts,0);assert.equal(f.lightning,0);
});
test('saved topup recovery uses its own mint quote while another transfer is active',async()=>{
  const current={...base,id:'new-cashout',currentPhase:AppPhase.PAYING_INVOICE};
  const f=fixture(current);f.store.history=[{...base,direction:'RWF_TO_SATS'}];f.status=async()=>({status:'SUCCESSFUL'});
  await flow.checkMomoRecovery('saved-id');
  assert.deepEqual(f.store.activeTransaction,current);
  assert.equal(f.store.history.find(t=>t.id==='saved-id').status,'COMPLETED');
  assert.equal(f.callArgs[0].txId,'same-quote');
});
test('completed saved transfers are not checked or paid again',async()=>{
  const f=fixture(null);f.store.history=[{...base,status:'COMPLETED'}];
  f.status=async()=>{throw Error('Completed transfer must not be queried')};
  await flow.checkMomoRecovery('saved-id');
  assert.deepEqual(f.invocations,[]);assert.equal(f.lightning,0);assert.equal(f.posts,0);
});
test('a new topup starts with its own ID while an older funded cashout stays saved',async()=>{
  const f=fixture(null);f.store.history=[{...base}];let requestedId;
  f.init=async id=>{requestedId=id;return {success:true,referenceId:'new-reference'}};
  await flow.calculateQuote('1000','0781234567','ecash','https://mint.example');
  assert.notEqual(requestedId,'saved-id');
  assert.equal(f.store.activeTransaction.id,requestedId);
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PENDING_PAYMENT);
  assert.deepEqual(f.store.history.find(tx=>tx.id==='saved-id'),base);
});

test('an unapproved worse topup rate never starts a provider request or creates a transaction',async()=>{
  const f=fixture();
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({direction:'RWF_TO_SATS',amount:1000,phone:'0781234567',mint:'https://mint.example',rate:100,spread:0.021,fixedFee:120,networkReserve:10});
  await assert.rejects(flow.calculateQuote('1000','0781234567','ecash','https://mint.example',approved),/rate changed/i);
  assert.equal(f.store.activeTransaction,null);
  assert.deepEqual(f.invocations,[]);
});
test('changing a reviewed cashout phone cannot initiate funding',async()=>{
  const f=fixture();
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({direction:'SATS_TO_RWF',amount:1000,phone:'0781234567',mint:'https://mint.example',rate:1,spread:0.021,fixedFee:120,networkReserve:10});
  await assert.rejects(flow.calculateSendQuote('1000','0791234567','ecash','https://mint.example',approved),/details changed/i);
  assert.equal(f.store.activeTransaction,null);
  assert.deepEqual(f.invocations,[]);
});
test('a confirmed topup uses its reviewed quote and creates only one receiving invoice',async()=>{
  const f=fixture();
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({direction:'RWF_TO_SATS',amount:1000,phone:'0781234567',mint:'https://mint.example',rate:await flow.fetchCurrentRate(),spread:0.021,fixedFee:120,networkReserve:10});
  await flow.calculateQuote('1000','0781234567','ecash','https://mint.example',approved);
  assert.equal(f.store.activeTransaction.satsAmount,approved.sats);
  assert.equal(f.invocations.filter(command=>command==='receive_lightning').length,1);
});
test('concurrent confirmations cannot start a second transfer after the rate check',async()=>{
  const f=fixture();
  f.init=async()=>({success:true,referenceId:'fixture-reference'});
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({direction:'RWF_TO_SATS',amount:1000,phone:'0781234567',mint:'https://mint.example',rate:await flow.fetchCurrentRate(),spread:0.021,fixedFee:120,networkReserve:10});
  const results=await Promise.allSettled([
    flow.calculateQuote('1000','0781234567','ecash','https://mint.example',approved),
    flow.calculateQuote('1000','0781234567','ecash','https://mint.example',approved),
  ]);
  assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.equal(f.invocations.filter(command=>command==='receive_lightning').length,1);
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PENDING_PAYMENT);
});

// Cash-in quotes use synthetic rates and provider/native adapters only.
const cashInReviewInput = {
  direction:'RWF_TO_SATS',amount:1000,phone:'0781234567',mint:'https://mint.example',
  rate:1,spread:0.021,fixedFee:120,networkReserve:10,
};
function momoQuoteFixture(rate=1) {
  const f=fixture();
  f.rateRequests=0;
  f.paymentRequests=[];
  f.fetch=async()=>{
    f.rateRequests++;
    return {ok:true,json:async()=>({USD:{last:1e8/(1400*rate)}})};
  };
  f.init=async(...args)=>{f.paymentRequests.push(args);return {success:true,referenceId:'cash-in-reference'};};
  return f;
}
test('cash-in execution preserves floor rounding and inclusive 100–200,000 RWF bounds',async()=>{
  for(const {amount,rate,sats} of [
    {amount:100,rate:1,sats:97},
    // This USD-price fixture converts back to 0.9999999999999999; keep the existing floor edge.
    {amount:200000,rate:1,sats:195799},
    {amount:1000,rate:1.0005,sats:979},
    {amount:1000,rate:1.002,sats:980},
  ]){
    const f=momoQuoteFixture(rate);
    await flow.calculateQuote(String(amount),cashInReviewInput.phone,'ecash',cashInReviewInput.mint);
    assert.deepEqual(f.invocations,['receive_lightning']);
    assert.deepEqual(f.callArgs,[{mintUrl:cashInReviewInput.mint,amount:sats}]);
    assert.equal(f.paymentRequests.length,1);
    assert.deepEqual(f.paymentRequests[0],[f.store.activeTransaction.id,sats,'ecash',amount,cashInReviewInput.phone]);
    assert.equal(f.store.activeTransaction.satsAmount,sats);
    assert.equal(f.store.activeTransaction.rwfAmount,amount);
    assert.equal(f.store.activeTransaction.fee,0);
    assert.ok(Math.abs(f.store.activeTransaction.rate-rate*(1-0.021))<1e-12);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PENDING_PAYMENT);
    assert.equal(f.rateRequests,1);
  }
});
test('cash-in execution uses the fresh favorable review rather than the older approved sats',async()=>{
  const f=momoQuoteFixture(1.1);
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview(cashInReviewInput);
  await flow.calculateQuote('1000',approved.phone,'ecash',approved.mint,approved);
  assert.equal(approved.sats,979);
  assert.equal(f.callArgs[0].amount,1076);
  assert.equal(f.paymentRequests[0][1],1076);
  assert.equal(f.store.activeTransaction.satsAmount,1076);
  assert.equal(f.store.activeTransaction.fee,0);
  assert.equal(f.rateRequests,1);
});
test('cash-in bounds retain their existing messages and reject before rate or provider requests',async()=>{
  for(const [amount,message] of [['99','Minimum amount is 100 RWF.'],['200001','Maximum amount is 200,000 RWF.']]){
    const f=momoQuoteFixture();
    await flow.calculateQuote(amount,cashInReviewInput.phone,'ecash',cashInReviewInput.mint);
    assert.equal(f.store.error,message);
    assert.equal(f.store.activeTransaction,null);
    assert.equal(f.rateRequests,0);
    assert.deepEqual(f.invocations,[]);
    assert.deepEqual(f.paymentRequests,[]);
  }
});
test('cash-in direct calls reject fractional RWF before creating an invoice or provider payment',async()=>{
  const f=momoQuoteFixture();
  await flow.calculateQuote('100.5',cashInReviewInput.phone,'ecash',cashInReviewInput.mint);
  assert.match(f.store.error,/whole amount/i);
  assert.deepEqual(f.invocations,[]);
  assert.deepEqual(f.paymentRequests,[]);
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
});
test('cash-in cannot create a zero-sat invoice when a positive rate rounds below one sat',async()=>{
  const f=momoQuoteFixture(1e-12);
  await flow.calculateQuote('1000',cashInReviewInput.phone,'ecash',cashInReviewInput.mint);
  assert.match(f.store.error,/cannot be converted/i);
  assert.deepEqual(f.invocations,[]);
  assert.deepEqual(f.paymentRequests,[]);
});
test('cash-in direct calls reject negative rates and missing mints before provider work',async()=>{
  for(const [rate,mint] of [[-1,cashInReviewInput.mint],[1,'']]){
    const f=momoQuoteFixture(rate);
    await flow.calculateQuote('1000',cashInReviewInput.phone,'ecash',mint);
    assert.match(f.store.error,/mint and current exchange rate/i);
    assert.deepEqual(f.invocations,[]);
    assert.deepEqual(f.paymentRequests,[]);
  }
});


// Record cash-out invoice creation without funding it or starting a payout.
const cashOutReviewInput={...cashInReviewInput,direction:'SATS_TO_RWF'};
function cashOutFixture(rate=1){
  const f=momoQuoteFixture(rate);
  f.fundingRequests=[];
  f.createInvoice=async sats=>{f.fundingRequests.push(sats);return {paymentRequest:'funding-invoice',paymentHash:'funding-hash'};};
  return f;
}
test('cash-out execution preserves ceiling rounding, fees and inclusive RWF limits',async()=>{
  for(const {amount,rate,fundingSats} of [
    {amount:100,rate:1,fundingSats:223},
    {amount:200000,rate:1,fundingSats:204320},
    {amount:101,rate:0.7,fundingSats:157},
    {amount:1000,rate:1.0005,fundingSats:1142},
    {amount:1000,rate:1.002,fundingSats:1144},
  ]){
    const f=cashOutFixture(rate);
    await flow.calculateSendQuote(String(amount),cashOutReviewInput.phone,'ecash',cashOutReviewInput.mint);
    assert.deepEqual(f.fundingRequests,[fundingSats]);
    assert.equal(f.store.activeTransaction.rwfAmount,amount);
    assert.equal(f.store.activeTransaction.satsAmount,fundingSats);
    assert.equal(f.store.activeTransaction.fee,0);
    assert.ok(Math.abs(f.store.activeTransaction.rate-rate)<1e-12);
    assert.equal(f.store.activeTransaction.invoice,'funding-invoice');
    assert.equal(f.store.activeTransaction.paymentHash,'funding-hash');
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.AWAITING_INVOICE_PAYMENT);
    assert.equal(f.rateRequests,1);
    assert.deepEqual(f.invocations,[]);
    assert.deepEqual(f.paymentRequests,[]);
    assert.equal(f.posts,0);
  }
});
test('cash-out uses fresh favorable funding without adding the reviewed routing reserve to the invoice',async()=>{
  const f=cashOutFixture(1.1);
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({...cashOutReviewInput,rate:2});
  await flow.calculateSendQuote('1000',approved.phone,'ecash',approved.mint,approved);
  assert.equal(approved.fundingSats,2282);assert.equal(approved.sats,2292);
  assert.deepEqual(f.fundingRequests,[1256]);assert.equal(f.store.activeTransaction.satsAmount,1256);
  assert.equal(f.store.activeTransaction.fee,0);assert.equal(f.rateRequests,1);
});
test('cash-out rejects a one-sat increase in the reviewed wallet budget before transaction or invoice creation',async()=>{
  const f=cashOutFixture(1.0005);
  const {buildMomoReview,MomoReviewChangedError}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview(cashOutReviewInput);
  await assert.rejects(flow.calculateSendQuote('1000',approved.phone,'ecash',approved.mint,approved),error=>{
    assert.ok(error instanceof MomoReviewChangedError);
    assert.equal(approved.sats,1151);assert.equal(error.review.sats,1152);
    return true;
  });
  assert.equal(f.store.activeTransaction,null);assert.deepEqual(f.fundingRequests,[]);assert.equal(f.posts,0);
});
test('cash-out may use a higher rate when ceiling rounding keeps the approved wallet budget unchanged',async()=>{
  const f=cashOutFixture(1.0006);
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({...cashOutReviewInput,rate:1.0005});
  await flow.calculateSendQuote('1000',approved.phone,'ecash',approved.mint,approved);
  assert.deepEqual(f.fundingRequests,[1142]);assert.equal(approved.sats,1152);assert.equal(f.rateRequests,1);
});
test('cash-out approval includes the reserve even when the funding amount has not changed',async()=>{
  const f=cashOutFixture();
  const {buildMomoReview}=await import('../src/services/momoReview.ts');
  const approved=buildMomoReview({...cashOutReviewInput,networkReserve:9});
  await assert.rejects(flow.calculateSendQuote('1000',approved.phone,'ecash',approved.mint,approved),error=>{
    assert.equal(error.review.fundingSats,approved.fundingSats);
    assert.equal(error.review.sats,approved.sats+1);
    return true;
  });
  assert.equal(f.store.activeTransaction,null);assert.deepEqual(f.fundingRequests,[]);
});
test('cash-out invalid amounts retain existing boundary messages without fetching or creating invoices',async()=>{
  for(const [amount,message] of [['99','Minimum amount is 100 RWF.'],['200001','Maximum amount is 200,000 RWF.']]){
    const f=cashOutFixture();
    await flow.calculateSendQuote(amount,cashOutReviewInput.phone,'ecash',cashOutReviewInput.mint);
    assert.equal(f.store.error,message);assert.equal(f.rateRequests,0);assert.equal(f.store.activeTransaction,null);
    assert.deepEqual(f.fundingRequests,[]);assert.deepEqual(f.invocations,[]);
  }
});
test('cash-out direct calls share review validation before creating a funding invoice',async()=>{
  for(const [amount,rate,mint,message] of [
    ['100.5',1,cashOutReviewInput.mint,/whole amount/i],
    ['1000',-1,cashOutReviewInput.mint,/mint and current exchange rate/i],
    ['1000',1,'',/mint and current exchange rate/i],
  ]){
    const f=cashOutFixture(rate);
    await flow.calculateSendQuote(amount,cashOutReviewInput.phone,'ecash',mint);
    assert.match(f.store.error,message);assert.deepEqual(f.fundingRequests,[]);assert.deepEqual(f.invocations,[]);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
  }
});


const flushPolling=()=>new Promise(resolve=>setImmediate(resolve));
const pollingTopup={...base,direction:'RWF_TO_SATS',momoReferenceId:'reference',currentPhase:AppPhase.PENDING_PAYMENT};
function pollingTransactions(f){
  return {
    findById:id=>f.store.activeTransaction?.id===id?f.store.activeTransaction:f.store.history.find(tx=>tx.id===id),
    updateById:(id,updates)=>f.store.updateTransactionById(id,updates),
    setErrorFor:(id,error)=>{if(f.store.activeTransaction?.id===id)f.store.setError(error);},
  };
}
function startCashInPolling(t,clock,isCurrent=()=>true){
  const f=globalThis.__momo;
  const stop=flow.startPaymentVerification({transactionId:f.store.activeTransaction?.id??'missing',transactions:pollingTransactions(f),checkPaymentStatus:f.paymentStatus,scheduler:clock.scheduler,isCurrent});
  assert.equal(typeof stop,'function');
  t.after(stop);
  return stop;
}
test('cash-in polling uses injected time and owns its cancellation',async t=>{
  await t.test('initial success completes once without starting timers',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.paymentStatus=async()=>{calls++;return {status:'SUCCESSFUL'};};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);
    assert.equal(f.store.activeTransaction.status,'COMPLETED');assert.deepEqual(f.invocations,['check_transaction_status']);
    clock.advanceBy(120000);await flushPolling();assert.equal(calls,1);
  });
  await t.test('a successful poll waits the configured interval and cancels the deadline',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.paymentStatus=async()=>({status:++calls===1?'PENDING':'SUCCESSFUL'});
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.deepEqual(clock.delays,[5000,120000]);
    clock.advanceBy(4999);await flushPolling();assert.equal(calls,1);
    clock.advanceBy(1);await flushPolling();assert.equal(calls,2);assert.equal(clock.pendingCount,0);
    assert.equal(f.store.activeTransaction.status,'COMPLETED');assert.deepEqual(f.invocations,['check_transaction_status']);
  });
  for(const immediate of [true,false])await t.test(`${immediate?'initial':'polled'} provider failure is terminal and preserves its message`,async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.paymentStatus=async()=>({status:immediate||++calls>1?'FAILED':'PENDING',message:'Synthetic decline'});
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    if(!immediate){clock.advanceBy(5000);await flushPolling();}
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
    assert.equal(f.store.error,'Synthetic decline');assert.equal(f.store.history[0].status,'FAILED');
    assert.equal(clock.pendingCount,0);assert.deepEqual(f.invocations,[]);
  });
  await t.test('initial and later status errors continue polling without overlapping requests',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.paymentStatus=async()=>{calls++;if(calls<=2)throw new Error('Synthetic connection failure');return {status:'PENDING'};};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.deepEqual(clock.delays,[5000,120000]);
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,2);assert.deepEqual(clock.delays,[5000,115000]);
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,3);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);assert.equal(f.store.error,null);
  });
  await t.test('the next poll is scheduled after the pending request settles, never in parallel',async t=>{
    const f=fixture({...pollingTopup});let calls=0,resolve;
    f.paymentStatus=()=>{calls++;return calls===2?new Promise(done=>{resolve=done;}):Promise.resolve({status:'UNKNOWN'});};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,2);
    clock.advanceBy(20000);await flushPolling();assert.equal(calls,2);assert.deepEqual(clock.delays,[95000]);
    resolve({status:'PENDING'});await flushPolling();assert.deepEqual(clock.delays,[5000,95000]);
    clock.advanceBy(4999);await flushPolling();assert.equal(calls,2);
    clock.advanceBy(1);await flushPolling();assert.equal(calls,3);
  });
  await t.test('cleanup is returned synchronously and retires an in-flight initial response',async t=>{
    const f=fixture({...pollingTopup});let resolve;
    f.paymentStatus=()=>new Promise(done=>{resolve=done;});
    const clock=createManualScheduler();const stop=startCashInPolling(t,clock);
    stop();stop();resolve({status:'SUCCESSFUL'});await flushPolling();
    assert.equal(clock.pendingCount,0);assert.deepEqual(f.invocations,[]);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);
  });
  await t.test('cleanup cancels both timers and callbacks already queued cannot restart the loop',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.paymentStatus=async()=>{calls++;return {status:'PENDING'};};
    const clock=createManualScheduler();const stop=startCashInPolling(t,clock);await flushPolling();
    const queued=clock.callbacks();stop();stop();assert.equal(clock.pendingCount,0);
    queued.forEach(callback=>callback());await flushPolling();clock.advanceBy(120000);await flushPolling();
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);assert.equal(f.store.error,null);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);
  });
  await t.test('deadline preserves pending recovery and ignores a later success or failure',async t=>{
    for(const status of ['SUCCESSFUL','FAILED']){
      const f=fixture({...pollingTopup});let calls=0,resolve;
      f.paymentStatus=()=>++calls===1?Promise.resolve({status:'PENDING'}):new Promise(done=>{resolve=done;});
      const clock=createManualScheduler();const stop=startCashInPolling(t,clock);await flushPolling();
      clock.advanceBy(5000);await flushPolling();clock.advanceBy(115000);await flushPolling();
      assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(f.store.activeTransaction.status,'PENDING');
      assert.match(f.store.history[0].recoveryMessage,/not confirmed payment yet/);assert.equal(f.store.error,null);
      resolve({status});await flushPolling();assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
      assert.deepEqual(f.invocations,[]);assert.equal(clock.pendingCount,0);stop();
    }
  });
  await t.test('there are no timers or provider calls without a foreground transaction',async()=>{
    const f=fixture();let calls=0;f.paymentStatus=async()=>{calls++;return {status:'PENDING'};};
    const clock=createManualScheduler();const stop=flow.startPaymentVerification({transactionId:"missing",transactions:pollingTransactions(f),checkPaymentStatus:f.paymentStatus,scheduler:clock.scheduler});await flushPolling();
    assert.equal(stop,undefined);assert.equal(clock.pendingCount,0);assert.equal(calls,0);
  });
});


const otherForeground={...pollingTopup,id:'other-transfer',mintQuoteId:'other-quote',invoice:'other-invoice',currentPhase:AppPhase.INITIATING_PAYMENT};
function savePollingTarget(f){
  const saved={...f.store.activeTransaction};
  f.store.history=[saved,...f.store.history.filter(tx=>tx.id!==saved.id)];
  f.store.setActiveTransaction({...otherForeground});
  f.store.setError('Other transfer error');
  return saved;
}
test('cash-in verification owns its transaction ID',async t=>{
  for(const status of ['SUCCESSFUL','FAILED'])await t.test(`late initial ${status} belongs to the saved target, not a different foreground`,async t=>{
    const f=fixture({...pollingTopup});let resolve;const requested=[];
    f.paymentStatus=id=>{requested.push(id);return new Promise(done=>{resolve=done;});};
    const clock=createManualScheduler();startCashInPolling(t,clock);
    const saved=savePollingTarget(f);
    resolve({status,message:'Original top-up declined'});await flushPolling();
    assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
    const result=f.store.history.find(tx=>tx.id===saved.id);
    assert.equal(result.status,status==='SUCCESSFUL'?'COMPLETED':'FAILED');
    assert.deepEqual(requested,[saved.id]);assert.equal(clock.pendingCount,0);
    if(status==='SUCCESSFUL')assert.deepEqual(f.callArgs,[{txId:saved.mintQuoteId}]);
    else{assert.equal(result.recoveryMessage,'Original top-up declined');assert.deepEqual(f.invocations,[]);}
  });
  await t.test('scheduled provider checks keep the captured ID after foreground replacement',async t=>{
    const f=fixture({...pollingTopup});const requested=[];
    f.paymentStatus=async id=>{requested.push(id);return {status:requested.length===1?'PENDING':'FAILED'};};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();const saved=savePollingTarget(f);
    clock.advanceBy(5000);await flushPolling();
    assert.deepEqual(requested,[saved.id,saved.id]);assert.deepEqual(f.store.activeTransaction,otherForeground);
    assert.equal(f.store.error,'Other transfer error');assert.equal(f.store.history.find(tx=>tx.id===saved.id).status,'FAILED');
  });
  await t.test('deadline recovery and error clearing are scoped to the captured ID',async t=>{
    const f=fixture({...pollingTopup});f.paymentStatus=async()=>({status:'UNKNOWN'});
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();const saved=savePollingTarget(f);
    f.store.activeTransaction={...otherForeground,currentPhase:AppPhase.VERIFYING_PAYMENT};
    const foreground={...f.store.activeTransaction};clock.advanceBy(120000);await flushPolling();
    assert.deepEqual(f.store.activeTransaction,foreground);assert.equal(f.store.error,'Other transfer error');
    assert.equal(f.store.history.find(tx=>tx.id===saved.id).currentPhase,AppPhase.RECOVERY_REQUIRED);
    assert.equal(clock.pendingCount,0);
  });
  await t.test('removing the target while a request is pending cannot resurrect it or fulfill the foreground',async t=>{
    const f=fixture({...pollingTopup});let resolve;
    f.paymentStatus=()=>new Promise(done=>{resolve=done;});
    const clock=createManualScheduler();startCashInPolling(t,clock);
    savePollingTarget(f);f.store.history=[];
    resolve({status:'SUCCESSFUL'});await flushPolling();
    assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
    assert.deepEqual(f.store.history,[]);assert.deepEqual(f.invocations,[]);assert.equal(clock.pendingCount,0);
  });
  await t.test('a newer completed or recovery phase on the same ID is not rolled back by a late failure',async t=>{
    for(const updates of [{status:'COMPLETED',currentPhase:AppPhase.READY_TO_CLAIM},{status:'PENDING',currentPhase:AppPhase.RECOVERY_REQUIRED}]){
      const f=fixture({...pollingTopup});let resolve;f.paymentStatus=()=>new Promise(done=>{resolve=done;});
      const clock=createManualScheduler();const stop=startCashInPolling(t,clock);
      f.store.updateTransaction(updates);const current={...f.store.activeTransaction};
      resolve({status:'FAILED'});await flushPolling();
      assert.deepEqual(f.store.activeTransaction,current);assert.equal(f.store.error,null);assert.equal(clock.pendingCount,0);stop();
    }
  });
  await t.test('an explicitly selected saved ID can be verified without taking over the foreground',async t=>{
    const f=fixture({...otherForeground});f.store.error='Other transfer error';
    f.store.history=[{...pollingTopup}];let requested;
    f.paymentStatus=async id=>{requested=id;return {status:'FAILED',message:'Saved transfer declined'};};
    const clock=createManualScheduler();const stop=flow.startPaymentVerification({transactionId:pollingTopup.id,transactions:pollingTransactions(f),checkPaymentStatus:f.paymentStatus,scheduler:clock.scheduler});
    assert.equal(typeof stop,'function');t.after(stop);await flushPolling();
    assert.equal(requested,pollingTopup.id);assert.deepEqual(f.store.activeTransaction,otherForeground);
    assert.equal(f.store.error,'Other transfer error');assert.equal(f.store.history[0].recoveryMessage,'Saved transfer declined');
  });
  await t.test('missing, cash-out and terminal targets do not start another foreground verification',async()=>{
    for(const target of [undefined,{...pollingTopup,direction:'SATS_TO_RWF'},{...pollingTopup,status:'COMPLETED'},{...pollingTopup,currentPhase:AppPhase.RECOVERY_REQUIRED}]){
      const f=fixture({...otherForeground});f.store.history=target?[target]:[];let calls=0;
      f.paymentStatus=async()=>{calls++;return {status:'PENDING'};};
      const clock=createManualScheduler();const stop=flow.startPaymentVerification({transactionId:pollingTopup.id,transactions:pollingTransactions(f),checkPaymentStatus:f.paymentStatus,scheduler:clock.scheduler});
      stop?.();await flushPolling();assert.equal(stop,undefined);assert.equal(calls,0);assert.equal(clock.pendingCount,0);
      assert.deepEqual(f.store.activeTransaction,otherForeground);
    }
  });
});


test("cash-in status checks use each owner's injected provider instead of the module adapter",async t=>{
  const f=fixture({...pollingTopup});let moduleCalls=0;
  f.status=async()=>{moduleCalls++;throw new Error('Verifier must use its injected status check');};
  const second={...pollingTopup,id:'second-topup'};f.store.history=[second];
  const firstRequests=[],secondRequests=[];let resolveFirst;
  const firstClock=createManualScheduler(),secondClock=createManualScheduler();
  const stopFirst=flow.startPaymentVerification({
    transactionId:pollingTopup.id,transactions:pollingTransactions(f),scheduler:firstClock.scheduler,
    checkPaymentStatus:id=>{firstRequests.push(id);return new Promise(resolve=>{resolveFirst=resolve;});},
  });
  const stopSecond=flow.startPaymentVerification({
    transactionId:second.id,transactions:pollingTransactions(f),scheduler:secondClock.scheduler,
    checkPaymentStatus:async id=>{secondRequests.push(id);return {status:secondRequests.length===1?'UNKNOWN':'FAILED',message:'Second provider declined'};},
  });
  t.after(()=>{stopFirst?.();stopSecond?.();});await flushPolling();
  assert.deepEqual(firstRequests,[pollingTopup.id]);assert.deepEqual(secondRequests,[second.id]);
  assert.equal(firstClock.pendingCount,0);assert.equal(secondClock.pendingCount,2);
  secondClock.advanceBy(5000);await flushPolling();
  assert.deepEqual(secondRequests,[second.id,second.id]);assert.equal(secondClock.pendingCount,0);
  assert.equal(f.store.history.find(tx=>tx.id===second.id).recoveryMessage,'Second provider declined');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);
  resolveFirst({status:'FAILED',message:'First provider declined'});await flushPolling();
  assert.equal(f.store.error,'First provider declined');assert.equal(moduleCalls,0);
});


const pollingCashout={...base,currentPhase:AppPhase.VERIFYING_PAYOUT,payoutReferenceId:'payout-reference',momoSubmission:'accepted',momoPhoneNumber:'0781234567'};
function payoutDependencies(f,clock,isCurrent=()=>true){
  return {transactionId:f.store.activeTransaction?.id??pollingCashout.id,transactions:pollingTransactions(f),
    checkPayoutStatus:f.payoutStatus,scheduler:clock.scheduler,isCurrent};
}
function initiationDependencies(f,isCurrent=()=>true){
  return {transactionId:f.store.activeTransaction?.id??pollingCashout.id,transactions:pollingTransactions(f),submitPayout:f.payout,isCurrent};
}
function startInitiation(t,f,isCurrent=()=>true){
  const stop=startPayoutInitiation(initiationDependencies(f,isCurrent));
  assert.equal(typeof stop,'function');t.after(stop);return stop;
}
function startPayoutPolling(t,f,clock,isCurrent=()=>true){
  const stop=flow.startPayoutVerification(payoutDependencies(f,clock,isCurrent));
  assert.equal(typeof stop,'function');t.after(stop);return stop;
}
test('payout operations own explicit time, status and transaction dependencies',async t=>{
  await t.test('existing provider reference starts after the interval and completes without submission',async t=>{
    const f=fixture({...pollingCashout});const ids=[];
    f.payoutStatus=async id=>{ids.push(id);return {status:'SUCCESSFUL'};};
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();
    assert.deepEqual(clock.delays,[5000,120000]);assert.deepEqual(ids,[]);
    clock.advanceBy(4999);await flushPolling();assert.deepEqual(ids,[]);
    clock.advanceBy(1);await flushPolling();assert.deepEqual(ids,[pollingCashout.id]);
    assert.equal(f.store.activeTransaction.status,'COMPLETED');assert.equal(f.store.activeTransaction.currentPhase,AppPhase.READY_TO_CLAIM);
    assert.equal(f.store.history[0].fulfillmentStep,'COMPLETED');assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);assert.deepEqual(f.invocations,[]);
  });
  await t.test('unknown results and rejected status requests keep funding unresolved until the deadline',async t=>{
    const f=fixture({...pollingCashout});let calls=0;
    f.payoutStatus=async()=>{if(++calls===2)throw new Error('Synthetic status outage');return {status:'UNKNOWN'};};
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();
    clock.advanceBy(5000);await flushPolling();clock.advanceBy(5000);await flushPolling();
    assert.equal(calls,2);assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYOUT);
    clock.advanceBy(110000);await flushPolling();
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
    assert.equal(f.store.activeTransaction.status,'PENDING');assert.equal(f.store.activeTransaction.invoicePaid,true);
    assert.equal(f.store.history[0].payoutReferenceId,'payout-reference');assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  });
  await t.test('an explicit funded payout failure remains pending for recovery',async t=>{
    const f=fixture({...pollingCashout});f.payoutStatus=async()=>({status:'FAILED',message:'Synthetic decline'});
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();clock.advanceBy(5000);await flushPolling();
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(f.store.activeTransaction.status,'PENDING');
    assert.equal(f.store.activeTransaction.invoicePaid,true);assert.equal(f.store.error,'Synthetic decline');
    assert.match(f.store.history[0].recoveryMessage,/do not pay again/);assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  });
  await t.test('requests are sequential and a deadline retires an unresolved status response',async t=>{
    const f=fixture({...pollingCashout});let calls=0,resolve;
    f.payoutStatus=()=>{calls++;return new Promise(done=>{resolve=done;});};
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();
    clock.advanceBy(5000);await flushPolling();clock.advanceBy(20000);await flushPolling();
    assert.equal(calls,1);assert.deepEqual(clock.delays,[95000]);
    clock.advanceBy(95000);await flushPolling();resolve({status:'SUCCESSFUL'});await flushPolling();
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(f.store.activeTransaction.status,'PENDING');
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  });
  for(const status of ['SUCCESSFUL','FAILED'])await t.test(`late ${status} updates only its saved payout ID`,async t=>{
    const f=fixture({...pollingCashout});let resolve;f.payoutStatus=()=>new Promise(done=>{resolve=done;});
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();clock.advanceBy(5000);await flushPolling();
    const saved=savePollingTarget(f);resolve({status,message:'Saved payout declined'});await flushPolling();
    assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
    const target=f.store.history.find(tx=>tx.id===saved.id);
    assert.equal(target.currentPhase,status==='SUCCESSFUL'?AppPhase.READY_TO_CLAIM:AppPhase.RECOVERY_REQUIRED);
    assert.equal(target.invoicePaid,true);assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  });
  await t.test('polls and deadline stay bound to the saved payout after foreground replacement',async t=>{
    const f=fixture({...pollingCashout});const ids=[];f.payoutStatus=async id=>{ids.push(id);return {status:'PENDING'};};
    const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();const saved=savePollingTarget(f);
    clock.advanceBy(5000);await flushPolling();assert.deepEqual(ids,[saved.id]);
    clock.advanceBy(115000);await flushPolling();
    assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
    assert.equal(f.store.history.find(tx=>tx.id===saved.id).currentPhase,AppPhase.RECOVERY_REQUIRED);
    assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  });
  await t.test('cleanup cancels queued callbacks and ignores a late status result',async t=>{
    const f=fixture({...pollingCashout});let resolve,calls=0;f.payoutStatus=()=>{calls++;return new Promise(done=>{resolve=done;});};
    const clock=createManualScheduler();const stop=startPayoutPolling(t,f,clock);await flushPolling();const queued=clock.callbacks();
    clock.advanceBy(5000);await flushPolling();stop();stop();queued.forEach(callback=>callback());
    resolve({status:'SUCCESSFUL'});await flushPolling();clock.advanceBy(120000);await flushPolling();
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYOUT);
  });
  await t.test('removed or terminal targets cannot be resurrected by a late result',async t=>{
    for(const replacement of [null,{...pollingCashout,status:'COMPLETED',currentPhase:AppPhase.READY_TO_CLAIM},{...pollingCashout,currentPhase:AppPhase.RECOVERY_REQUIRED}]){
      const f=fixture({...pollingCashout});let resolve;f.payoutStatus=()=>new Promise(done=>{resolve=done;});
      const clock=createManualScheduler();startPayoutPolling(t,f,clock);await flushPolling();clock.advanceBy(5000);await flushPolling();
      f.store.activeTransaction=replacement;f.store.history=[];resolve({status:'FAILED'});await flushPolling();
      assert.deepEqual(f.store.activeTransaction,replacement);assert.deepEqual(f.store.history,[]);assert.equal(clock.pendingCount,0);
    }
  });
  await t.test('cleanup during payout initiation returns synchronously and cannot update a replacement',async t=>{
    const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});let resolve;
    f.payout=()=>{f.posts++;return new Promise(done=>{resolve=done;});};
    const stop=startInitiation(t,f);
    assert.equal(f.store.activeTransaction.momoSubmission,'submitting');stop();savePollingTarget(f);
    resolve({success:true,referenceId:'late-reference'});await flushPolling();
    assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
    assert.equal(f.posts,1);
  });
  await t.test('a lost submission response retains its intent and never reposts on restart',async t=>{
    const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
    f.payout=async()=>{f.posts++;return {success:false,submission:'unknown',message:'Synthetic lost response'};};
    startInitiation(t,f);await flushPolling();
    assert.equal(f.store.activeTransaction.momoSubmission,'submitting');assert.equal(f.store.activeTransaction.invoicePaid,true);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(f.store.activeTransaction.status,'PENDING');
    f.store.updateTransaction({currentPhase:AppPhase.INITIATING_PAYOUT});startInitiation(t,f);await flushPolling();
    assert.equal(f.posts,1);assert.equal(f.store.history[0].momoSubmission,'submitting');
  });
});


test('payout verification starts only for an eligible selected ID and never falls back to the module provider',async t=>{
  const f=fixture({...otherForeground});f.store.history=[{...pollingCashout}];let calls=0;
  f.status=async()=>{throw new Error('Must use the injected payout status function');};
  const clock=createManualScheduler();const stop=flow.startPayoutVerification({
    ...payoutDependencies(f,clock),transactionId:pollingCashout.id,
    checkPayoutStatus:async id=>{assert.equal(id,pollingCashout.id);calls++;return {status:'FAILED'};},
  });
  assert.equal(typeof stop,'function');t.after(stop);await flushPolling();clock.advanceBy(5000);await flushPolling();
  assert.equal(calls,1);assert.equal(f.store.history[0].currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.posts,0);
  for(const target of [null,{...pollingTopup},{...pollingCashout,status:'COMPLETED'},{...pollingCashout,currentPhase:AppPhase.RECOVERY_REQUIRED}]){
    const f=fixture(target);const clock=createManualScheduler();
    const stop=flow.startPayoutVerification(payoutDependencies(f,clock));
    assert.equal(stop,undefined);assert.equal(clock.pendingCount,0);assert.equal(f.posts,0);
  }
  const obsolete=fixture({...pollingCashout});const obsoleteClock=createManualScheduler();
  assert.equal(flow.startPayoutVerification(payoutDependencies(obsolete,obsoleteClock,()=>false)),undefined);
  assert.equal(obsoleteClock.pendingCount,0);
});

test('unconfirmed funding cannot initiate a payout and a canceled submission rejection cannot update another transfer',async t=>{
  const unfunded=fixture({...pollingCashout,payoutReferenceId:null,invoicePaid:false,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  const stop=startInitiation(t,unfunded);await flushPolling();
  assert.equal(unfunded.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(unfunded.posts,0);stop();
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});let reject;
  f.payout=()=>new Promise((_resolve,fail)=>{reject=fail;});
  const canceled=startInitiation(t,f);canceled();savePollingTarget(f);
  reject(new Error('Synthetic lost initiation'));await flushPolling();
  assert.deepEqual(f.store.activeTransaction,otherForeground);assert.equal(f.store.error,'Other transfer error');
});

test('an initiation exception without a message keeps the existing payout recovery messages',async t=>{
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  f.payout=async()=>{throw new Error('');};
  startInitiation(t,f);await flushPolling();
  assert.equal(f.store.error,'Failed to initiate MoMo payout.');
  assert.equal(f.store.history[0].recoveryMessage,'This transfer was interrupted. Its status is not confirmed yet. Your transaction details have been saved.');
  assert.equal(f.store.activeTransaction.invoicePaid,true);assert.equal(f.store.activeTransaction.status,'PENDING');
});


test('payout initiation persists its single dispatch intent before calling the injected provider',async t=>{
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  let resolve;const requests=[],observedIntents=[];
  f.payout=(...args)=>{
    requests.push(args);
    observedIntents.push([f.store.activeTransaction.momoSubmission,f.store.history[0]?.momoSubmission]);
    return new Promise(done=>{resolve=done;});
  };
  const first=startInitiation(t,f);
  assert.deepEqual(observedIntents,[['submitting','submitting']]);
  startInitiation(t,f);await flushPolling();
  assert.deepEqual(requests,[[pollingCashout.id,1000,800,'0781234567']]);
  resolve({success:true,referenceId:'accepted-once'});await flushPolling();
  first();assert.equal(requests.length,1);assert.equal(f.store.activeTransaction.invoicePaid,true);
});

test('payout initiation accepts a confirmed response without owning polling timers',async t=>{
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  f.payout=async()=>({success:true,referenceId:'accepted-reference'});
  startInitiation(t,f);await flushPolling();
  assert.equal(f.store.activeTransaction.payoutReferenceId,'accepted-reference');
  assert.equal(f.store.activeTransaction.momoSubmission,'accepted');
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYOUT);
});

test('a submission-intent persistence failure prevents any provider dispatch',async t=>{
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  let requests=0;f.payout=async()=>{requests++;return {success:true,referenceId:'must-not-dispatch'};};
  const transactions={...pollingTransactions(f),updateById:(_id,updates)=>{
    if(updates.momoSubmission==='submitting')throw new Error('Synthetic persistence failure');
    pollingTransactions(f).updateById(pollingCashout.id,updates);
  }};
  const stop=startPayoutInitiation({...initiationDependencies(f),transactions});t.after(()=>stop?.());await flushPolling();
  assert.equal(requests,0);assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.store.activeTransaction.invoicePaid,true);assert.match(f.store.error,/Synthetic persistence failure/);
});

test('payout polling never dispatches a request even when passed an initiation record',async()=>{
  const f=fixture({...pollingCashout,payoutReferenceId:null,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission:'not_started'});
  const clock=createManualScheduler();
  assert.equal(flow.startPayoutVerification(payoutDependencies(f,clock)),undefined);
  await flushPolling();assert.equal(f.posts,0);assert.equal(clock.pendingCount,0);
});


test('fulfillment production adapter keeps its twenty-second initial mint-status deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture({...base,direction:'RWF_TO_SATS'});
  f.invoke=()=>new Promise(()=>{});
  const running=flow.handleFulfillOrder(base.id);
  t.mock.timers.tick(20000);await running;
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.store.activeTransaction.status,'PENDING');assert.match(f.store.error,/timed out/i);
  assert.equal(f.lightning,0);
});
