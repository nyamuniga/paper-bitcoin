import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserFixture, wait } from './browserFixture.mjs';

test('Bitcoin destination entry: supplied values and actions',{timeout:30000},async t=>{
  const {call,evaluate,open}=await createBrowserFixture(t,new URL('./bitcoinDestinationEntry.fixture.tsx',import.meta.url),'#fixture');
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const load=async()=>{await open('');await call('Page.bringToFront');};
  const update=async patch=>{await evaluate(`destinationEntryFixture.setProps(${JSON.stringify(patch)})`);await wait(40);};
  const events=()=>evaluate('destinationEntryFixture.events');
  const click=async(selector,text)=>{
    const point=await evaluate(`(()=>{const e=${text?`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}))`:`document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await wait(40);
  };
  await t.test('paste, clear, typed edits and address book forward explicit actions',async()=>{
    await load();await click('button','Paste');await click('[title="Open Address Book"]');
    await click('textarea');await call('Input.insertText',{text:'someone@example.test'});await wait(40);
    await click('button','Clear');
    assert.deepEqual(await events(),[['paste'],['address-book'],['change','someone@example.test'],['change','']]);
  });
  await t.test('autocomplete uses the shared Bitcoin contact suggestions and forwards the selected value',async()=>{
    await load();await update({value:'Entry fixture'});await wait(60);
    await click('button','Entry fixture contact');
    assert.deepEqual(await events(),[['change','entry@example.test']]);
  });
  await t.test('scanner visibility and page/legacy scan controls are supplied',async()=>{
    await load();await click('[aria-label="Scan Bitcoin payment"]');assert.deepEqual(await events(),[['scan-open']]);
    await update({scannerVisible:true});assert.equal(await evaluate('!!document.querySelector("#supplied-scanner")'),true);
    assert.equal(await evaluate('!!document.querySelector("textarea,.bitcoin-primary")'),false);
    await click('button','Cancel Scanner');assert.deepEqual(await events(),[['scan-open'],['scan-close']]);
    await update({scannerVisible:false,page:false});assert.equal(await evaluate(`!!document.querySelector('[aria-label="Scan Bitcoin payment"]')`),false);
    await click('[title="Scan QR Code"]');assert.deepEqual(await events(),[['scan-open'],['scan-close'],['scan-open']]);
  });
  await t.test('supplied invoice amount and insufficient balance control Pay Invoice',async()=>{
    await load();await update({value:'lnbc1fixture',parsedInput:{type:'lightning',addressOrInvoice:'lnbc1fixture',amountSats:1234}});
    assert.equal(await evaluate('document.body.textContent.includes("Invoice Amount: ₿1,234")'),true);
    await click('.bitcoin-primary');assert.deepEqual(await events(),[['pay']]);
    for(const patch of [{insufficientBalance:true},{insufficientBalance:false,paying:true},{paying:false,value:''}]){
      await update(patch);assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
      await click('.bitcoin-primary');assert.deepEqual(await events(),[['pay']]);
    }
  });
  await t.test('on-chain minimum and Next action use supplied values',async()=>{
    await load();await update({value:'bc1qfixture',parsedInput:{type:'onchain',addressOrInvoice:'bc1qfixture',amountSats:null}});
    assert.equal(await evaluate('document.body.textContent.includes("Min: 3,500 sats")'),true);
    await click('.bitcoin-primary');assert.deepEqual(await events(),[['next']]);
  });
  await t.test('LNURL validation, fetching and invalid destination preserve action guards and labels',async()=>{
    await load();assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    await update({value:'fixture@example.test',lnurlInput:true,lnurlBlocked:true,
      parsedInput:{type:'lnurl-pay',addressOrInvoice:'fixture@example.test',amountSats:null},
      lnurlValidation:{status:'checking',params:null,domain:null,error:null}});
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-primary .animate-spin")'),true);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    await update({lnurlValidation:{status:'invalid',params:null,domain:null,error:'Invalid fixture address'}});
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").textContent.trim()'),'Invalid Address');
    await update({lnurlBlocked:false,lnurlValidation:{status:'valid',params:null,domain:'example.test',error:null}});
    await click('.bitcoin-primary');assert.deepEqual(await events(),[['next']]);
    await update({fetchingInvoice:true});assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    await click('.bitcoin-primary');assert.deepEqual(await events(),[['next']]);
  });
});
