import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/') && specifier.startsWith('.')) return next(new URL(specifier+'.ts',context.parentURL).href,context);
  return next(specifier, context);
}, load(url, context, next) {
  if (url.endsWith('/types/momo.ts')) return {format:'module', source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const { recoverInterruptedMomo } = await import('../src/services/momoRecovery.ts');
const { AppPhase } = await import('../src/types/momo.ts');
const base = {id:'saved-id', direction:'RWF_TO_SATS', status:'PENDING', invoice:'invoice', mintQuoteId:'quote'};

test('legacy initiating topup survives restart as recoverable, retaining its identifiers', () => {
  const result = recoverInterruptedMomo({...base, currentPhase:AppPhase.INITIATING_PAYMENT});
  assert.equal(result.currentPhase, AppPhase.RECOVERY_REQUIRED);
  assert.equal(result.status, 'PENDING');
  assert.equal(result.id, 'saved-id');
  assert.equal(result.mintQuoteId, 'quote');
});
test('interrupted preparation before a payment can start is safely dismissible', () => {
  for (const currentPhase of [AppPhase.FETCHING_RATE, AppPhase.GENERATING_INVOICE]) {
    const result = recoverInterruptedMomo({...base, currentPhase});
    assert.equal(result.currentPhase, AppPhase.PAYMENT_FAILED);
    assert.equal(result.status, 'FAILED');
  }
});
test('rejected topup can be dismissed, but funded cashout must remain recoverable', () => {
  const rejected = {...base, momoSubmission:'rejected', currentPhase:AppPhase.INITIATING_PAYMENT};
  assert.equal(recoverInterruptedMomo(rejected).status, 'FAILED');
  const payout = recoverInterruptedMomo({...rejected, direction:'SATS_TO_RWF', currentPhase:AppPhase.INITIATING_PAYOUT, invoicePaid:true});
  assert.equal(payout.currentPhase, AppPhase.RECOVERY_REQUIRED);
  assert.equal(payout.invoicePaid, true);
  assert.equal(payout.status, 'PENDING');
});
test('funding interrupted before invoicePaid was saved must never automatically pay again', () => {
  const result = recoverInterruptedMomo({...base, direction:'SATS_TO_RWF', currentPhase:AppPhase.PAYING_INVOICE, invoicePaid:false});
  assert.equal(result.currentPhase, AppPhase.RECOVERY_REQUIRED);
  assert.equal(result.invoicePaid, false);
});
test('terminal transfers and unrelated directions are unchanged', () => {
  for (const tx of [{...base,status:'COMPLETED',currentPhase:AppPhase.READY_TO_CLAIM}, {...base,direction:'ONCHAIN_SEND',currentPhase:AppPhase.PAYING_INVOICE}]) {
    assert.deepEqual(recoverInterruptedMomo(tx), tx);
  }
});
test('legacy failed funded cashout is recovered rather than discarded on close', () => {
  const tx = recoverInterruptedMomo({...base,direction:'SATS_TO_RWF',invoicePaid:true,status:'FAILED',currentPhase:AppPhase.PAYMENT_FAILED});
  assert.equal(tx.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(tx.status,'PENDING');
});
test('real persistent store restores an initiating transfer into a closeable recovery screen', async () => {
  const saved=new Map([['cashu-transaction-storage',JSON.stringify({state:{activeTransaction:{...base,currentPhase:AppPhase.INITIATING_PAYMENT},history:[],error:null},version:0})]]);
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  const {useTransactionStore}=await import('../src/store/transactionStore.ts');
  const state=useTransactionStore.getState();
  assert.equal(state.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(state.history[0].id,'saved-id');
  assert.equal(JSON.parse(saved.get('cashu-transaction-storage')).state.activeTransaction.currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(state.history.length,1);
});
test('saving a pending cashout frees the form and preserves its funding across restart', async () => {
  const {useTransactionStore}=await import('../src/store/transactionStore.ts');
  const tx={...base,direction:'SATS_TO_RWF',invoicePaid:true,currentPhase:AppPhase.RECOVERY_REQUIRED};
  useTransactionStore.setState({activeTransaction:tx,history:[],error:'old error'});
  assert.equal(useTransactionStore.getState().saveActiveTransaction(),true);
  assert.equal(useTransactionStore.getState().activeTransaction,null);
  assert.equal(useTransactionStore.getState().error,null);
  await useTransactionStore.persist.rehydrate();
  assert.equal(useTransactionStore.getState().activeTransaction,null);
  assert.equal(useTransactionStore.getState().history[0].invoicePaid,true);
  assert.equal(useTransactionStore.getState().history[0].id,'saved-id');
  assert.equal(useTransactionStore.getState().resumeTransaction('saved-id'),true);
  assert.equal(useTransactionStore.getState().activeTransaction.invoice,'invoice');
});
test('waiting provider checks can be saved, but submitting/funding cannot be detached', async () => {
  const {useTransactionStore}=await import('../src/store/transactionStore.ts');
  for(const currentPhase of [AppPhase.PENDING_PAYMENT,AppPhase.VERIFYING_PAYMENT,AppPhase.VERIFYING_PAYOUT]) {
    useTransactionStore.setState({activeTransaction:{...base,currentPhase},history:[]});
    assert.equal(useTransactionStore.getState().saveActiveTransaction(),true);
    assert.equal(useTransactionStore.getState().history[0].currentPhase,AppPhase.RECOVERY_REQUIRED);
  }
  for(const currentPhase of [AppPhase.FETCHING_RATE,AppPhase.INITIATING_PAYMENT,AppPhase.GENERATING_INVOICE,AppPhase.AWAITING_INVOICE_PAYMENT,AppPhase.PAYING_INVOICE,AppPhase.INITIATING_PAYOUT,AppPhase.FULFILLING]) {
    useTransactionStore.setState({activeTransaction:{...base,currentPhase},history:[]});
    assert.equal(useTransactionStore.getState().saveActiveTransaction(),false);
    assert.equal(useTransactionStore.getState().activeTransaction.id,'saved-id');
  }
});
test('a saved transfer cannot replace a different transfer that is currently funding',async()=>{
  const {useTransactionStore}=await import('../src/store/transactionStore.ts');
  useTransactionStore.setState({activeTransaction:{...base,id:'new-transfer',currentPhase:AppPhase.PAYING_INVOICE},history:[{...base,currentPhase:AppPhase.RECOVERY_REQUIRED}]});
  assert.equal(useTransactionStore.getState().resumeTransaction('saved-id'),false);
  assert.equal(useTransactionStore.getState().activeTransaction.id,'new-transfer');
  assert.equal(useTransactionStore.getState().history[0].id,'saved-id');
});
test('restart recovers a saved transfer interrupted during background fulfillment',async()=>{
  const {useTransactionStore}=await import('../src/store/transactionStore.ts');
  useTransactionStore.setState({activeTransaction:null,history:[{...base,currentPhase:AppPhase.FULFILLING}]});
  await useTransactionStore.persist.rehydrate();
  assert.equal(useTransactionStore.getState().activeTransaction,null);
  assert.equal(useTransactionStore.getState().history[0].currentPhase,AppPhase.RECOVERY_REQUIRED);
  assert.equal(useTransactionStore.getState().history[0].mintQuoteId,'quote');
});
