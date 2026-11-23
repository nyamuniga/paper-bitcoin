import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createManualScheduler } from './helpers/manualScheduler.ts';

registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.includes('/src/')&&specifier.startsWith('.'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
  return next(specifier,context);
},load(url,context,next){
  if(url.endsWith('/types/momo.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const { startMomoTransactionProcessing, startSavedMomoRecovery }=await import('../src/services/momoProcessing.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const saved={id:'saved',direction:'RWF_TO_SATS',status:'PENDING',currentPhase:'RECOVERY_REQUIRED'};

function activeFixture(phase){
  const f={activeId:'selected',calls:[],cancellations:0,guard:null,guardWasCurrentDuringCleanup:null};
  const start=name=>(id,isCurrent)=>{
    f.calls.push([name,id]);f.guard=isCurrent;
    return ()=>{f.cancellations++;f.guardWasCurrentDuringCleanup=isCurrent();};
  };
  f.options={transactionId:'selected',phase,isActive:id=>f.activeId===id,operations:{
    verifyCashIn:start('cash-in'),initiatePayout:start('initiation'),verifyPayout:start('payout'),
    payFundingInvoice:()=>f.calls.push(['funding']),refreshWallet:()=>f.calls.push(['refresh']),
  }};
  return f;
}
test('active phase routing starts the correct existing operation',()=>{
  for(const [phase,expected] of [
    ['PENDING_PAYMENT',['cash-in','selected']],['VERIFYING_PAYMENT',['cash-in','selected']],
    ['INITIATING_PAYOUT',['initiation','selected']],['VERIFYING_PAYOUT',['payout','selected']],
    ['AWAITING_INVOICE_PAYMENT',['funding']],['AWAITING_ASP_BOARDING',['refresh']],['READY_TO_CLAIM',['refresh']],
  ]){
    const f=activeFixture(phase);const stop=startMomoTransactionProcessing(f.options);
    assert.deepEqual(f.calls,[expected]);assert.equal(typeof stop,'function');stop();
  }
});
test('cleanup retires the owner before delegating cancellation and is idempotent',()=>{
  for(const phase of ['PENDING_PAYMENT','VERIFYING_PAYMENT','INITIATING_PAYOUT','VERIFYING_PAYOUT']){
    const f=activeFixture(phase);const stop=startMomoTransactionProcessing(f.options);
    assert.equal(f.guard(),true);stop();stop();
    assert.equal(f.guard(),false);assert.equal(f.guardWasCurrentDuringCleanup,false);assert.equal(f.cancellations,1);
  }
});
test('an active owner observes replacement even before React cleanup',()=>{
  const f=activeFixture('VERIFYING_PAYOUT');const stop=startMomoTransactionProcessing(f.options);
  f.activeId='replacement';assert.equal(f.guard(),false);stop();assert.equal(f.cancellations,1);
});
test('obsolete selections and unrelated phases cannot launch a payment',()=>{
  const obsolete=activeFixture('AWAITING_INVOICE_PAYMENT');obsolete.activeId='replacement';
  assert.equal(startMomoTransactionProcessing(obsolete.options),undefined);assert.deepEqual(obsolete.calls,[]);
  for(const phase of [undefined,'IDLE','RECOVERY_REQUIRED','PAYING_INVOICE','FULFILLING','PAYMENT_FAILED']){
    const f=activeFixture(phase);startMomoTransactionProcessing(f.options)?.();assert.deepEqual(f.calls,[]);
  }
});

function recoveryFixture(){
  const f={clock:createManualScheduler(),now:0,active:null,history:[{...saved}],requests:[],errors:0,reads:0};
  f.recover=async id=>{f.requests.push({id,at:f.now});};
  f.start=()=>startSavedMomoRecovery({
    scheduler:f.clock.scheduler,now:()=>f.now,
    getTransactions:()=>{f.reads++;return {activeTransaction:f.active,history:f.history};},
    recover:id=>f.recover(id),reportError:()=>{f.errors++;},
  });
  f.advance=async milliseconds=>{
    while(milliseconds>0){const step=Math.min(milliseconds,5000);f.now+=step;f.clock.advanceBy(step);await flush();milliseconds-=step;}
  };
  return f;
}
test('saved recovery waits five seconds and selects only one eligible transfer per pass',async()=>{
  const f=recoveryFixture();f.active={...saved,id:'active'};
  f.history=[{...saved,id:'active'},{...saved,id:'done',status:'COMPLETED'},
    {...saved,id:'bitcoin',direction:'ONCHAIN_RECEIVE'},{...saved,id:'funding',currentPhase:'AWAITING_INVOICE_PAYMENT'},
    {...saved,id:'cashout',direction:'SATS_TO_RWF'},{...saved,id:'topup'}];
  const stop=f.start();await f.advance(4999);assert.deepEqual(f.requests,[]);
  await f.advance(1);assert.deepEqual(f.requests,[{id:'cashout',at:5000}]);
  await f.advance(5000);assert.deepEqual(f.requests,[{id:'cashout',at:5000},{id:'topup',at:10000}]);stop();
});
test('all existing saved recovery phases remain eligible and terminal or unknown phases do not',async()=>{
  for(const phase of ['RECOVERY_REQUIRED','RETRYABLE_ERROR','PENDING_PAYMENT','VERIFYING_PAYMENT','VERIFYING_PAYOUT',undefined,'READY_TO_CLAIM']){
    const f=recoveryFixture();f.history[0].currentPhase=phase;const stop=f.start();await f.advance(5000);
    assert.equal(f.requests.length,['RECOVERY_REQUIRED','RETRYABLE_ERROR','PENDING_PAYMENT','VERIFYING_PAYMENT','VERIFYING_PAYOUT'].includes(phase)?1:0);stop();
  }
});
test('saved recovery retains its thirty-second initial backoff and five-minute cap',async()=>{
  const f=recoveryFixture();const stop=f.start();await f.advance(5000);
  for(const delay of [30000,60000,120000,240000,300000,300000])await f.advance(delay);
  assert.deepEqual(f.requests.map(request=>request.at),[5000,35000,95000,215000,455000,755000,1055000]);stop();
});
test('a recovery error is reported without stopping subsequent scheduled checks',async()=>{
  const f=recoveryFixture();f.recover=async id=>{f.requests.push({id,at:f.now});throw new Error('Synthetic recovery outage');};
  const stop=f.start();await f.advance(5000);await f.advance(30000);
  assert.equal(f.requests.length,2);assert.equal(f.errors,2);assert.equal(f.clock.pendingCount,1);stop();
});
test('recovery requests do not overlap and the next cadence begins after settlement',async()=>{
  const f=recoveryFixture();let resolve;
  f.recover=id=>{f.requests.push({id,at:f.now});return new Promise(done=>{resolve=done;});};
  const stop=f.start();await f.advance(5000);await f.advance(50000);
  assert.equal(f.requests.length,1);assert.equal(f.clock.pendingCount,0);
  resolve();await flush();assert.deepEqual(f.clock.delays,[5000]);
  await f.advance(5000);assert.equal(f.requests.length,2);stop();resolve();await flush();assert.equal(f.clock.pendingCount,0);
});
test('cleanup cancels scheduled and already queued recovery callbacks without reading or dispatching',async()=>{
  const f=recoveryFixture();const stop=f.start();const queued=f.clock.callbacks();stop();stop();
  queued.forEach(callback=>callback());await f.advance(120000);
  assert.equal(f.reads,0);assert.deepEqual(f.requests,[]);assert.equal(f.clock.pendingCount,0);
});
test('unmount during recovery cannot schedule another request after it settles',async()=>{
  const f=recoveryFixture();let resolve;f.recover=()=>new Promise(done=>{resolve=done;});
  const stop=f.start();await f.advance(5000);stop();resolve();await flush();await f.advance(120000);
  assert.equal(f.reads,1);assert.equal(f.clock.pendingCount,0);
});
test('becoming active clears the saved attempt backoff before that transfer is saved again',async()=>{
  const f=recoveryFixture();const stop=f.start();await f.advance(5000);
  f.active={...saved};await f.advance(5000);assert.equal(f.requests.length,1);
  f.active=null;await f.advance(5000);assert.deepEqual(f.requests.map(request=>request.at),[5000,15000]);stop();
});
