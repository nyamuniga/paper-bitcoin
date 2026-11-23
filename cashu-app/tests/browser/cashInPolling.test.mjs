import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createBrowserFixture, wait } from './browserFixture.mjs';
const boundaries={name:'cash-in-clock-and-provider-boundaries',setup(build){
  const path=fileURLToPath(new URL('./cashInPolling.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^@tauri-apps\/api\/core$|\/((services\/)?(scheduler|momoService|lightningService|sparkService)|store\/wallet|constants\.local)$/},()=>({path}));
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
});
