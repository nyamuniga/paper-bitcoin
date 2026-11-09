import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = new URL('../src/services/flowServices.ts', import.meta.url).href;
const stub = code => ({url:'data:text/javascript,'+encodeURIComponent(code), shortCircuit:true});
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === source) {
    if (specifier === './momoService') return stub(`
      export const initiateMomoPaymentRequest=(...a)=>globalThis.__momo.init(...a);
      export const initiateMomoPayout=(...a)=>globalThis.__momo.payout(...a);
      export const checkMomoPaymentStatus=()=>globalThis.__momo.status();
      export const checkMomoPayoutStatus=()=>globalThis.__momo.status();`);
    if (specifier === './lightningService') return stub(`export const payLightningInvoice=()=>{globalThis.__momo.lightning++; return {success:true}}; export const createLightningInvoice=()=>{throw Error('Update required')};`);
    if (specifier === '../store/transactionStore') return stub('export const useTransactionStore={getState:()=>globalThis.__momo.store};');
    if (specifier === '../store/wallet') return stub('export const useWalletStore={getState:()=>({refreshWallet:async()=>{}})};');
    if (specifier === '../store/addressBookStore') return stub('export const useAddressBookStore={getState:()=>({recordSuccessfulUse:()=>{}})};');
    if (specifier === '@tauri-apps/api/core') return stub('export const invoke=(...a)=>globalThis.__momo.invoke(...a);');
    if (specifier === '@tauri-apps/plugin-http') return stub('export const fetch=async()=>({ok:true,json:async()=>({USD:{last:100000}})});');
    if (specifier === '../constants') return stub('export const EXCHANGE_RATE_API_URL="https://rate.example", SATS_PER_BTC=1e8, SPREAD=0.021, MOMO_WITHDRAWAL_FIXED_FEE=120, RWF_USD_PEG=1400, POLLING_INTERVAL_MS=5000, POLLING_TIMEOUT_MS=120000, MOMO_API_BASE_URL="https://proxy.example";');
  }
  if (context.parentURL?.includes('/src/') && specifier.startsWith('.')) return next(new URL(specifier+'.ts',context.parentURL).href,context);
  return next(specifier,context);
},load(url,context,next) {
  if(url.endsWith('/types/momo.ts')) return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const flow = await import(source);
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
  f.init=async()=>({success:false,submission:'rejected',message:'Update required'});
  f.payout=async()=>{f.posts++;return {success:false,submission:'rejected',message:'Update required'}};
  f.status=async()=>({status:'UNKNOWN',message:'No confirmation available'});
  f.invoke=async(cmd,args)=>{f.invocations.push(cmd);f.callArgs.push(args);return cmd==='receive_lightning'?{invoice:'invoice',quote_id:'quote'}:'Success'};
  // The real store exposes stable closures rather than methods bound to `this`.
  for(const key of ['setActiveTransaction','updateTransaction','updateTransactionById','updateTransactionPhase','setError','moveToHistory']) f.store[key]=f.store[key].bind(f.store);
  globalThis.__momo=f;return f;
}
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
  const interval={current:null},timeout={current:null};
  await flow.startPaymentVerification(()=>{},interval,timeout,()=>false);
  assert.equal(f.lightning,0);assert.deepEqual(f.invocations,[]);
  assert.equal(interval.current,null);assert.equal(timeout.current,null);
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
