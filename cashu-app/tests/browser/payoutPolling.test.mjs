import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries={name:'payout-clock-and-provider-boundaries',setup(build){
  const path=fileURLToPath(new URL('./payoutPolling.boundaries.ts',import.meta.url));
  const recoveryPath=fileURLToPath(new URL('./savedMomoRecovery.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^@tauri-apps\/api\/core$|\/((services\/)?(scheduler|momoService|lightningService|sparkService)|store\/(wallet|addressBookStore)|constants\.local)$/},args=>({path:args.path.endsWith('/scheduler')&&args.importer.endsWith('/savedMomoRecoveryAdapter.ts')?recoveryPath:path}));
  build.onResolve({filter:/^@tauri-apps\/plugin-http$/},()=>({path}));
}};
test('payout polling: real processor and store lifecycle',{timeout:30000},async t=>{
  const {evaluate,open}=await createBrowserFixture(t,new URL('./payoutPolling.fixture.tsx',import.meta.url),'#fixture',[boundaries]);
  const act=async code=>{await evaluate(code+';true');await wait(40);};
  const load=async()=>{await open('');await wait(40);};
  const state=()=>evaluate('payout.snapshot()');
  const noFunding=async()=>assert.equal(await evaluate('payout.fixture.native.some(command=>command==="pay_invoice"||command==="receive_lightning")'),false);

  await t.test('a referenced payout polls after the interval, completes and records the recipient without submitting',async()=>{
    await load();await act('payout.start()');
    assert.deepEqual(await evaluate('payout.clock.delays'),[5000,120000]);assert.equal(await evaluate('payout.fixture.requests.length'),0);
    await act('payout.clock.advanceBy(5000)');assert.equal(await evaluate('payout.fixture.requests.at(-1).id'),'polling-payout');
    await act('payout.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    assert.equal((await state()).transaction.status,'COMPLETED');assert.equal((await state()).history[0].invoicePaid,true);
    assert.equal(await evaluate('payout.clock.pendingCount'),0);assert.equal(await evaluate('payout.fixture.submissions.length'),0);
    assert.deepEqual(await evaluate('payout.fixture.contacts'),[['momo','0781234567',{network:'mtn',currency:'RWF'}]]);await noFunding();
  });
  await t.test('unknown and rejected status checks reach recovery without another payout or late completion',async()=>{
    await load();await act('payout.start()');await act('payout.clock.advanceBy(5000)');
    await act('payout.fixture.requests.at(-1).resolve("UNKNOWN")');
    await act('payout.clock.advanceBy(5000)');await act('payout.fixture.requests.at(-1).reject()');
    await act('payout.clock.advanceBy(5000)');const count=await evaluate('payout.fixture.requests.length');
    await act('payout.clock.advanceBy(105000)');await act('payout.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    const snapshot=await state();assert.equal(snapshot.transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal(snapshot.transaction.status,'PENDING');
    assert.equal(snapshot.transaction.invoicePaid,true);assert.equal(snapshot.history[0].payoutReferenceId,'synthetic-payout-reference');
    assert.equal(await evaluate('payout.fixture.requests.length'),count);assert.equal(await evaluate('payout.clock.pendingCount'),0);
    assert.equal(await evaluate('payout.fixture.submissions.length'),0);await noFunding();
  });
  await t.test('unmount cancels queued work and ignores an in-flight response',async()=>{
    await load();await act('payout.start()');await act('window.queuedPayoutCallbacks=payout.clock.callbacks();payout.clock.advanceBy(5000)');
    await act('payout.unmount()');await act('queuedPayoutCallbacks.forEach(callback=>callback());payout.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    assert.equal(await evaluate('payout.clock.pendingCount'),0);assert.equal(await evaluate('payout.fixture.requests.length'),1);
    assert.equal((await state()).transaction.currentPhase,'VERIFYING_PAYOUT');assert.equal(await evaluate('payout.fixture.contacts.length'),0);await noFunding();
  });
  for(const status of ['SUCCESSFUL','FAILED'])await t.test(`saved ${status} updates only the captured payout in the actual store`,async()=>{
    await load();await act('payout.unmount()');await act('payout.start();window.stopSavedPayout=payout.verify("polling-payout");payout.clock.advanceBy(5000)');
    await act('payout.replace()');const foreground=(await state()).transaction;
    await act(`payout.fixture.requests.at(-1).resolve('${status}')`);
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    const saved=snapshot.history.find(transaction=>transaction.id==='polling-payout');
    assert.equal(saved.currentPhase,status==='SUCCESSFUL'?'READY_TO_CLAIM':'RECOVERY_REQUIRED');assert.equal(saved.invoicePaid,true);
    assert.equal(await evaluate('payout.clock.pendingCount'),0);assert.equal(await evaluate('payout.fixture.submissions.length'),0);await noFunding();
  });
  await t.test('foreground replacement retires its previous polling owner',async()=>{
    await load();await act('payout.start()');await act('payout.clock.advanceBy(5000)');
    await act('payout.replace()');const foreground=(await state()).transaction;
    await act('payout.fixture.requests[0].resolve("SUCCESSFUL")');assert.deepEqual((await state()).transaction,foreground);
    await act('payout.clock.advanceBy(5000)');assert.equal(await evaluate('payout.fixture.requests.at(-1).id'),'other-payout');
    await act('payout.unmount()');assert.equal(await evaluate('payout.clock.pendingCount'),0);await noFunding();
  });
  await t.test('successful initiation hands polling to the verifying owner and never submits again',async()=>{
    await load();await act('payout.start()');await act('payout.initiate()');
    assert.equal(await evaluate('payout.fixture.submissions.length'),1);assert.equal((await state()).transaction.momoSubmission,'submitting');
    assert.deepEqual(await evaluate('payout.fixture.submissions[0].persistedIntent'),{id:'polling-payout',momoSubmission:'submitting',invoicePaid:true});
    await act('payout.fixture.submissions[0].resolve({success:true,referenceId:"confirmed-reference"})');
    assert.equal((await state()).transaction.currentPhase,'VERIFYING_PAYOUT');assert.deepEqual(await evaluate('payout.clock.delays'),[5000,120000]);
    await act('payout.clock.advanceBy(5000)');await act('payout.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    assert.equal((await state()).transaction.status,'COMPLETED');assert.equal(await evaluate('payout.fixture.submissions.length'),1);await noFunding();
  });
  await t.test('duplicate initiation owners cannot dispatch a second payout',async()=>{
    await load();await act('payout.unmount()');await act('payout.start();payout.initiate();window.stopFirstPayout=payout.begin();window.stopDuplicatePayout=payout.begin()');
    assert.equal(await evaluate('payout.fixture.submissions.length'),1);
    assert.deepEqual(await evaluate('payout.fixture.submissions[0].persistedIntent'),{id:'polling-payout',momoSubmission:'submitting',invoicePaid:true});
    await act('payout.fixture.submissions[0].resolve({success:true,referenceId:"single-reference"})');
    assert.equal(await evaluate('payout.fixture.submissions.length'),1);assert.equal((await state()).transaction.invoicePaid,true);
    await act('stopFirstPayout();stopDuplicatePayout()');await noFunding();
  });
  await t.test('a failed real storage write prevents dispatch and preserves funded recovery',async()=>{
    await load();await act('payout.start()');await act('payout.failIntentPersistence();payout.initiate()');
    assert.equal(await evaluate('payout.fixture.submissions.length'),0);
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal((await state()).transaction.invoicePaid,true);
    assert.match((await state()).error,/Synthetic intent persistence failure/);assert.equal(await evaluate('payout.clock.pendingCount'),0);await noFunding();
  });
  await t.test('lost submission response stays funded and cannot post again after remount',async()=>{
    await load();await act('payout.start()');await act('payout.initiate()');
    await act('payout.fixture.submissions[0].resolve({success:false,submission:"unknown",message:"Synthetic lost response"})');
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal((await state()).transaction.momoSubmission,'submitting');
    await act('payout.unmount()');await act('payout.retryPhase();payout.mount()');
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal((await state()).transaction.status,'PENDING');
    assert.equal((await state()).transaction.invoicePaid,true);assert.equal(await evaluate('payout.fixture.submissions.length'),1);
    assert.equal(await evaluate('payout.clock.pendingCount'),0);await noFunding();
  });
  await t.test('saved funded payout reconciliation preserves unknown outcomes without resubmission',async()=>{
    await load();await act('payout.start()');await act('payout.replace()');const foreground=(await state()).transaction;
    await act('payout.recoveryClock.advanceBy(5000)');
    assert.equal(await evaluate('payout.fixture.requests.at(-1).id'),'polling-payout');
    await act('payout.fixture.requests.at(-1).resolve("UNKNOWN")');
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    const saved=snapshot.history.find(transaction=>transaction.id==='polling-payout');
    assert.equal(saved.status,'PENDING');assert.equal(saved.invoicePaid,true);assert.equal(saved.currentPhase,'RECOVERY_REQUIRED');
    assert.equal(await evaluate('payout.fixture.submissions.length'),0);
    await act('payout.unmount()');assert.equal(await evaluate('payout.recoveryClock.pendingCount'),0);await noFunding();
  });

});
