import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createManualScheduler } from './helpers/manualScheduler.ts';
const source = new URL('../src/services/flowServices.ts', import.meta.url).href;
const balanceSource = new URL('../src/services/proxyBalanceService.ts', import.meta.url).href;
const stub = code => ({url:'data:text/javascript,'+encodeURIComponent(code), shortCircuit:true});
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === balanceSource) {
    if (specifier === '@tauri-apps/plugin-http') return stub('export const fetch=(...args)=>globalThis.__momo.fetch(...args);');
    if (specifier === '../constants.local') return stub('export const MOMO_API_BASE_URL="https://proxy.example";');
  }
  if (context.parentURL === source) {
    if (specifier === './momoService') return stub(`
      export const initiateMomoPaymentRequest=(...a)=>globalThis.__momo.init(...a);
      export const initiateMomoPayout=(...a)=>globalThis.__momo.payout(...a);
      export const checkMomoPaymentStatus=()=>globalThis.__momo.status();
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
    setError(e){this.error=e},moveToHistory(t){this.history=[t,...this.history.filter(old=>old.id!==t.id)]},
  };
  f.createInvoice=async()=>{throw Error('Update required')};
  f.init=async()=>({success:false,submission:'rejected',message:'Update required'});
  f.payout=async()=>{f.posts++;return {success:false,submission:'rejected',message:'Update required'}};
  f.status=async()=>({status:'UNKNOWN',message:'No confirmation available'});
  f.fetch=async()=>({ok:true,json:async()=>({USD:{last:100000}})});
  f.invoke=async(cmd,args)=>{f.invocations.push(cmd);f.callArgs.push(args);return cmd==='receive_lightning'?{invoice:'invoice',quote_id:'quote'}:'Success'};
  // The real store exposes stable closures rather than methods bound to `this`.
  for(const key of ['setActiveTransaction','updateTransaction','updateTransactionById','updateTransactionPhase','setError','moveToHistory']) f.store[key]=f.store[key].bind(f.store);
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
  await flow.initiateAndVerifyPayout(()=>{}, {current:null}, {current:null});
  assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(f.store.history[0].invoicePaid,true);
  assert.equal(f.store.history[0].momoSubmission,'rejected');
  assert.equal(f.posts,1);
});
test('an interrupted submission never automatically posts another payout',async()=>{
  for (const momoSubmission of ['submitting','accepted',undefined]) {
    const f=fixture({...base,currentPhase:AppPhase.INITIATING_PAYOUT,momoSubmission});
    await flow.initiateAndVerifyPayout(()=>{}, {current:null}, {current:null});
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
  const f=fixture({...base,direction:'RWF_TO_SATS',momoReferenceId:'ref'});f.status=async()=>({status:'SUCCESSFUL'});
  const clock=createManualScheduler();
  flow.startPaymentVerification({scheduler:clock.scheduler,isCurrent:()=>false});
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
function startCashInPolling(t,clock,isCurrent=()=>true){
  const stop=flow.startPaymentVerification({scheduler:clock.scheduler,isCurrent});
  assert.equal(typeof stop,'function');
  t.after(stop);
  return stop;
}
test('cash-in polling uses injected time and owns its cancellation',async t=>{
  await t.test('initial success completes once without starting timers',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.status=async()=>{calls++;return {status:'SUCCESSFUL'};};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);
    assert.equal(f.store.activeTransaction.status,'COMPLETED');assert.deepEqual(f.invocations,['check_transaction_status']);
    clock.advanceBy(120000);await flushPolling();assert.equal(calls,1);
  });
  await t.test('a successful poll waits the configured interval and cancels the deadline',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.status=async()=>({status:++calls===1?'PENDING':'SUCCESSFUL'});
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.deepEqual(clock.delays,[5000,120000]);
    clock.advanceBy(4999);await flushPolling();assert.equal(calls,1);
    clock.advanceBy(1);await flushPolling();assert.equal(calls,2);assert.equal(clock.pendingCount,0);
    assert.equal(f.store.activeTransaction.status,'COMPLETED');assert.deepEqual(f.invocations,['check_transaction_status']);
  });
  for(const immediate of [true,false])await t.test(`${immediate?'initial':'polled'} provider failure is terminal and preserves its message`,async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.status=async()=>({status:immediate||++calls>1?'FAILED':'PENDING',message:'Synthetic decline'});
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    if(!immediate){clock.advanceBy(5000);await flushPolling();}
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.PAYMENT_FAILED);
    assert.equal(f.store.error,'Synthetic decline');assert.equal(f.store.history[0].status,'FAILED');
    assert.equal(clock.pendingCount,0);assert.deepEqual(f.invocations,[]);
  });
  await t.test('initial and later status errors continue polling without overlapping requests',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.status=async()=>{calls++;if(calls<=2)throw new Error('Synthetic connection failure');return {status:'PENDING'};};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    assert.deepEqual(clock.delays,[5000,120000]);
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,2);assert.deepEqual(clock.delays,[5000,115000]);
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,3);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);assert.equal(f.store.error,null);
  });
  await t.test('the next poll is scheduled after the pending request settles, never in parallel',async t=>{
    const f=fixture({...pollingTopup});let calls=0,resolve;
    f.status=()=>{calls++;return calls===2?new Promise(done=>{resolve=done;}):Promise.resolve({status:'UNKNOWN'});};
    const clock=createManualScheduler();startCashInPolling(t,clock);await flushPolling();
    clock.advanceBy(5000);await flushPolling();assert.equal(calls,2);
    clock.advanceBy(20000);await flushPolling();assert.equal(calls,2);assert.deepEqual(clock.delays,[95000]);
    resolve({status:'PENDING'});await flushPolling();assert.deepEqual(clock.delays,[5000,95000]);
    clock.advanceBy(4999);await flushPolling();assert.equal(calls,2);
    clock.advanceBy(1);await flushPolling();assert.equal(calls,3);
  });
  await t.test('cleanup is returned synchronously and retires an in-flight initial response',async t=>{
    const f=fixture({...pollingTopup});let resolve;
    f.status=()=>new Promise(done=>{resolve=done;});
    const clock=createManualScheduler();const stop=startCashInPolling(t,clock);
    stop();stop();resolve({status:'SUCCESSFUL'});await flushPolling();
    assert.equal(clock.pendingCount,0);assert.deepEqual(f.invocations,[]);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);
  });
  await t.test('cleanup cancels both timers and callbacks already queued cannot restart the loop',async t=>{
    const f=fixture({...pollingTopup});let calls=0;
    f.status=async()=>{calls++;return {status:'PENDING'};};
    const clock=createManualScheduler();const stop=startCashInPolling(t,clock);await flushPolling();
    const queued=clock.callbacks();stop();stop();assert.equal(clock.pendingCount,0);
    queued.forEach(callback=>callback());await flushPolling();clock.advanceBy(120000);await flushPolling();
    assert.equal(calls,1);assert.equal(clock.pendingCount,0);assert.equal(f.store.error,null);
    assert.equal(f.store.activeTransaction.currentPhase,AppPhase.VERIFYING_PAYMENT);
  });
  await t.test('deadline preserves pending recovery and ignores a later success or failure',async t=>{
    for(const status of ['SUCCESSFUL','FAILED']){
      const f=fixture({...pollingTopup});let calls=0,resolve;
      f.status=()=>++calls===1?Promise.resolve({status:'PENDING'}):new Promise(done=>{resolve=done;});
      const clock=createManualScheduler();const stop=startCashInPolling(t,clock);await flushPolling();
      clock.advanceBy(5000);await flushPolling();clock.advanceBy(115000);await flushPolling();
      assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);assert.equal(f.store.activeTransaction.status,'PENDING');
      assert.match(f.store.history[0].recoveryMessage,/not confirmed payment yet/);assert.equal(f.store.error,null);
      resolve({status});await flushPolling();assert.equal(f.store.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
      assert.deepEqual(f.invocations,[]);assert.equal(clock.pendingCount,0);stop();
    }
  });
  await t.test('there are no timers or provider calls without a foreground transaction',async()=>{
    const f=fixture();let calls=0;f.status=async()=>{calls++;return {status:'PENDING'};};
    const clock=createManualScheduler();const stop=flow.startPaymentVerification({scheduler:clock.scheduler});await flushPolling();
    assert.equal(stop,undefined);assert.equal(clock.pendingCount,0);assert.equal(calls,0);
  });
});
