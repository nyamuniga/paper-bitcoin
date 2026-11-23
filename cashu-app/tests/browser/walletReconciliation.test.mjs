import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createBrowserFixture, wait } from './browserFixture.mjs';
const boundaries={name:'independent-wallet-reconciliation',setup(build){
  const path=fileURLToPath(new URL('./walletReconciliation.boundaries.ts',import.meta.url));
  const recoveryPath=fileURLToPath(new URL('./savedMomoRecovery.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^@tauri-apps\/api\/core$|\/((services\/)?(scheduler|momoService|lightningService|sparkService)|store\/(wallet|addressBookStore)|constants\.local)$/},args=>({path:args.path.endsWith('/scheduler')&&args.importer.endsWith('/savedMomoRecoveryAdapter.ts')?recoveryPath:path}));
  build.onResolve({filter:/^@tauri-apps\/plugin-http$/},()=>({path}));
}};
test('Lightning and Spark: independent production lifecycle and manual routing',{timeout:30000},async t=>{
  const {evaluate,open}=await createBrowserFixture(t,new URL('./walletReconciliation.fixture.tsx',import.meta.url),'#fixture',[boundaries]);
  const act=async code=>{await evaluate(code+';true');await wait(50);};
  const load=async()=>{await open('');await wait(60);};
  const count=expression=>evaluate(expression);
  await t.test('a stalled Spark sync cannot prevent Lightning detection or a manual Lightning result',async()=>{
    await load();assert.equal(await count('reconciliation.fixture.spark.length'),1);
    assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning']);
    await act('reconciliation.manual("lightning")');assert.equal(await count('reconciliation.fixture.checks.length'),1);
    await act('reconciliation.fixture.checks[0].resolve("Success")');
    assert.deepEqual(await count('reconciliation.fixture.manualResults'),[{id:'lightning',status:'Success'}]);
    assert.equal(await count('reconciliation.fixture.spark.length'),1);assert.ok(await count('reconciliation.fixture.refreshes')>=1);
  });
  await t.test('new receipts are detected while another native check and Spark are unresolved',async()=>{
    await load();await act('reconciliation.fixture.transactions.push({id:"new",status:"Pending",mint_url:"https://mint.example.test",tx_type:{ReceiveLightning:{}}});reconciliation.clock.advanceBy(2000)');
    assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning','new']);
    await act('reconciliation.fixture.checks[1].resolve("Success")');assert.equal(await count('reconciliation.fixture.refreshes'),1);
  });
  await t.test('manual on-chain recovery joins Spark and then checks its own native receipt',async()=>{
    await load();await act('reconciliation.fixture.transactions.push({id:"chain",status:"Pending",mint_url:"https://chain-mint.example.test",tx_type:{ReceiveOnchain:{}}});reconciliation.manual("chain")');
    assert.equal(await count('reconciliation.fixture.spark.length'),1);assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning']);
    await act('reconciliation.fixture.spark[0].resolve(false)');
    assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning','chain']);
    await act('reconciliation.fixture.checks[1].resolve("Pending")');assert.deepEqual(await count('reconciliation.fixture.manualResults'),[{id:'chain',status:'Pending'}]);
  });
  await t.test('timer and SDK events coalesce and completed Spark work refreshes exactly once',async()=>{
    await load();await act('reconciliation.fixture.emit("newDeposits");reconciliation.fixture.emit("paymentSucceeded");reconciliation.clock.advanceBy(15000)');
    assert.equal(await count('reconciliation.fixture.spark.length'),1);
    await act('reconciliation.fixture.spark[0].resolve(true)');assert.equal(await count('reconciliation.fixture.refreshes'),1);
    await act('reconciliation.fixture.emit("unclaimedDeposits")');assert.equal(await count('reconciliation.fixture.spark.length'),2);
    await act('reconciliation.fixture.spark[1].resolve(false)');assert.equal(await count('reconciliation.fixture.refreshes'),1);
  });
  await t.test('Spark failure leaves Lightning usable and the next Spark trigger can recover',async()=>{
    await load();await act('reconciliation.fixture.spark[0].reject();reconciliation.fixture.checks[0].resolve("Success")');
    assert.equal(await count('reconciliation.fixture.refreshes'),1);await act('reconciliation.fixture.emit("newDeposits")');
    assert.equal(await count('reconciliation.fixture.spark.length'),2);
  });
  await t.test('pending on-chain hints retain their preferred mint on the next reconciliation',async()=>{
    await load();await act('reconciliation.fixture.spark[0].resolve(false)');
    await act('reconciliation.fixture.transactions.push({id:"chain",status:"Pending",mint_url:"https://chain-mint.example.test",tx_type:{ReceiveOnchain:{}}});reconciliation.clock.advanceBy(2000)');
    assert.equal(await count('reconciliation.fixture.spark[1].mint'),'https://chain-mint.example.test');
    assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning']);
    await act('reconciliation.fixture.spark[1].resolve(false)');
    assert.deepEqual(await count('reconciliation.fixture.checks.map(check=>check.id)'),['lightning','chain']);
  });
  await t.test('unmount cancels queued scans, event triggers and late refreshes',async()=>{
    await load();await act('window.queuedWalletCallbacks=reconciliation.clock.callbacks();reconciliation.unmount()');
    const native=await count('reconciliation.fixture.native.length');
    await act('queuedWalletCallbacks.forEach(callback=>callback());reconciliation.fixture.emit("newDeposits");reconciliation.fixture.spark[0].resolve(true);reconciliation.fixture.checks[0].resolve("Success");reconciliation.clock.advanceBy(15000)');
    assert.equal(await count('reconciliation.fixture.native.length'),native);assert.equal(await count('reconciliation.fixture.refreshes'),0);
    assert.equal(await count('reconciliation.clock.pendingCount'),0);assert.equal(await count('reconciliation.fixture.subscriptions===reconciliation.fixture.unsubscriptions'),true);
    assert.equal(await count('reconciliation.fixture.native.some(command=>command==="pay_invoice"||command==="receive_lightning")'),false);
  });
});
