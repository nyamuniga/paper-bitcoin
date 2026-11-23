import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Resolve source imports and compile the existing enum; external operations are ordinary fakes.
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.includes('/src/')&&specifier.startsWith('.'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
  return next(specifier,context);
},load(url,context,next){
  if(url.endsWith('/types/momo.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const { fulfillMomoTransaction }=await import('../src/services/momoFulfillment.ts');
const base={id:'topup',direction:'RWF_TO_SATS',rwfAmount:1000,satsAmount:700,status:'PENDING',
  invoice:'selected-invoice',mintQuoteId:'selected-quote',momoPhoneNumber:'0781234567',currentPhase:'RECOVERY_REQUIRED'};
const other={...base,id:'other',invoice:'other-invoice',mintQuoteId:'other-quote',currentPhase:'VERIFYING_PAYMENT'};
function fixture(){
  const f={active:{...base},history:[],error:null,now:0,checks:[],payments:[],waits:[],completed:[]};
  f.transactions={
    findById:id=>f.active?.id===id?f.active:f.history.find(tx=>tx.id===id),
    updateById:(id,updates)=>{
      const tx=f.transactions.findById(id);if(!tx)return;
      const updated={...tx,...updates};
      if(f.active?.id===id)f.active=updated;
      f.history=[updated,...f.history.filter(tx=>tx.id!==id)];
    },
    setErrorFor:(id,error)=>{if(f.active?.id===id)f.error=error;},
  };
  f.operations={
    checkMintStatus:async id=>{f.checks.push(id);return f.checks.length===1?'Pending':'Success';},
    payInvoice:async invoice=>{f.payments.push(invoice);return {success:true};},
    wait:async ms=>{f.waits.push(ms);f.now+=ms;},
    now:()=>f.now,
  };
  f.run=()=>fulfillMomoTransaction({transactionId:base.id,transactions:f.transactions,operations:f.operations,onCompleted:tx=>f.completed.push(tx.id)});
  return f;
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('an already claimed mint quote completes without another payment',async()=>{
  const f=fixture();f.operations.checkMintStatus=async id=>{f.checks.push(id);return 'Success';};
  await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.equal(f.active.currentPhase,'READY_TO_CLAIM');
  assert.equal(f.history[0].fulfillmentStep,'COMPLETED');assert.deepEqual(f.checks,['selected-quote']);
  assert.deepEqual(f.payments,[]);assert.deepEqual(f.waits,[]);assert.deepEqual(f.completed,['topup']);
});
test('fulfillment pays the selected invoice and then waits for its mint quote',async()=>{
  const f=fixture();await f.run();
  assert.deepEqual(f.checks,['selected-quote','selected-quote']);assert.deepEqual(f.payments,['selected-invoice']);
  assert.deepEqual(f.waits,[2000]);assert.equal(f.active.status,'COMPLETED');assert.equal(f.active.timestamp,2000);
});
test('an unavailable initial mint check enters recovery without attempting payment and can be retried',async()=>{
  const f=fixture();f.operations.checkMintStatus=async()=>{throw new Error('Synthetic preflight failure');};await f.run();
  assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');assert.equal(f.active.status,'PENDING');
  assert.equal(f.error,'Synthetic preflight failure');assert.deepEqual(f.payments,[]);assert.deepEqual(f.waits,[]);
  f.operations.checkMintStatus=async()=> 'Success';await f.run();assert.equal(f.active.status,'COMPLETED');
});
test('payment rejection or an unknown payment exception preserves the saved invoice for recovery',async t=>{
  for(const throws of [false,true])await t.test(throws?'unknown exception':'rejected result',async()=>{
    const f=fixture();f.operations.payInvoice=async invoice=>{
      f.payments.push(invoice);if(throws)throw new Error('Synthetic unknown payment');return {success:false,message:'Synthetic payment rejection'};
    };await f.run();
    assert.equal(f.active.status,'PENDING');assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');
    assert.equal(f.history[0].invoice,'selected-invoice');assert.deepEqual(f.payments,['selected-invoice']);
    assert.equal(f.checks.length,1);assert.deepEqual(f.waits,[]);assert.match(f.error,/Synthetic/);
  });
});
test('a failed post-payment mint check retries status without paying again',async()=>{
  const f=fixture();f.operations.checkMintStatus=async id=>{
    f.checks.push(id);if(f.checks.length===2)throw new Error('Synthetic mint outage');return f.checks.length===1?'Pending':'Success';
  };await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.deepEqual(f.payments,['selected-invoice']);assert.deepEqual(f.waits,[2000,2000]);
});
test('exhausted mint attempts preserve recovery, and a later claimed quote avoids another payment',async()=>{
  const f=fixture();f.operations.checkMintStatus=async id=>{f.checks.push(id);return 'Pending';};await f.run();
  assert.equal(f.active.status,'PENDING');assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');
  assert.equal(f.checks.length,21);assert.equal(f.waits.length,20);assert.match(f.error,/Payment succeeded but failed to mint eCash/);
  f.operations.checkMintStatus=async()=> 'Success';await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.deepEqual(f.payments,['selected-invoice']);
});
test('the existing ninety-second mint budget stops further attempts',async()=>{
  const f=fixture();f.operations.checkMintStatus=async id=>{f.checks.push(id);return 'Pending';};
  f.operations.wait=async()=>{f.now+=30000;};await f.run();
  assert.equal(f.now,90000);assert.equal(f.checks.length,4);assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');
});
test('failure saving the post-payment phase preserves recovery before any further mint check',async()=>{
  const f=fixture();const update=f.transactions.updateById;
  f.transactions.updateById=(id,updates)=>{if(updates.currentPhase==='FULFILLING')throw new Error('Synthetic post-payment save failure');update(id,updates);};
  await f.run();assert.deepEqual(f.payments,['selected-invoice']);assert.equal(f.checks.length,1);
  assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');assert.equal(f.active.status,'PENDING');assert.match(f.error,/save failure/);
  f.transactions.updateById=update;f.operations.checkMintStatus=async()=> 'Success';await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.equal(f.payments.length,1);
});
test('an interrupted retry wait enters recovery without another external call',async()=>{
  const f=fixture();f.operations.wait=async()=>{throw new Error('Synthetic interrupted wait');};await f.run();
  assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');assert.equal(f.checks.length,1);assert.equal(f.payments.length,1);
  assert.match(f.active.recoveryMessage,/Payment succeeded but failed to mint eCash.*Synthetic interrupted wait/);
});
test('a saved target can finish without updating a different foreground transfer or error',async()=>{
  const f=fixture();const status=deferred();f.operations.checkMintStatus=()=>status.promise;
  const running=f.run();f.history=[{...f.active}];f.active={...other};f.error='Other transfer error';
  status.resolve('Pending');f.operations.checkMintStatus=async()=> 'Success';await running;
  assert.deepEqual(f.active,other);assert.equal(f.error,'Other transfer error');
  assert.equal(f.history.find(tx=>tx.id==='topup').status,'COMPLETED');assert.deepEqual(f.payments,['selected-invoice']);
});
test('removed or newer terminal/recovery targets cannot receive late payment results',async()=>{
  for(const replacement of [null,{...base,status:'COMPLETED',currentPhase:'READY_TO_CLAIM'},{...base,currentPhase:'RECOVERY_REQUIRED'}]){
    const f=fixture();const payment=deferred();f.operations.payInvoice=()=>payment.promise;
    const running=f.run();await new Promise(resolve=>setImmediate(resolve));f.active=replacement;f.history=[];
    payment.resolve({success:true});await running;
    assert.deepEqual(f.active,replacement);assert.deepEqual(f.history,[]);assert.equal(f.checks.length,1);assert.deepEqual(f.completed,[]);
  }
});
test('duplicate fulfillment owners share the existing transaction guard',async()=>{
  const f=fixture();const status=deferred();let checks=0;
  f.operations.checkMintStatus=()=>{checks++;return status.promise;};
  const first=f.run();await f.run();assert.equal(checks,1);status.resolve('Success');await first;
  await f.run();assert.equal(checks,1);assert.deepEqual(f.completed,['topup']);assert.deepEqual(f.payments,[]);
});
test('missing, cash-out and completed targets do not start external work',async()=>{
  for(const target of [null,{...base,direction:'SATS_TO_RWF'},{...base,status:'COMPLETED'}]){
    const f=fixture();f.active=target;await f.run();assert.deepEqual(f.checks,[]);assert.deepEqual(f.payments,[]);
  }
});

test('a failed completion save remains recoverable and does not repeat a confirmed payment',async()=>{
  const f=fixture();const update=f.transactions.updateById;
  f.transactions.updateById=(id,updates)=>{if(updates.status==='COMPLETED')throw new Error('Synthetic completion save failure');update(id,updates);};
  await f.run();assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');assert.equal(f.active.status,'PENDING');
  assert.match(f.error,/completion save failure/);assert.deepEqual(f.completed,[]);assert.equal(f.payments.length,1);
  f.transactions.updateById=update;f.operations.checkMintStatus=async()=> 'Success';await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.equal(f.payments.length,1);assert.deepEqual(f.completed,['topup']);
});
test('missing saved invoice or quote enters recovery before payment',async()=>{
  for(const updates of [{invoice:''},{mintQuoteId:null}]){
    const f=fixture();f.active={...f.active,...updates};await f.run();
    assert.equal(f.active.currentPhase,'RECOVERY_REQUIRED');assert.match(f.error,/saved (invoice|mint quote) is missing/);
    assert.deepEqual(f.payments,[]);assert.equal(f.checks.length,updates.invoice===''?1:0);
  }
});
test('a changed quote on the same transaction cannot be paid by an older fulfillment owner',async()=>{
  const f=fixture();const check=deferred();f.operations.checkMintStatus=()=>check.promise;
  const running=f.run();f.active={...f.active,invoice:'replacement-invoice',mintQuoteId:'replacement-quote'};
  const replacement={...f.active};check.resolve('Pending');await running;
  assert.deepEqual(f.active,replacement);assert.deepEqual(f.payments,[]);assert.deepEqual(f.completed,[]);
});


test('a claimed quote can complete an older record even when its invoice is missing',async()=>{
  const f=fixture();f.active.invoice='';f.operations.checkMintStatus=async()=> 'Success';await f.run();
  assert.equal(f.active.status,'COMPLETED');assert.deepEqual(f.payments,[]);
});
