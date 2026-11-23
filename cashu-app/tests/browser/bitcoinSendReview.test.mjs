import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserFixture,wait } from './browserFixture.mjs';

test('Bitcoin send review: supplied values and actions',{timeout:30000},async t=>{
  const {call,evaluate,open}=await createBrowserFixture(t,new URL('./bitcoinSendReview.fixture.tsx',import.meta.url),'#fixture');
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const load=async()=>{await open('');await call('Page.bringToFront');};
  const update=async patch=>{await evaluate(`sendReviewFixture.setProps(${JSON.stringify(patch)})`);await wait(40);};
  const click=async selector=>{
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await wait(40);
  };
  await t.test('renders the exact supplied destination, mint, amount, distinct fees and total',async()=>{
    await load();
    assert.equal(await evaluate('document.querySelector(".bitcoin-review-value").textContent'),'₿3,210');
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".bitcoin-review-details dd")].map(e=>e.textContent.trim())'),[
      'REReview Fixture Mint','bc1q'+'a'.repeat(70),'17 sats','5 sats','9,999 sats',
    ]);
    assert.equal(await evaluate('document.querySelector(".bitcoin-review").getAttribute("aria-label")'),'Review on-chain Bitcoin payment');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  });
  await t.test('zero-valued amounts and fees retain numeric presentation',async()=>{
    await load();await update({amountSats:0,networkFeeSats:0,mintFeeSats:0,totalSats:0});
    assert.equal(await evaluate('document.querySelector(".bitcoin-review-value").textContent'),'₿0');
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".bitcoin-review-row dd")].slice(1).map(e=>e.textContent)'),['0 sats','0 sats','0 sats']);
  });
  await t.test('legacy Back and confirmation forward only their explicit callbacks',async()=>{
    await load();await click('.bitcoin-review > button');await click('.bitcoin-primary');
    assert.deepEqual(await evaluate('sendReviewFixture.events'),['back','confirm']);
  });
  await t.test('page review keeps a single confirmation outside its details and no inline Back',async()=>{
    await load();await update({page:true});
    assert.equal(await evaluate('document.querySelectorAll(".bitcoin-review button").length'),0);
    assert.equal(await evaluate('document.querySelectorAll(".bitcoin-primary").length'),1);
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-actions .bitcoin-primary")'),true);
    await click('.bitcoin-primary');assert.deepEqual(await evaluate('sendReviewFixture.events'),['confirm']);
  });
  await t.test('busy confirmation preserves loading text, spinner and native disabled behavior',async()=>{
    await load();await evaluate('sendReviewFixture.setPaying(true)');await wait(40);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").textContent.trim()'),'Sending On-Chain...');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-primary .animate-spin")'),true);
    await click('.bitcoin-primary');assert.deepEqual(await evaluate('sendReviewFixture.events'),[]);
    await evaluate('sendReviewFixture.setPaying(false)');await wait(40);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").textContent.trim()'),'Confirm & Send');
    await click('.bitcoin-primary');assert.deepEqual(await evaluate('sendReviewFixture.events'),['confirm']);
  });
});
