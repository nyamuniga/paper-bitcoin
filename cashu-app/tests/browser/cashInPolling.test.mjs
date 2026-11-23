import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createBrowserFixture, wait } from './browserFixture.mjs';
const boundaries={name:'cash-in-clock-and-provider-boundaries',setup(build){
  const path=fileURLToPath(new URL('./cashInPolling.boundaries.ts',import.meta.url));
  const recoveryPath=fileURLToPath(new URL('./savedMomoRecovery.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^@tauri-apps\/api\/core$|\/((services\/)?(scheduler|momoService|lightningService|sparkService)|store\/wallet|constants\.local)$/},args=>({path:args.path.endsWith('/scheduler')&&args.importer.endsWith('/savedMomoRecoveryAdapter.ts')?recoveryPath:path}));
  build.onResolve({filter:/^@tauri-apps\/plugin-http$/},()=>({path}));
}};
test('cash-in polling: real processor and store lifecycle',{timeout:30000},async t=>{
  const {evaluate,open}=await createBrowserFixture(t,new URL('./cashInPolling.fixture.tsx',import.meta.url),'#fixture',[boundaries]);
  const act=async code=>{await evaluate(code+';true');await wait(40);};
  const load=async()=>{await open('');await wait(40);};
  const state=()=>evaluate('polling.snapshot()');
  const noFunding=async()=>assert.equal(await evaluate('polling.fixture.native.some(call=>call.command==="pay_invoice"||call.command==="receive_lightning")'),false);
  await t.test('phase replacement retires its initial request and the active owner polls to completion',async()=>{
    await load();await act('polling.start()');
    assert.ok(await evaluate('polling.fixture.requests.length')>=2);
    await act('polling.fixture.requests.slice(0,-1).forEach(request=>request.resolve("SUCCESSFUL"))');
    assert.equal((await state()).transaction.currentPhase,'VERIFYING_PAYMENT');
    assert.equal(await evaluate('polling.clock.pendingCount'),0);
    await act('polling.fixture.requests.at(-1).resolve("PENDING")');assert.deepEqual(await evaluate('polling.clock.delays'),[5000,120000]);
    const count=await evaluate('polling.fixture.requests.length');
    await act('polling.clock.advanceBy(4999)');assert.equal(await evaluate('polling.fixture.requests.length'),count);
    await act('polling.clock.advanceBy(1)');assert.equal(await evaluate('polling.fixture.requests.length'),count+1);
    await act('polling.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    assert.equal((await state()).transaction.status,'COMPLETED');assert.equal(await evaluate('polling.clock.pendingCount'),0);
    assert.equal(await evaluate('polling.fixture.native.filter(call=>call.command==="check_transaction_status").length'),1);await noFunding();
  });
  await t.test('unmount while the first request is pending prevents later timers or fulfillment',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT")');await act('polling.unmount()');
    await act('polling.fixture.requests.forEach(request=>request.resolve("SUCCESSFUL"))');
    assert.equal(await evaluate('polling.clock.pendingCount'),0);assert.equal((await state()).transaction.currentPhase,'VERIFYING_PAYMENT');
    assert.equal(await evaluate('polling.fixture.subscriptions===polling.fixture.unsubscriptions'),true);await noFunding();
  });
  await t.test('unmount cancels scheduled poll/deadline callbacks, including already queued work',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT")');await act('polling.fixture.requests.at(-1).resolve("PENDING")');
    assert.equal(await evaluate('polling.clock.pendingCount'),2);
    const count=await evaluate('polling.fixture.requests.length');
    await act('window.queuedPollingCallbacks=polling.clock.callbacks();polling.unmount()');
    assert.equal(await evaluate('polling.clock.pendingCount'),0);
    await act('queuedPollingCallbacks.forEach(callback=>callback());polling.clock.advanceBy(120000)');
    assert.equal(await evaluate('polling.fixture.requests.length'),count);assert.equal((await state()).transaction.currentPhase,'VERIFYING_PAYMENT');await noFunding();
  });
  await t.test('deadline keeps recovery pending and a late poll cannot complete it',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT")');await act('polling.fixture.requests.at(-1).resolve("PENDING")');
    await act('polling.clock.advanceBy(5000)');await act('polling.clock.advanceBy(115000)');
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal((await state()).transaction.status,'PENDING');
    await act('polling.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal(await evaluate('polling.clock.pendingCount'),0);await noFunding();
  });
  for(const status of ['SUCCESSFUL','FAILED'])await t.test(`saved ${status} is written by ID without changing the actual foreground store`,async()=>{
    await load();await act('polling.unmount()');await act('polling.start("VERIFYING_PAYMENT");window.stopSelectedVerification=polling.verify("polling-topup")');
    await act('polling.replace()');const foreground=(await state()).transaction;
    await act(`polling.fixture.requests.at(-1).resolve('${status}')`);
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    const target=snapshot.history.find(transaction=>transaction.id==='polling-topup');
    assert.equal(target.status,status==='SUCCESSFUL'?'COMPLETED':'FAILED');
    if(status==='SUCCESSFUL')assert.deepEqual(await evaluate('polling.fixture.native.filter(call=>call.command==="check_transaction_status").map(call=>call.args)'),[{txId:'synthetic-quote'}]);
    else assert.equal(target.recoveryMessage,'Your payment failed or was rejected.');
    assert.equal(await evaluate('polling.clock.pendingCount'),0);await noFunding();
  });
  await t.test('saved polling and deadline keep the captured ID and preserve foreground errors',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("VERIFYING_PAYMENT");window.stopSelectedVerification=polling.verify("polling-topup")');
    await act('polling.fixture.requests.at(-1).resolve("PENDING");polling.replace()');const foreground=(await state()).transaction;
    await act('polling.clock.advanceBy(5000)');assert.equal(await evaluate('polling.fixture.requests.at(-1).id'),'polling-topup');
    await act('polling.clock.advanceBy(115000)');await act('polling.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    assert.equal(snapshot.history.find(transaction=>transaction.id==='polling-topup').currentPhase,'RECOVERY_REQUIRED');
    assert.equal(await evaluate('polling.clock.pendingCount'),0);await noFunding();
  });
  await t.test('the real adapter scopes writes and error updates and ignores missing IDs',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("VERIFYING_PAYMENT");polling.replace()');
    const foreground=(await state()).transaction;
    await act('polling.transactions.setErrorFor("polling-topup","Old error");polling.transactions.updateById("polling-topup",{recoveryMessage:"Saved note"});polling.transactions.updateById("missing",{status:"FAILED"})');
    let snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    assert.equal(snapshot.history.find(transaction=>transaction.id==='polling-topup').recoveryMessage,'Saved note');
    assert.equal(await evaluate('polling.transactions.findById("missing")===undefined'),true);
    await act('polling.transactions.setErrorFor("other-topup","Current error")');snapshot=await state();assert.equal(snapshot.error,'Current error');
  });
  await t.test('a removed ID cannot be resurrected or fulfill the new foreground',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("VERIFYING_PAYMENT");window.stopSelectedVerification=polling.verify("polling-topup");polling.replace();polling.remove("polling-topup")');
    const foreground=(await state()).transaction;await act('polling.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    assert.equal(snapshot.history.some(transaction=>transaction.id==='polling-topup'),false);
    assert.equal(await evaluate('polling.fixture.native.some(call=>call.command==="check_transaction_status")'),false);
    assert.equal(await evaluate('polling.clock.pendingCount'),0);await noFunding();
  });
  await t.test('processor replacement starts the new ID and retires the prior response',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT")');
    const old=await evaluate('polling.fixture.requests.length-1');await act('polling.replace()');
    assert.equal(await evaluate('polling.fixture.requests.at(-1).id'),'other-topup');
    const foreground=(await state()).transaction;await act(`polling.fixture.requests[${old}].resolve('SUCCESSFUL')`);
    assert.deepEqual((await state()).transaction,foreground);assert.equal((await state()).error,'Other transfer error');
    assert.equal(await evaluate('polling.fixture.native.some(call=>call.command==="check_transaction_status")'),false);
    await act('polling.unmount()');assert.equal(await evaluate('polling.clock.pendingCount'),0);await noFunding();
  });

  await t.test('fulfillment preflight failure preserves saved recovery and cannot pay another foreground transfer',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("RECOVERY_REQUIRED");polling.fixture.controlFulfillment=true;polling.fulfill()');
    await act('polling.replace()');const foreground=(await state()).transaction;
    await act('polling.fixture.mintChecks[0].reject()');
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    assert.equal(snapshot.history.find(tx=>tx.id==='polling-topup').currentPhase,'RECOVERY_REQUIRED');
    assert.equal(await evaluate('polling.fixture.payments.length'),0);await noFunding();
  });
  await t.test('an unknown fulfillment payment recovers, then a claimed quote completes without paying twice',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("RECOVERY_REQUIRED");polling.fixture.controlFulfillment=true;polling.fulfill()');
    await act('polling.fixture.mintChecks[0].resolve("Pending")');
    assert.equal(await evaluate('polling.fixture.payments[0].invoice'),'synthetic-invoice');
    await act('polling.fixture.payments[0].reject()');
    assert.equal((await state()).transaction.currentPhase,'RECOVERY_REQUIRED');assert.equal((await state()).transaction.status,'PENDING');
    await act('polling.fulfill()');await act('polling.fixture.mintChecks[1].resolve("Success")');
    assert.equal((await state()).transaction.status,'COMPLETED');assert.equal(await evaluate('polling.fixture.payments.length'),1);await noFunding();
  });
  await t.test('post-payment mint failure retries its status without paying the invoice again',async()=>{
    await load();await act('polling.unmount()');await act('polling.start("RECOVERY_REQUIRED");polling.fixture.controlFulfillment=true;polling.fulfill()');
    await act('polling.fixture.mintChecks[0].resolve("Pending")');await act('polling.fixture.payments[0].resolve({success:true})');
    const waitForCheck=async count=>{
      for(let attempt=0;attempt<80;attempt++){
        if(await evaluate('polling.fixture.mintChecks.length')>=count)return;
        await wait(50);
      }
      assert.fail('Expected the configured fulfillment retry');
    };
    await waitForCheck(2);await act('polling.fixture.mintChecks[1].reject()');
    assert.equal((await state()).transaction.currentPhase,'FULFILLING');
    await waitForCheck(3);await act('polling.fixture.mintChecks[2].resolve("Success")');
    assert.equal((await state()).transaction.status,'COMPLETED');assert.equal(await evaluate('polling.fixture.payments.length'),1);
    assert.deepEqual(await evaluate('polling.fixture.native.filter(call=>call.command==="check_transaction_status").map(call=>call.args.txId)'),['synthetic-quote','synthetic-quote','synthetic-quote']);await noFunding();
  });

  await t.test('saved reconciliation runs outside React payment decisions and preserves the foreground',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT")');await act('polling.replace()');
    const foreground=(await state()).transaction;
    await act('polling.recoveryClock.advanceBy(5000)');
    assert.equal(await evaluate('polling.fixture.requests.at(-1).id'),'polling-topup');
    await act('polling.fixture.requests.at(-1).resolve("SUCCESSFUL")');
    const snapshot=await state();assert.deepEqual(snapshot.transaction,foreground);assert.equal(snapshot.error,'Other transfer error');
    assert.equal(snapshot.history.find(transaction=>transaction.id==='polling-topup').status,'COMPLETED');
    await act('polling.unmount()');assert.equal(await evaluate('polling.clock.pendingCount'),0);
    assert.equal(await evaluate('polling.recoveryClock.pendingCount'),0);await noFunding();
  });
  await t.test('unmount cancels saved reconciliation even if its callback was already queued',async()=>{
    await load();await act('polling.start("VERIFYING_PAYMENT");window.queuedRecoveryCallbacks=polling.recoveryClock.callbacks()');
    const count=await evaluate('polling.fixture.requests.length');
    await act('polling.unmount()');await act('queuedRecoveryCallbacks.forEach(callback=>callback());polling.recoveryClock.advanceBy(120000)');
    assert.equal(await evaluate('polling.fixture.requests.length'),count);
    assert.equal(await evaluate('polling.recoveryClock.pendingCount'),0);await noFunding();
  });

});
