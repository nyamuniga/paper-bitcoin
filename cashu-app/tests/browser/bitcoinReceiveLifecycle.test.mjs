import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createBrowserFixture,wait } from './browserFixture.mjs';

const boundaries={name:'deferred-bitcoin-receive-boundaries',setup(build){
  build.initialOptions.define={'import.meta.env':'{}'};
  const path=fileURLToPath(new URL('./bitcoinReceiveLifecycle.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^(@yudiel\/react-qr-scanner|react-hot-toast)$/},()=>({path}));
  build.onResolve({filter:/\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard|components\/shared\/SovereignStampOverlay)$/},()=>({path}));
}};
async function setup(t,view=false,adapter=false){
  const adapterBoundaries={name:'real-receive-adapter-boundaries',setup(build){
    const path=fileURLToPath(new URL('./bitcoinReceiveLifecycle.boundaries.ts',import.meta.url));
    build.onResolve({filter:/^@tauri-apps\/api\/core$|^react-hot-toast$|\/(store\/wallet|services\/sparkService)$/},()=>({path}));
  }};
  const browser=await createBrowserFixture(t,new URL(adapter?'./bitcoinReceiveAdapter.fixture.tsx':view?'./bitcoinReceiveLifecycleView.fixture.tsx':'./bitcoinReceiveLifecycle.fixture.tsx',import.meta.url),'#fixture',adapter?[adapterBoundaries]:view?[boundaries]:[]);
  const {call,evaluate,open}=browser;
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const load=async(query='')=>{await open(query);await call('Page.bringToFront');await wait(40);};
  const act=async code=>{await evaluate(code+';true');await wait(30);};
  const state=()=>evaluate('lifecycle.snapshot()');
  const events=()=>evaluate('lifecycle.fixture.events');
  const click=async(selector,text)=>{
    const p=await evaluate(`(()=>{const e=${text?`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`:`document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(40);
  };
  return{...browser,load,act,state,events,click};
}

test('Bitcoin receive lifecycle: requests',{timeout:45000},async t=>{
  const {evaluate,load,act,state}=await setup(t);
  await t.test('duplicate clicks dispatch once and current results retain their captured amount/mint',async()=>{
    await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request();lifecycle.actions.request()");
    assert.equal(await evaluate('lifecycle.fixture.requests.length'),1);assert.equal((await state()).requesting,true);
    await act('lifecycle.fixture.requests[0].resolve()');assert.equal((await state()).invoice,'lnbc1fixture0');assert.equal((await state()).quoteId,'quote-0');
  });
  for(const change of ["changeAmount('4000')","changeMode('onchain')",'cancel()','reset()'])await t.test(`${change} rejects the pending result and releases its guard after settlement`,async()=>{
    await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request()");await act('lifecycle.actions.'+change);
    await act('lifecycle.actions.request()');assert.equal(await evaluate('lifecycle.fixture.requests.length'),1);
    await act('lifecycle.fixture.requests[0].resolve()');
    assert.equal((await state()).invoice,null);assert.equal((await state()).address,null);assert.equal((await state()).quoteId,null);assert.equal((await state()).requesting,false);
    await act("lifecycle.actions.changeAmount('4000');lifecycle.actions.request();lifecycle.fixture.requests[1].resolve()");
    assert.equal((await state()).quoteId,'quote-1');
  });
  await t.test('on-chain results, nulls and rejection preserve zero fee and permit retries',async()=>{
    await load();await act("lifecycle.actions.changeMode('onchain');lifecycle.actions.changeAmount('3000');lifecycle.actions.request();lifecycle.fixture.requests[0].resolve()");
    assert.equal((await state()).address,'bc1qfixture0');assert.equal((await state()).fee,0);assert.equal((await state()).deposit,3000);
    await act('lifecycle.actions.cancel();lifecycle.actions.request();lifecycle.fixture.requests[1].empty()');assert.equal((await state()).address,null);
    await act('lifecycle.actions.request();lifecycle.fixture.requests[2].reject()');assert.equal((await state()).requesting,false);
    assert.deepEqual(await evaluate('lifecycle.fixture.events'),[['request-error']]);
  });
  await t.test('inactive, busy, empty and out-of-limit entry cannot dispatch',async()=>{
    await load();await act('lifecycle.actions.request()');
    await act("lifecycle.actions.changeMode('onchain');lifecycle.actions.changeAmount('2000');lifecycle.actions.request()");
    await act("lifecycle.actions.changeAmount('100000001');lifecycle.actions.request()");
    await act("lifecycle.actions.changeAmount('3000');lifecycleHost.setBusy(true)");await act('lifecycle.actions.request()');
    await act('lifecycleHost.setBusy(false);lifecycleHost.setActive(false)');await act('lifecycle.actions.request()');
    assert.equal(await evaluate('lifecycle.fixture.requests.length'),0);
  });
});

test('Bitcoin receive adapter: lifecycle owns late error reporting',{timeout:45000},async t=>{
  const {evaluate,load,act}=await setup(t,false,true);
  for(const mode of ['lightning','onchain']){
    const method=mode==='lightning'?'receiveLightning':'receiveOnChain';
    const prefix=mode==='lightning'?'Failed to create invoice:':'Failed to get Bitcoin deposit address:';
    await t.test(`${mode} default adapter callers keep their existing error toast`,async()=>{
      await load();await act(`adapterFixture.bitcoin.${method}(3000,'mint-one')`);
      await act('adapterFixture.fixture.requests[0].reject()');
      assert.equal(await evaluate('adapterFixture.fixture.errors.length'),1);
      assert.equal(await evaluate(`adapterFixture.fixture.errors[0].startsWith(${JSON.stringify(prefix)})`),true);
    });
    await t.test(`${mode} retired lifecycle errors do not show a global toast`,async()=>{
      await load();await act(`adapterFixture.receive.changeMode('${mode}');adapterFixture.receive.changeAmount('3000');adapterFixture.receive.request();adapterFixture.receive.cancel()`);
      await act('adapterFixture.fixture.requests[0].reject()');
      assert.deepEqual(await evaluate('adapterFixture.fixture.errors'),[]);
    });
    await t.test(`${mode} current lifecycle errors report once and leave the adapter reusable`,async()=>{
      await load();await act(`adapterFixture.receive.changeMode('${mode}');adapterFixture.receive.changeAmount('3000');adapterFixture.receive.request()`);
      await act('adapterFixture.fixture.requests[0].reject()');
      assert.equal(await evaluate('adapterFixture.fixture.errors.length'),1);
      await act('adapterFixture.receive.request();adapterFixture.fixture.requests[1].resolve()');
      assert.equal(await evaluate('adapterFixture.fixture.events.filter(e=>e[0]==="wallet-refresh").length'),1);
      assert.equal(await evaluate('document.getElementById("fixture").textContent'),mode==='lightning'?'lnbc1fixture1':'bc1qfixture1');
    });
  }
});

test('Bitcoin receive lifecycle: context and settlement',{timeout:45000},async t=>{
  const {evaluate,load,act,state,events}=await setup(t);
  for(const change of ["lifecycleHost.setMint('mint-two')",'lifecycleHost.setActive(false)'])await t.test(`${change} retires pending outputs and matching history`,async()=>{
    await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request()");await act(change);
    await act("lifecycle.fixture.requests[0].resolve();lifecycleHost.history('quote-0')");
    assert.equal((await state()).invoice,null);assert.equal((await state()).success,false);assert.deepEqual(await events(),[]);
  });
  await t.test('only the accepted quote celebrates, once per generation, using its captured amount',async()=>{
    await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request();lifecycle.fixture.requests[0].resolve();lifecycleHost.history('other')");assert.deepEqual(await events(),[]);
    await act("lifecycleHost.history('quote-0')");await act("lifecycleHost.history('quote-0')");assert.deepEqual(await events(),[['received',3000]]);
    await act("lifecycle.actions.cancel();lifecycleHost.history('quote-0')");assert.equal((await state()).success,false);
    await act("lifecycle.actions.changeAmount('4000');lifecycle.actions.request();lifecycle.fixture.requests[1].resolve();lifecycleHost.history('quote-1')");
    assert.deepEqual(await events(),[['received',3000],['received',4000]]);
  });
  await t.test('unmount makes late success/rejection inert under StrictMode',async()=>{
    for(const finish of ['resolve','reject']){
      await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request();lifecycleHost.unmount()");
      await act(`lifecycle.fixture.requests[0].${finish}()`);assert.deepEqual(await events(),[]);
    }
  });
});

test('Bitcoin receive lifecycle: copy feedback',{timeout:45000},async t=>{
  const {load,act,state,events}=await setup(t);
  const invoice=async()=>{await load();await act("lifecycle.actions.changeAmount('3000');lifecycle.actions.request();lifecycle.fixture.requests[0].resolve();lifecycle.fixture.deferCopies=true");};
  await t.test('retired copy completions and failures do not notify the new session',async()=>{
    for(const finish of ['resolve','reject']){
      await invoice();await act("lifecycle.actions.copy('lnbc1fixture0');lifecycle.actions.cancel()");await act(`lifecycle.fixture.copyWaiters[0].${finish}()`);
      assert.equal((await state()).copied,false);assert.deepEqual(await events(),[]);
    }
  });
  await t.test('overlapping copy feedback belongs only to the latest copy',async()=>{
    await invoice();await act("lifecycle.actions.copy('one','uri');lifecycle.actions.copy('two','address')");
    await act('lifecycle.fixture.copyWaiters[1].resolve();lifecycle.fixture.copyWaiters[0].resolve()');
    assert.equal((await state()).copiedType,'address');assert.deepEqual(await events(),[['copied','address']]);
    await wait(2100);assert.equal((await state()).copied,false);assert.equal((await state()).copiedType,null);
  });
  await t.test('copy error and unmount cleanup do not leave feedback timers',async()=>{
    await invoice();await act("lifecycle.actions.copy('invoice');lifecycle.fixture.copyWaiters[0].reject()");assert.deepEqual(await events(),[['copy-error']]);
    await act("lifecycle.actions.copy('invoice');lifecycleHost.unmount()");
    await act('lifecycle.fixture.copyWaiters[1].resolve()');assert.deepEqual(await events(),[['copy-error']]);
  });
});

test('Bitcoin receive lifecycle view: stale outputs and navigation',{timeout:45000},async t=>{
  const {evaluate,load,act,click}=await setup(t,true);
  const request=async()=>{for(const digit of ['3','0','0','0'])await click('.bitcoin-keypad button',digit);await click('.bitcoin-primary','Create Invoice');await act('receiveLifecycleFixture.requests[0].resolve()');};
  await t.test('Back retires the old quote so its later settlement cannot reopen success',async()=>{
    await load();await request();await click('button','Back');await act("receiveLifecycleFixture.history('quote-0')");
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'),true);
    assert.equal(await evaluate('!!document.querySelector("[data-fixture-stamp]")'),false);
  });
  await t.test('legacy mint selection retires an accepted address without a hidden request',async()=>{
    await load('legacy');await wait(400);await click('.bitcoin-receive-mode button','On-Chain');
    for(const digit of ['3','0','0','0'])await click('.bitcoin-keypad button',digit);
    await click('.bitcoin-primary','Get Bitcoin Address');await act('receiveLifecycleFixture.requests[0].resolve()');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'),false);
    await click('[aria-label="Choose mint"]');await click('[aria-label="Available mints"] button:nth-child(2)');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'),true);
    assert.equal(await evaluate('receiveLifecycleFixture.requests.length'),1);
    await wait(300);await click('.bitcoin-primary','Get Bitcoin Address');
    assert.equal(await evaluate('receiveLifecycleFixture.requests[1]?.mint'),'https://mint-2.example.test');
  });
  await t.test('navigation rejects late receive output and clipboard notifications',async()=>{
    await load();for(const digit of ['3','0','0','0'])await click('.bitcoin-keypad button',digit);await click('.bitcoin-primary','Create Invoice');
    await act('navigateAway()');assert.equal(await evaluate('document.body.textContent.trim()'),'Other route');
    await act('receiveLifecycleFixture.requests[0].resolve()');
    await load();await request();await act('receiveLifecycleFixture.deferCopies=true');await click('button','Copy Invoice');
    await act('navigateAway()');assert.equal(await evaluate('document.body.textContent.trim()'),'Other route');
    await act('receiveLifecycleFixture.copyWaiters[0].resolve()');
    assert.deepEqual(await evaluate('receiveLifecycleFixture.events'),[]);
  });
});
