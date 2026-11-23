import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = { name: 'saved-transfer-external-boundaries', setup(build) {
  build.initialOptions.define = { 'import.meta.env': '{}' };
  const path = fileURLToPath(new URL('./momoSavedTransfers.boundaries.ts', import.meta.url));
  build.onResolve({ filter: /\/(store\/wallet|services\/(flowServices|proxyBalanceService)|components\/shared\/SovereignStampOverlay)$/ }, () => ({ path }));
} };
async function setup(t) {
  const browser = await createBrowserFixture(t, new URL('./momoSavedTransfers.fixture.tsx', import.meta.url), '#fixture', [boundaries]);
  const { call, evaluate, open } = browser;
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  const load = async (query = '', width = 390, height = 844) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await open(query); await call('Page.bringToFront');
  };
  const click = async selector => {
    const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 }); await wait(40);
  };
  const snapshot = () => evaluate('savedTransferFixture.snapshot()');
  return { ...browser, load, click, snapshot };
}

test('saved Mobile Money list preserves presentation and disclosure', { timeout: 45000 }, async t => {
  const { evaluate, call, load, click, snapshot } = await setup(t);
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
    await t.test(`${theme} ${width}×${height}`, async () => {
      await load(`theme=${theme}`, width, height);
      assert.equal(await evaluate('document.querySelector(".momo-saved-transfers").open'), false);
      assert.equal(await evaluate('document.querySelector("summary").textContent'), 'Saved transfers (2)');
      await click('summary');
      assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".momo-saved-transfers button")).map(b=>[b.type,b.textContent.replace(/\\s+/g," ").trim()])'), [['button','Top-up · 1,000 RWFView'],['button','Cashout · 2,500 RWFView']]);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await wait(200);
      const record = await evaluate(`Array.from(document.querySelector('.momo-page-actions').querySelectorAll('*')).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,text:e.childElementCount?null:e.textContent,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','padding','font','color','backgroundColor','overflow','border','outline','outlineOffset'].map(k=>[k,s[k]]))}})`);
      const name = `${theme}-${width}-${height}`;
      if (process.env.MOMO_SAVED_CAPTURE) { await mkdir(process.env.MOMO_SAVED_CAPTURE,{recursive:true}); await writeFile(join(process.env.MOMO_SAVED_CAPTURE,name+'.json'),JSON.stringify(record)); }
      if (process.env.MOMO_SAVED_COMPARE) assert.deepEqual(record,JSON.parse(await readFile(join(process.env.MOMO_SAVED_COMPARE,name+'.json'),'utf8')));
      if (process.env.MOMO_SAVED_IMAGES) { await mkdir(process.env.MOMO_SAVED_IMAGES,{recursive:true}); const {data}=await call('Page.captureScreenshot',{format:'png'}); await writeFile(join(process.env.MOMO_SAVED_IMAGES,name+'.png'),Buffer.from(data,'base64')); }
      assert.equal((await snapshot()).activeTransaction, null);
      assert.equal(await evaluate('savedTransferFixture.fixtureCalls.submissions'), 0);
    });
  }
  await t.test('empty history and review keep the saved list hidden', async () => {
    for (const query of ['empty','review','cashout&review']) { await load(query); assert.equal(await evaluate('!!document.querySelector(".momo-saved-transfers")'),false); }
  });
});

test('saved Mobile Money rows delegate IDs to the real store safely', { timeout: 45000 }, async t => {
  const { evaluate, load, click, key, snapshot } = await setup(t);
  for (const [position, id] of [[1,'saved-topup'],[2,'saved-cashout']]) for (const keyboard of [false,true]) {
    await t.test(`${id} ${keyboard?'keyboard':'pointer'} selects only that record`, async () => {
      await load('cashout'); const before = await snapshot();
      if (keyboard) {
        await evaluate('document.querySelector("summary").focus();true'); await key('Enter');
        for (let index=0;index<position;index++) await key('Tab');
        await key('Enter');
      } else { await click('summary'); await click(`.momo-saved-transfers button:nth-child(${position})`); }
      const after = await snapshot();
      assert.equal(after.activeTransaction.id,id); assert.deepEqual(after.history,before.history);
      assert.deepEqual(await evaluate('savedTransferFixture.selections'),[id]);
      assert.equal(await evaluate('savedTransferFixture.fixtureCalls.submissions'),0);
    });
  }
  await t.test('history reorder keeps disclosure open and rows select by stable ID', async () => {
    await load(); await click('summary'); await evaluate('savedTransferFixture.reverse()'); await wait(30);
    assert.equal(await evaluate('document.querySelector("details").open'),true);
    await click('.momo-saved-transfers button');
    assert.equal((await snapshot()).activeTransaction.id,'saved-cashout');
  });
  await t.test('a foreground transfer starting while the list is open cannot be replaced', async () => {
    await load(); await click('summary'); await evaluate('savedTransferFixture.startForeground()'); await wait(30);
    const before = await snapshot();
    // The form harness intentionally keeps the list mounted to exercise a late selection.
    await click('.momo-saved-transfers button:nth-child(2)');
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(await evaluate('savedTransferFixture.selections'),['saved-cashout']);
    assert.deepEqual(await evaluate('savedTransferFixture.resumed'),[]);
    assert.equal(await evaluate('savedTransferFixture.fixtureCalls.submissions'),0);
  });
  for (const [position,id] of [[1,'saved-topup'],[2,'saved-cashout']]) await t.test(`actual page resumes ${id} without altering the other record`, async () => {
    await load('page'); const before=await snapshot(); await click('summary'); await click(`.momo-saved-transfers button:nth-child(${position})`);
    const after=await snapshot(); assert.equal(after.activeTransaction.id,id); assert.deepEqual(after.history,before.history);
    assert.equal(await evaluate('!!document.querySelector(".momo-payment-form")'),false);
    assert.equal(await evaluate('savedTransferFixture.fixtureCalls.submissions'),0);
  });
});
