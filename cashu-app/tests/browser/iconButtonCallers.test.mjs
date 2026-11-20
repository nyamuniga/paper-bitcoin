import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = {name: 'icon-caller-boundaries', setup(build) {
  const target = fileURLToPath(new URL('./iconButtonCallers.boundaries.ts', import.meta.url));
  build.onResolve({filter: /^react-hot-toast$/}, () => ({path: target}));
  build.onResolve({filter: /\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|hooks\/useUrDecoder|hooks\/useUrEncoder|utils\/clipboard|hooks\/useMintInfo|hooks\/useMints|home\/EcashReceiveInvoice)$/}, () => ({path: target}));
}};
const addressAction = '[title="Open Address Book"]';
const copyAction = view => view === 'mint' ? '[title="Copy Mint URL"]' : '[title="Copy Token"]';

async function setup(t) {
  const browser = await createBrowserFixture(t, new URL('./iconButtonCallers.fixture.tsx', import.meta.url),
    'button[title="Open Address Book"],button[title="Copy Mint URL"],button[title="Copy Token"],button[title="Copy Transaction ID"],button[title="Copy Request ID"]', [boundaries]);
  const {call, evaluate, open} = browser;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`});
  const click = async (selector, text) => {
    const p = await evaluate(`(()=>{const e=${text ? `[...document.querySelectorAll('${selector}')].find(e=>e.textContent.includes(${JSON.stringify(text)}))` : `document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(60);
  };
  const load = async (view, query='', width=390, height=844) => {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await open(`view=${view}&${query}`);await wait(350);
  };
  const assertNoOperations = async () => {
    assert.equal(await evaluate('window.callerFixture.forbidden'),0);
    assert.equal(await evaluate('window.bitcoinFixture.submissions'),0);
    assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
  };
  const presentation = async (selector, name, screenshot) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await wait(220);
    const actual = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e),r=e.getBoundingClientRect();
      return Object.fromEntries(['backgroundColor','color','padding','borderRadius','borderWidth','borderColor','boxShadow','fontSize','lineHeight','opacity','cursor','transitionDuration'].map(k=>[k,s[k]]).concat([['x',r.x],['y',r.y],['width',r.width],['height',r.height]]));})()`);
    if (process.env.ICON_CALLER_SNAPSHOT_DIR) {
      await writeFile(join(process.env.ICON_CALLER_SNAPSHOT_DIR,name+'.json'),JSON.stringify(actual));
      if(screenshot) {const s=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(process.env.ICON_CALLER_SNAPSHOT_DIR,name+'.png'),Buffer.from(s.data,'base64'));}
    }
    return actual;
  };
  return {...browser, click, load, assertNoOperations, presentation};
}

test('Address-book callers preserve selection and presentation', {timeout:60000}, async t => {
  const {evaluate,key,click,load,assertNoOperations,presentation}=await setup(t);
  for(const view of ['scan','bitcoin']) for(const theme of ['dark','light']) for(const [width,height]of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${view} ${theme} ${width}x${height} selects the same Bitcoin contact`,async()=>{
      await load(view,'theme='+theme,width,height);
      const actual=await presentation(addressAction,`${view}-${theme}-${width}-${height}`,width===390&&height===844);
      assert.equal(actual.width,29.75);assert.equal(actual.height,29.75);
      assert.equal(actual.padding,'6.375px');assert.equal(actual.borderRadius,'8.5px');
      await click(addressAction);
      assert.equal(await evaluate('document.querySelector("h3")?.textContent.trim()'),'Address Book');
      assert.equal(await evaluate('document.body.textContent.includes("Fixture phone contact")'),false);
      await click('button','Fixture Bitcoin contact');
      assert.equal(await evaluate('document.querySelector("h3")===null'),true);
      assert.equal(await evaluate(`document.querySelector('textarea').value`),'fixture@example.test');
      assert.deepEqual(await evaluate('window.callerFixture.writes'),[]);await assertNoOperations();
    });
  }
  for(const view of ['scan','bitcoin']) await t.test(`${view} keyboard action keeps the page focus treatment`,async()=>{
    await load(view);await evaluate('document.querySelector("textarea").focus()');await key('Tab');await key('Tab');await wait(220);
    assert.equal(await evaluate(`document.activeElement===document.querySelector('${addressAction}')`),true);
    assert.deepEqual(await evaluate(`(()=>{const s=getComputedStyle(document.activeElement);return [s.outlineWidth,s.outlineOffset,s.outlineColor]})()`),['2px','3px','rgb(242, 169, 59)']);
    await key('Enter');assert.equal(await evaluate('document.querySelector("h3")?.textContent.trim()'),'Address Book');
    await click('button','Fixture Bitcoin contact');await assertNoOperations();
  });
  await t.test('both address-book callers use the shared named native button',async()=>{
    for(const view of ['scan','bitcoin']) {
      await load(view);
      assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector('${addressAction}');return [e.type,e.getAttribute('aria-label'),e.classList.contains('icon-button')]})()`),['button','Open Address Book',true]);
    }
  });
});

test('Copy callers preserve payloads, feedback and presentation', {timeout:60000}, async t => {
  const {evaluate,key,click,load,assertNoOperations,presentation}=await setup(t);
  const assertSharedAction = async (selector, label) => {
    assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return [e.type,e.getAttribute('aria-label'),e.classList.contains('icon-button')]})()`),['button',label,true]);
  };
  for(const view of ['mint','transaction']) for(const theme of ['dark','light']) for(const [width,height]of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${view} ${theme} ${width}x${height} copies the original payload`,async()=>{
      await load(view,'theme='+theme,width,height);
      const selector=copyAction(view),actual=await presentation(selector,`${view}-${theme}-${width}-${height}`,width===390&&height===844);
      await assertSharedAction(selector,view==='mint'?'Copy Mint URL':'Copy Token');
      assert.equal(actual.width,33);assert.equal(actual.height,33);assert.equal(actual.padding,'8.5px');assert.equal(actual.borderRadius,'12.75px');
      await click(selector);
      assert.deepEqual(await evaluate('window.callerFixture.writes'),[view==='mint'?'https://mint-1.example.test':'cashuAfixture-only-not-spendable']);
      assert.deepEqual(await evaluate('window.callerFixture.successes'),[view==='mint'?'Mint URL copied!':'Token copied!']);
      assert.equal(await evaluate(`!!document.querySelector('${selector} .lucide-check')`),true);
      assert.equal(await evaluate('window.callerFixture.closes'),0);await assertNoOperations();
    });
  }
  for(const view of ['mint','transaction']) await t.test(`${view} retains keyboard activation and the two-second feedback reset`,async()=>{
    await load(view);const selector=copyAction(view);
    await evaluate(`document.querySelector('${selector}').focus()`);await key('Enter');
    assert.equal(await evaluate(`!!document.querySelector('${selector} .lucide-check')`),true);
    await wait(1600);assert.equal(await evaluate(`!!document.querySelector('${selector} .lucide-check')`),true);
    await wait(550);assert.equal(await evaluate(`!!document.querySelector('${selector} .lucide-copy')`),true);
    await assertNoOperations();
  });
  for(const view of ['mint','transaction']) for(const failure of ['copy-error','copy-false']) await t.test(`${view} ${failure} keeps the existing handler result`,async()=>{
    await load(view,failure);await click(copyAction(view));
    assert.deepEqual(await evaluate('window.callerFixture.errors'),failure==='copy-error'?['Failed to copy']:[]);
    assert.equal(await evaluate(`!!document.querySelector('${copyAction(view)} .lucide-check')`),failure==='copy-false');
    await assertNoOperations();
  });
  for(const scenario of [
    {kind:'',title:'Copy Transaction ID',value:'fixture-transaction-id',message:'Transaction ID copied'},
    {kind:'request',title:'Copy Request ID',value:'fixture-request-id',message:'Request ID copied'},
    {kind:'quote',title:'Copy',value:'fixture-quote-id',message:'Quote ID copied'},
    {kind:'invoice',title:'Copy',value:'lnbc1fixture-invoice',message:'Invoice copied'},
    {kind:'onchain',title:'Copy TxID',value:'fixture-chain-id',message:'TxID copied'},
    {kind:'onchain',title:'Copy Address',value:'bc1qfixture-address',message:'Address copied'},
  ]) await t.test(`${scenario.kind||'send'} ${scenario.title} retains its payload and toast`,async()=>{
    await load('transaction','kind='+scenario.kind);await click(`[title="${scenario.title}"]`);
    await assertSharedAction(`[title="${scenario.title}"]`,scenario.title==='Copy'?(scenario.kind==='invoice'?'Copy Invoice':'Copy Quote ID'):scenario.title);
    assert.deepEqual(await evaluate('window.callerFixture.writes'),[scenario.value]);
    assert.deepEqual(await evaluate('window.callerFixture.successes'),[scenario.message]);await assertNoOperations();
  });
});
