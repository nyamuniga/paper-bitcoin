import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createBrowserFixture,wait} from './browserFixture.mjs';
const boundaries={name:'deferred-send-boundaries',setup(build){
  const path=fileURLToPath(new URL('./bitcoinSendLifecycle.boundaries.ts',import.meta.url));
  build.initialOptions.define={'import.meta.env':'{}'};
  build.onResolve({filter:/^(@yudiel\/react-qr-scanner|react-hot-toast)$/},()=>({path}));
  build.onResolve({filter:/\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard|components\/shared\/SovereignStampOverlay)$/},()=>({path}));
}};
async function setup(t,view=false,adapter=false){
  const adapterBoundaries={name:'real-send-adapter-boundaries',setup(build){
    const path=fileURLToPath(new URL('./bitcoinSendLifecycle.boundaries.ts',import.meta.url));
    build.onResolve({filter:/^@tauri-apps\/api\/core$|^react-hot-toast$|\/(store\/wallet|services\/sparkService)$/},()=>({path}));
  }};
  const browser=await createBrowserFixture(t,new URL(adapter?'./bitcoinSendAdapter.fixture.tsx':view?'./bitcoinSendLifecycleView.fixture.tsx':'./bitcoinSendLifecycle.fixture.tsx',import.meta.url),'#fixture',adapter?[adapterBoundaries]:view?[boundaries]:[]);
  const {evaluate,call,open}=browser;
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const load=async(query='')=>{await open(query);await call('Page.bringToFront');await wait(60);};
  const act=async(code)=>{await evaluate(code+';true');await wait(40);};
  const click=async(text)=>{await act(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);};
  return{...browser,load,act,click};
}
test('Bitcoin send lifecycle: actual view',{timeout:30000},async t=>{
  const {evaluate,load,act,click}=await setup(t,true);
  await t.test('double confirmation dispatches one approved estimate and never creates an early failure',async()=>{
    await load();await click('Review On-Chain Send');await act('sendFixture.estimates[0].resolve()');
    await act('document.querySelector(".bitcoin-primary").click();document.querySelector(".bitcoin-primary").click()');
    assert.equal(await evaluate('sendFixture.executions.length'),1);
    assert.equal(await evaluate('!!document.querySelector("[data-send-status]")'),false);
    await act('sendFixture.executions[0].resolve()');assert.equal(await evaluate('document.querySelector("[data-send-status]").dataset.sendStatus'),'success');
  });
  await t.test('failure Go back keeps confirmation usable without allowing a rapid repeat',async()=>{
    await load();await click('Review On-Chain Send');await act('sendFixture.estimates[0].resolve()');
    await click('Confirm & Send');await act('sendFixture.executions[0].empty()');
    await click('Dismiss fixture payment');await act('document.querySelector(".bitcoin-primary").click();document.querySelector(".bitcoin-primary").click()');
    assert.equal(await evaluate('sendFixture.executions.length'),2);
  });
  await t.test('navigation during LNURL invoice creation cannot dispatch a later payment',async()=>{
    await load('lnurl');await click('Next');await click('Pay Lightning');
    await act('navigateAway()');assert.equal(await evaluate('document.body.textContent.trim()'),'Other route');
    await act('sendFixture.invoices[0].resolve()');assert.equal(await evaluate('sendFixture.payments.length'),0);
  });
});

test('Bitcoin send lifecycle: preparation and context',{timeout:45000},async t=>{
  const {evaluate,load,act}=await setup(t);
  const state=()=>evaluate('sendLifecycle.snapshot()');
  await t.test('duplicate estimation dispatches once and accepts an immutable review snapshot',async()=>{
    await load('onchain');await act('sendLifecycle.actions.nextAmount();sendLifecycle.actions.nextAmount()');
    assert.equal(await evaluate('sendLifecycle.fixture.estimates.length'),1);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.estimates[0].args'),['bc1q'+'a'.repeat(38),3000,'mint-one']);
    await act('sendLifecycle.fixture.estimates[0].resolve()');assert.equal((await state()).step,'confirm');assert.equal((await state()).estimate.total_cost,3022);
  });
  for(const change of ["sendLifecycle.actions.changeAmount('4000')","sendLifecycle.actions.changeDestination('bc1q'+'b'.repeat(38))",'sendLifecycle.actions.back()','sendLifecycle.actions.cancel()','sendLifecycle.actions.reset()',"sendHost.setMint('mint-two')",'sendHost.setActive(false)'])await t.test(`${change} retires a pending estimate without releasing its dispatch guard early`,async()=>{
    await load('onchain');await act('sendLifecycle.actions.nextAmount()');await act(change);
    await act('sendLifecycle.actions.nextAmount()');assert.equal(await evaluate('sendLifecycle.fixture.estimates.length'),1);
    await act('sendLifecycle.fixture.estimates[0].resolve()');assert.equal((await state()).estimate,null);assert.notEqual((await state()).step,'confirm');
    await act('sendLifecycle.actions.confirm()');assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),0);
  });
  await t.test('retired estimate errors are silent, nulls release the lock and current errors permit a new estimate',async()=>{
    await load('onchain');await act('sendLifecycle.actions.nextAmount();sendLifecycle.actions.cancel();sendLifecycle.fixture.estimates[0].reject()');
    assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),[]);
    await act('sendLifecycle.actions.nextAmount();sendLifecycle.fixture.estimates[1].empty()');assert.equal((await state()).estimating,false);
    await act('sendLifecycle.actions.nextAmount();sendLifecycle.fixture.estimates[2].reject()');assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),['Synthetic send failure']);
    await act('sendLifecycle.actions.nextAmount();sendLifecycle.fixture.estimates[3].resolve()');assert.equal((await state()).step,'confirm');
  });
  await t.test('inactive, busy, empty, insufficient and out-of-limit entries cannot prepare or pay',async()=>{
    await load('onchain');await act('sendHost.setActive(false)');await act('sendLifecycle.actions.nextAmount()');
    await act('sendHost.setActive(true);sendHost.setBusy(true)');await act('sendLifecycle.actions.nextAmount()');
    await act('sendHost.setBusy(false);sendLifecycle.actions.changeAmount("");sendLifecycle.actions.nextAmount()');
    await act('sendLifecycle.actions.changeAmount("2000");sendLifecycle.actions.nextAmount()');
    await act('sendLifecycle.actions.changeAmount("10001");sendLifecycle.actions.nextAmount()');
    await act('sendHost.setBalance(200000000)');await act('sendLifecycle.actions.changeAmount("100000001");sendLifecycle.actions.nextAmount()');
    assert.equal(await evaluate('sendLifecycle.fixture.estimates.length'),0);assert.equal(await evaluate('sendLifecycle.fixture.payments.length'),0);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),['Minimum on-chain send is 2,500 sats','Insufficient balance to send this amount','Maximum on-chain send is 100,000,000 sats']);
  });
});

test('Bitcoin send lifecycle: submission and retry',{timeout:45000},async t=>{
  const {evaluate,load,act}=await setup(t);
  const state=()=>evaluate('sendLifecycle.snapshot()');
  const review=async()=>{await load('onchain');await act('sendLifecycle.actions.nextAmount();sendLifecycle.fixture.estimates[0].resolve()');};
  await t.test('double confirmation and post-success confirmation/retry submit only once',async()=>{
    await review();await act('sendLifecycle.actions.confirm();sendLifecycle.actions.confirm()');
    assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),1);assert.equal((await state()).payment.status,null);
    await act('sendLifecycle.fixture.executions[0].resolve()');assert.equal((await state()).payment.status,'success');assert.equal((await state()).payment.txid,'synthetic-txid');
    await act('sendLifecycle.actions.dismissPayment();sendLifecycle.actions.confirm();sendLifecycle.actions.retry()');
    assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),1);assert.deepEqual(await evaluate('sendLifecycle.fixture.uses'),[['onchain','bc1q'+'a'.repeat(38)]]);
  });
  await t.test('failed submission requires explicit retry, which holds the same synchronous guard',async()=>{
    await review();await act('sendLifecycle.actions.confirm();sendLifecycle.fixture.executions[0].empty()');
    assert.equal((await state()).payment.status,'failed');await act('sendLifecycle.actions.confirm()');assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),1);
    await act('sendLifecycle.actions.retry();sendLifecycle.actions.retry()');assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),2);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.executions[0].args'),await evaluate('sendLifecycle.fixture.executions[1].args'));
    await act('sendLifecycle.fixture.executions[1].resolve()');assert.equal((await state()).payment.status,'success');
  });
  await t.test('dismissing a reported failure leaves the existing confirmation action usable',async()=>{
    await review();await act('sendLifecycle.actions.confirm();sendLifecycle.fixture.executions[0].empty()');
    await act('sendLifecycle.actions.dismissPayment();sendLifecycle.actions.confirm();sendLifecycle.actions.confirm()');
    assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),2);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.executions[0].args'),await evaluate('sendLifecycle.fixture.executions[1].args'));
  });
  await t.test('mint change retires payment UI while durable success records the captured destination',async()=>{
    await review();await act('sendLifecycle.actions.confirm()');await act('sendHost.setMint("mint-two")');
    await act('sendLifecycle.actions.nextAmount()');assert.equal(await evaluate('sendLifecycle.fixture.estimates.length'),1);
    await act('sendLifecycle.fixture.executions[0].resolve()');assert.equal((await state()).payment.status,null);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.uses'),[['onchain','bc1q'+'a'.repeat(38)]]);
    await act('sendLifecycle.actions.nextAmount()');assert.equal(await evaluate('sendLifecycle.fixture.estimates[1].args[2]'),'mint-two');
  });
  await t.test('Lightning success cannot be paid again; failure retries keep the captured invoice and mint',async()=>{
    await load();await act('sendLifecycle.actions.payLightning();sendLifecycle.actions.payLightning()');assert.equal(await evaluate('sendLifecycle.fixture.payments.length'),1);
    await act('sendLifecycle.fixture.payments[0].empty()');assert.equal((await state()).payment.status,'failed');
    await act('sendLifecycle.actions.retry();sendLifecycle.actions.retry();sendLifecycle.fixture.payments[1].resolve()');assert.equal((await state()).payment.status,'success');
    assert.deepEqual(await evaluate('sendLifecycle.fixture.payments.map(p=>p.args)'),[['lnbc30u1fixture','mint-one'],['lnbc30u1fixture','mint-one']]);
    await act('sendLifecycle.actions.payLightning();sendLifecycle.actions.retry()');assert.equal(await evaluate('sendLifecycle.fixture.payments.length'),2);
  });
  await t.test('contact bookkeeping failure cannot turn a completed payment into failure',async()=>{
    await review();await act('sendLifecycle.fixture.throwContact=true;sendLifecycle.actions.confirm();sendLifecycle.fixture.executions[0].resolve()');
    assert.equal((await state()).payment.status,'success');assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),1);
  });
  await t.test('unmount makes late completion/error inert and never starts another dispatch',async()=>{
    for(const finish of ['resolve','reject']){
      await review();await act('sendLifecycle.actions.confirm();sendHost.unmount()');await act(`sendLifecycle.fixture.executions[0].${finish}()`);
      await act('sendLifecycle.actions.confirm();sendLifecycle.actions.retry()');assert.equal(await evaluate('sendLifecycle.fixture.executions.length'),1);
      assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),[]);
    }
  });
});

test('Bitcoin send lifecycle: LNURL preparation',{timeout:45000},async t=>{
  const {evaluate,load,act}=await setup(t);
  const state=()=>evaluate('sendLifecycle.snapshot()');
  await t.test('cached validated params skip resolution and one invoice request uses millisats',async()=>{
    await load('lnurl');await act('sendLifecycle.actions.nextInput()');assert.equal((await state()).step,'amount');assert.equal(await evaluate('sendLifecycle.fixture.resolutions.length'),0);
    await act('sendLifecycle.actions.nextAmount();sendLifecycle.actions.nextAmount()');assert.deepEqual(await evaluate('sendLifecycle.fixture.invoices[0].args'),['https://lnurl.example.test',3000000]);
    await act('sendLifecycle.fixture.invoices[0].resolve()');assert.deepEqual(await evaluate('sendLifecycle.fixture.payments[0].args'),['lnbc1synthetic','mint-one']);
    await act('sendLifecycle.fixture.payments[0].resolve()');assert.equal((await state()).payment.status,'success');assert.deepEqual(await evaluate('sendLifecycle.fixture.uses'),[['lightning','fixture@example.test']]);
  });
  for(const change of ['sendLifecycle.actions.back()','sendLifecycle.actions.cancel()',"sendLifecycle.actions.changeAmount('4000')","sendLifecycle.actions.changeDestination('other@example.test')","sendHost.setMint('mint-two')",'sendHost.setActive(false)','sendHost.unmount()'])await t.test(`${change} prevents payment after a late invoice`,async()=>{
    await load('lnurl');await act('sendLifecycle.actions.nextInput()');await act('sendLifecycle.actions.nextAmount()');await act(change);
    await act('sendLifecycle.fixture.invoices[0].resolve()');assert.equal(await evaluate('sendLifecycle.fixture.payments.length'),0);
    assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),[]);
  });
  await t.test('a same-turn destination edit cannot reuse validation for the previous address',async()=>{
    await load('lnurl');await act('sendLifecycle.actions.changeDestination("other@example.test");sendLifecycle.actions.nextInput()');
    assert.equal(await evaluate('sendLifecycle.fixture.resolutions.length'),1);
    assert.equal((await state()).step,'input');
  });
  await t.test('deferred resolution rejects stale transitions and applies a current fixed amount',async()=>{
    await load('lnurl');await act('sendHost.setValidation({status:"idle",params:null,domain:null,error:null})');
    await act('sendLifecycle.actions.nextInput();sendLifecycle.actions.nextInput()');assert.equal(await evaluate('sendLifecycle.fixture.resolutions.length'),1);
    await act('sendLifecycle.actions.changeDestination("other@example.test");sendLifecycle.fixture.resolutions[0].resolve()');assert.equal((await state()).step,'input');
    await act('sendLifecycle.actions.nextInput();sendLifecycle.fixture.resolutions[1].resolve({params:{callback:"https://fixed.example.test",minSendable:5000000,maxSendable:5000000,metadata:"[]",tag:"payRequest"},error:null})');
    assert.equal((await state()).step,'amount');assert.equal((await state()).amount,'5000');
  });
  await t.test('invoice failure releases the guard and only explicit retry starts another request',async()=>{
    await load('lnurl');await act('sendLifecycle.actions.nextInput()');await act('sendLifecycle.actions.nextAmount();sendLifecycle.fixture.invoices[0].reject()');
    assert.equal((await state()).payment.status,'failed');assert.equal((await state()).fetching,false);
    await act('sendLifecycle.actions.nextAmount()');assert.equal(await evaluate('sendLifecycle.fixture.invoices.length'),1);
    await act('sendLifecycle.actions.retry();sendLifecycle.actions.retry()');assert.equal(await evaluate('sendLifecycle.fixture.invoices.length'),2);
  });
});


test('Bitcoin send lifecycle: real adapter error scoping and payloads',{timeout:45000},async t=>{
  const {evaluate,load,act}=await setup(t,false,true);
  const quote={amount:3000,ark_fee:17,cashu_fee:5,total_cost:3022,bridging_invoice:'synthetic-send-only'};
  await t.test('default estimate and execution callers retain their existing errors and refreshes',async()=>{
    await load();await act('sendAdapter.bitcoin.estimateOnChain("bc1qfixture",3000)');await act('sendAdapter.fixture.estimates[0].reject()');
    assert.match(await evaluate('sendAdapter.fixture.errors[0]'),/^Estimation failed:/);
    await act(`sendAdapter.bitcoin.executeOnChain(${JSON.stringify(quote)},"bc1qfixture")`);await act('sendAdapter.fixture.executions[0].reject()');
    assert.match(await evaluate('sendAdapter.fixture.errors[1]'),/^On-Chain send failed:/);assert.equal(await evaluate('sendAdapter.fixture.refreshes'),1);
  });
  await t.test('retired estimate errors are silent; current errors report once and release the native guard',async()=>{
    await load();await act('sendAdapter.send.nextAmount();sendAdapter.send.cancel()');await act('sendAdapter.fixture.estimates[0].reject()');
    assert.deepEqual(await evaluate('sendAdapter.fixture.errors'),[]);
    await act('sendAdapter.send.nextAmount()');await act('sendAdapter.fixture.estimates[1].reject()');assert.equal(await evaluate('sendAdapter.fixture.errors.length'),1);
    await act('sendAdapter.send.nextAmount()');await act('sendAdapter.fixture.estimates[2].resolve()');assert.equal(await evaluate('sendAdapter.send.step'),'confirm');
  });
  for(const retired of [false,true])await t.test(`${retired?'retired':'current'} execution errors preserve refresh and scoped notification`,async()=>{
    await load();await act('sendAdapter.send.nextAmount()');await act('sendAdapter.fixture.estimates[0].resolve()');
    await act('sendAdapter.send.confirm();sendAdapter.send.confirm()');assert.equal(await evaluate('sendAdapter.fixture.executions.length'),1);
    assert.deepEqual(await evaluate('sendAdapter.fixture.executions[0].args'),['synthetic-send-only','bc1q'+'a'.repeat(38),3000,'mint-one',17]);
    if(retired)await act('sendAdapter.send.cancel()');await act('sendAdapter.fixture.executions[0].reject()');
    assert.equal(await evaluate('sendAdapter.fixture.errors.length'),retired?0:1);assert.equal(await evaluate('sendAdapter.fixture.refreshes'),1);
    assert.equal(await evaluate('sendAdapter.send.payment.status'),retired?null:'failed');
  });
  await t.test('successful execution refreshes once, reports success and cannot be confirmed again',async()=>{
    await load();await act('sendAdapter.send.nextAmount()');await act('sendAdapter.fixture.estimates[0].resolve()');
    await act('sendAdapter.send.confirm();sendAdapter.send.confirm()');await act('sendAdapter.fixture.executions[0].resolve()');
    assert.equal(await evaluate('sendAdapter.fixture.refreshes'),1);assert.equal(await evaluate('sendAdapter.send.payment.status'),'success');
    await act('sendAdapter.send.confirm();sendAdapter.send.retry()');assert.equal(await evaluate('sendAdapter.fixture.executions.length'),1);
  });
});


test('Bitcoin send lifecycle: clipboard preparation',{timeout:30000},async t=>{
  const {evaluate,load,act}=await setup(t);
  await t.test('current paste trims text and an edit retires an older clipboard result',async()=>{
    await load();await act('sendLifecycle.actions.changeDestination("");sendLifecycle.actions.paste()');
    await act('sendLifecycle.fixture.pastes[0].resolve()');assert.equal(await evaluate('sendLifecycle.snapshot().destination'),'fixture@example.test');
    await act('sendLifecycle.actions.paste();sendLifecycle.actions.changeDestination("other@example.test")');
    await act('sendLifecycle.fixture.pastes[1].resolve()');assert.equal(await evaluate('sendLifecycle.snapshot().destination'),'other@example.test');
  });
  await t.test('overlapping pastes belong to the latest request and navigation retires them',async()=>{
    await load();await act('sendLifecycle.actions.paste();sendLifecycle.actions.paste()');
    await act('sendLifecycle.fixture.pastes[1].resolve("second@example.test");sendLifecycle.fixture.pastes[0].resolve("first@example.test")');
    assert.equal(await evaluate('sendLifecycle.snapshot().destination'),'second@example.test');
    await act('sendLifecycle.actions.paste();sendHost.unmount()');await act('sendLifecycle.fixture.pastes[2].resolve()');
    assert.deepEqual(await evaluate('sendLifecycle.fixture.errors'),[]);
  });
});
