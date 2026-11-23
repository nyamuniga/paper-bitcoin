import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualScheduler } from './helpers/manualScheduler.ts';
import { createSparkReconciler, startSparkReconciliation } from '../src/services/sparkReconciliation.ts';
import { createTransactionStatusReader, pendingOnchainMint, startCashuReconciliation, checkWalletTransaction } from '../src/services/walletReconciliation.ts';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const transaction=(id,type='ReceiveLightning',extra={})=>({id,status:'Pending',mint_url:'https://mint.example.test',tx_type:{[type]:{}},...extra});
function cashuFixture(){
  const f={clock:createManualScheduler(),transactions:[transaction('lightning')],checks:[],hints:[],refreshes:0,errors:[],activeQuote:null,reads:0};
  f.check=async id=>{f.checks.push(id);return 'Pending';};
  f.start=()=>startCashuReconciliation({
    scheduler:f.clock.scheduler,getTransactions:async()=>{f.reads++;return f.transactions;},
    activeQuoteId:()=>f.activeQuote,checkTransaction:transaction=>f.check(transaction.id),requestSpark:mint=>f.hints.push(mint),
    refreshWallet:async()=>{f.refreshes++;},reportError:(...args)=>f.errors.push(args),
  });
  return f;
}
test('Lightning checks start without waiting for an unresolved Spark operation',async()=>{
  const spark=deferred();const sparkClock=createManualScheduler();let sparkRequests=0;
  const sparkOwner=startSparkReconciliation({scheduler:sparkClock.scheduler,reconcile:()=>{sparkRequests++;return spark.promise;},subscribe:()=>()=>{},refreshWallet:async()=>{},reportError:()=>{}});
  const f=cashuFixture();const stop=f.start();await flush();
  assert.deepEqual(f.checks,['lightning']);assert.equal(sparkRequests,1);
  f.clock.advanceBy(2000);await flush();assert.deepEqual(f.checks,['lightning','lightning']);
  stop();sparkOwner.stop();spark.resolve(false);await flush();
});
test('a slow status request cannot block a different or newly discovered Lightning receipt',async()=>{
  const f=cashuFixture();const slow=deferred();f.transactions=[transaction('slow'),transaction('fast')];
  f.check=id=>{f.checks.push(id);return id==='slow'?slow.promise:Promise.resolve('Pending');};
  const stop=f.start();await flush();f.transactions.push(transaction('new'));
  f.clock.advanceBy(2000);await flush();
  assert.deepEqual(f.checks,['slow','fast','fast','new']);stop();slow.resolve('Success');await flush();assert.equal(f.refreshes,0);
});
test('pending on-chain hints do not block parallel Lightning status requests',async()=>{
  const f=cashuFixture();f.transactions=[transaction('chain','ReceiveOnchain'),transaction('lightning')];
  const stop=f.start();await flush();assert.deepEqual(f.hints,['https://mint.example.test']);assert.deepEqual(f.checks,['chain','lightning']);stop();
});
test('automatic polling retains eligible transaction types and excludes completed or foreground-owned quotes',async()=>{
  const f=cashuFixture();f.activeQuote='owned';
  f.transactions=['ReceiveLightning','ReceiveOnchain','Melt','Send','SendOnchain','Mint','Issue'].map(type=>transaction(type,type));
  f.transactions.push(transaction('owned'),transaction('complete','ReceiveLightning',{status:'Success'}));
  const stop=f.start();await flush();assert.deepEqual(f.checks,['ReceiveLightning','ReceiveOnchain','Melt','Send','SendOnchain']);stop();
});
test('a terminal status refreshes the wallet and failed checks remain retryable',async()=>{
  const f=cashuFixture();let requests=0;f.check=async()=>{if(++requests===1)throw new Error('Synthetic status outage');return 'Success';};
  const stop=f.start();await flush();assert.equal(f.errors.length,1);
  f.clock.advanceBy(2000);await flush();assert.equal(f.refreshes,1);stop();
});
test('cashu cleanup ignores an unresolved list and already queued polling callbacks',async()=>{
  const f=cashuFixture();const stop=f.start();await flush();const queued=f.clock.callbacks();stop();stop();queued.forEach(callback=>callback());
  await flush();assert.equal(f.reads,1);assert.equal(f.clock.pendingCount,0);
  const list=deferred();let checked=0;
  const cancel=startCashuReconciliation({scheduler:f.clock.scheduler,getTransactions:()=>list.promise,activeQuoteId:()=>null,checkTransaction:async()=>{checked++;return 'Success';},requestSpark:()=>{},refreshWallet:async()=>{},reportError:()=>{}});
  cancel();list.resolve([transaction('late')]);await flush();assert.equal(checked,0);assert.equal(f.clock.pendingCount,0);
});
test('Spark timer, event and manual triggers share a single in-flight sweep',async()=>{
  const first=deferred();let calls=0;const hints=[];
  const reconcile=createSparkReconciler(mint=>{calls++;hints.push(mint);return calls===1?first.promise:Promise.resolve(false);});
  const a=reconcile('https://mint.example.test');const b=reconcile();const c=reconcile('https://mint.example.test');await flush();
  assert.equal(a,b);assert.equal(b,c);assert.equal(calls,1);first.resolve(true);assert.equal(await a,true);
  await reconcile('https://next.example.test');assert.equal(calls,2);assert.deepEqual(hints,['https://mint.example.test','https://next.example.test']);
});
test('Spark coordination releases its in-flight guard after failure',async()=>{
  let calls=0;const reconcile=createSparkReconciler(async()=>{if(++calls===1)throw new Error('Synthetic sync failure');return false;});
  await assert.rejects(reconcile(),/Synthetic sync failure/);await reconcile();assert.equal(calls,2);
});
test('Spark preserves initial/periodic checks and relevant SDK event triggers without overlap',async()=>{
  const clock=createManualScheduler();const pending=deferred();let listener,calls=0,refreshes=0,unsubscribed=0;
  const owner=startSparkReconciliation({scheduler:clock.scheduler,reconcile:()=>{calls++;return pending.promise;},subscribe:callback=>{listener=callback;return ()=>{unsubscribed++;};},refreshWallet:async()=>{refreshes++;},reportError:()=>{}});
  await flush();assert.equal(calls,1);
  for(const type of ['claimedDeposits','unclaimedDeposits','newDeposits','paymentSucceeded','unrelated'])listener({type});
  clock.advanceBy(15000);await flush();assert.equal(calls,1);
  pending.resolve(true);await flush();assert.equal(refreshes,1);owner.stop();owner.stop();listener({type:'newDeposits'});clock.advanceBy(15000);await flush();
  assert.equal(calls,1);assert.equal(unsubscribed,1);assert.equal(clock.pendingCount,0);
});
test('Spark resumes periodic and event checks after a settled attempt or failure',async()=>{
  const clock=createManualScheduler();let listener,calls=0,errors=0;
  const owner=startSparkReconciliation({scheduler:clock.scheduler,reconcile:async()=>{if(++calls===1)throw new Error('Synthetic sweep failure');return false;},subscribe:callback=>{listener=callback;return ()=>{};},refreshWallet:async()=>{},reportError:()=>{errors++;}});
  await flush();assert.equal(errors,1);clock.advanceBy(15000);await flush();assert.equal(calls,2);
  listener({type:'unrelated'});await flush();assert.equal(calls,2);listener({type:'newDeposits'});await flush();assert.equal(calls,3);owner.stop();
});
test('stopping Spark while it is running prevents late refresh and queued restarts',async()=>{
  const clock=createManualScheduler();const pending=deferred();let calls=0,refreshes=0;
  const owner=startSparkReconciliation({scheduler:clock.scheduler,reconcile:()=>{calls++;return pending.promise;},subscribe:()=>()=>{},refreshWallet:async()=>{refreshes++;},reportError:()=>{}});
  const queued=clock.callbacks();owner.stop();queued.forEach(callback=>callback());pending.resolve(true);await flush();assert.equal(calls,1);assert.equal(refreshes,0);assert.equal(clock.pendingCount,0);
});
test('manual Lightning and ordinary Cashu checks never start Spark',async()=>{
  for(const type of ['ReceiveLightning','Melt','Mint','Send','ReceiveEcash']){
    let spark=0;const ids=[];const result=await checkWalletTransaction(transaction(type,type),{checkStatus:async id=>{ids.push(id);return 'Success';},reconcileSpark:async()=>{spark++;return false;}});
    assert.equal(result,'Success');assert.deepEqual(ids,[type]);assert.equal(spark,0);
  }
});
test('manual on-chain recovery retains Spark reconciliation and checks native status even if Spark fails',async()=>{
  for(const type of ['ReceiveOnchain','SendOnchain']){
    const sequence=[];const result=await checkWalletTransaction(transaction('chain',type),{reconcileSpark:async mint=>{sequence.push(mint);throw new Error('Synthetic Spark unavailable');},checkStatus:async id=>{sequence.push(id);return 'Pending';}});
    assert.equal(result,'Pending');assert.deepEqual(sequence,['https://mint.example.test','chain']);
  }
});


test('automatic/manual status checks share an outstanding ID and release it after settlement',async()=>{
  const pending=deferred();const calls=[];
  const read=createTransactionStatusReader(id=>{calls.push(id);return id==='slow'?pending.promise:Promise.resolve('Success');});
  const automatic=read('slow');const manual=read('slow');assert.equal(automatic,manual);
  assert.equal(await read('fast'),'Success');assert.deepEqual(calls,['slow','fast']);
  pending.reject(new Error('Synthetic native failure'));await assert.rejects(automatic,/Synthetic native failure/);
  await assert.rejects(read('slow'),/Synthetic native failure/);assert.deepEqual(calls,['slow','fast','slow']);
});


test('Spark mint selection retains the first pending on-chain receipt and excludes the active quote',()=>{
  const transactions=[transaction('complete','ReceiveOnchain',{status:'Success'}),transaction('owned','ReceiveOnchain'),
    transaction('lightning'),transaction('chain','ReceiveOnchain',{mint_url:'https://preferred.example.test'})];
  assert.equal(pendingOnchainMint(transactions,'owned'),'https://preferred.example.test');
  assert.equal(pendingOnchainMint([transaction('lightning')]),undefined);
});
test('a failed native transaction scan does not disable future scans',async()=>{
  const clock=createManualScheduler();let reads=0,checked=0,errors=0;
  const stop=startCashuReconciliation({scheduler:clock.scheduler,getTransactions:async()=>{if(++reads===1)throw new Error('Synthetic list failure');return [transaction('lightning')];},
    activeQuoteId:()=>null,checkTransaction:async()=>{checked++;return 'Pending';},requestSpark:()=>{},refreshWallet:async()=>{},reportError:()=>{errors++;}});
  await flush();assert.equal(errors,1);clock.advanceBy(2000);await flush();assert.equal(checked,1);stop();
});


test('automatic on-chain status keeps Spark ordering while Lightning checks proceed independently',async()=>{
  const clock=createManualScheduler();const spark=deferred();const checked=[];
  const stop=startCashuReconciliation({scheduler:clock.scheduler,
    getTransactions:async()=>[transaction('chain','ReceiveOnchain'),transaction('lightning')],activeQuoteId:()=>null,
    checkTransaction:transaction=>checkWalletTransaction(transaction,{reconcileSpark:()=>spark.promise,checkStatus:async id=>{checked.push(id);return 'Pending';}}),
    requestSpark:()=>{},refreshWallet:async()=>{},reportError:()=>{}});
  await flush();assert.deepEqual(checked,['lightning']);spark.resolve(false);await flush();assert.deepEqual(checked,['lightning','chain']);stop();
});


test('unmount while an on-chain check awaits Spark cannot dispatch its native status afterward',async()=>{
  const clock=createManualScheduler();const spark=deferred();let checked=0,errors=0;
  const stop=startCashuReconciliation({scheduler:clock.scheduler,getTransactions:async()=>[transaction('chain','ReceiveOnchain')],activeQuoteId:()=>null,
    checkTransaction:(transaction,isCurrent)=>checkWalletTransaction(transaction,{isCurrent,reconcileSpark:()=>spark.promise,checkStatus:async()=>{checked++;return 'Success';}}),
    requestSpark:()=>{},refreshWallet:async()=>{},reportError:()=>{errors++;}});
  await flush();stop();spark.resolve(false);await flush();assert.equal(checked,0);assert.equal(errors,0);assert.equal(clock.pendingCount,0);
});
