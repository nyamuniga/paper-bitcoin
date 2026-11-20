import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = {name: 'conversion-ui-boundaries', setup(build) {
  build.onResolve({filter: /\/(store\/wallet|store\/currencyStore|hooks\/useReviewQuoteRefresh|services\/stableBalanceService|shared\/SovereignStampOverlay)$/}, () => ({
    path: fileURLToPath(new URL('./conversionPrimaryAction.boundaries.ts', import.meta.url)),
  }));
}};

test('Conversion primary action preserves its presentation and workflow guards', {timeout: 60000}, async t => {
  const {call, evaluate, key, open} = await createBrowserFixture(t,
    new URL('./conversionPrimaryAction.fixture.tsx', import.meta.url), '.transfer-primary', [boundaries]);
  // Freeze countdown text for before/after screenshots; no production clocks change.
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `Date.now=()=>1800000000000;window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`});
  const click = async selector => {
    const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', {type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1});
    await call('Input.dispatchMouseEvent', {type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1});await wait(60);
  };
  const state = () => evaluate(`(()=>{const b=document.querySelector('.transfer-primary');return {label:b.textContent,disabled:b.disabled,icons:b.querySelectorAll('svg').length,calls:window.conversionFixture.calls}})()`);
  const finish = async stage => {await evaluate(`window.conversionFixture.finish(${JSON.stringify(stage)})`);await wait(60);};
  const screenshot = async name => {
    if (!process.env.CONVERSION_ACTION_SNAPSHOT_DIR) return;
    await wait(220);
    const s = await call('Page.captureScreenshot', {format: 'png'});
    await writeFile(join(process.env.CONVERSION_ACTION_SNAPSHOT_DIR, name+'.png'), Buffer.from(s.data,'base64'));
  };
  const selectAmount = () => click('.transfer-percentages button:nth-child(1)');
  for (const toSats of [false,true]) for (const theme of ['dark','light']) for (const [width,height] of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${toSats ? 'to-sats' : 'to-usd'} ${theme} ${width}x${height} entry through completion`, async () => {
      await call('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<600});
      await open(`theme=${theme}${toSats?'&to-sats':''}`);await selectAmount();
      assert.deepEqual(await state(), {label:'Review transfer',disabled:false,icons:1,calls:[]});
      const style=await evaluate(`(()=>{const b=document.querySelector('.transfer-primary'),s=getComputedStyle(b);return {background:s.backgroundColor,color:s.color,radius:s.borderRadius,font:s.fontSize,weight:s.fontWeight,height:s.minHeight,padding:s.padding}})()`);
      assert.deepEqual(style,{background:'rgb(242, 169, 59)',color:'rgb(6, 17, 12)',radius:'16px',font:height<520?'13px':'15px',weight:'600',height:height<520?'32px':'44px',padding:height<520?'6px 8px':'12px 18px'});
      const name=`${toSats?'to-sats':'to-usd'}-${theme}-${width}-${height}`;
      await screenshot(name+'-entry');await click('.transfer-primary');
      assert.deepEqual(await state(),{label:'Getting rate and fees…',disabled:true,icons:1,calls:['quote']});
      await click('.transfer-primary');assert.equal((await state()).calls.length,1);
      await finish('quoted');assert.deepEqual(await state(),{label:'Confirm transfer',disabled:false,icons:0,calls:['quote']});
      await screenshot(name+'-review');
      await evaluate(`document.querySelector('.transfer-primary').focus()`);await key('Enter');await key('Enter');
      assert.deepEqual(await state(),{label:'Transferring…',disabled:true,icons:1,calls:['quote','execute']});
      await finish('complete');
      assert.equal((await state()).label,'Back to wallet');await click('.transfer-primary');
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').type`),'button');
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').getAttribute('aria-busy')`),null);
      assert.equal(await evaluate('window.conversionFixture.dones'),1);
      assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
    });
  }
  for (const toSats of [false,true]) for (const query of ['','no-mint','no-rate','zero-balance','below-minimum',...(toSats?['no-balance']:[])]) {
    await t.test(`${toSats?'dollar':'bitcoin'} entry ${query||'empty'} blocks invalid review`, async () => {
      await open(`${query}${toSats?'&to-sats':''}`);
      if (query && query!=='zero-balance' && query!=='no-balance') {
        if(query==='below-minimum') {await click('#transfer-amount');await call('Input.insertText',{text:'100'});await wait(60);}
        else await selectAmount();
      }
      assert.equal((await state()).disabled,true);await click('.transfer-primary');assert.deepEqual((await state()).calls,[]);
    });
  }
  for (const scenario of [
    {query:'stage=quoted&expired',label:'Review expired'},
    {query:'stage=quoted&live-review&refreshing',label:'Updating rate…'},
    {query:'stage=quoted&live-review&refresh-error',label:'Confirm transfer'},
  ]) await t.test(`${scenario.query} retains the confirmation guard`, async () => {
    await open(scenario.query);assert.equal((await state()).label,scenario.label);assert.equal((await state()).disabled,true);
    await click('.transfer-primary');assert.deepEqual((await state()).calls,[]);
  });
  for (const [stage,label,call] of [['returnQuoted','Confirm return','return'],['funded','Continue transfer','execute'],['funding','Check progress','check']]) {
    await t.test(`${stage} uses the original callback and blocks repeated activation`, async () => {
      await open('stage='+stage);assert.equal((await state()).label,label);await click('.transfer-primary');await click('.transfer-primary');
      assert.deepEqual((await state()).calls,[call]);assert.equal((await state()).disabled,true);
      assert.equal((await state()).label,stage==='returnQuoted'?'Transferring…':'Checking…');
      await finish('complete');
    });
  }
  await t.test('editing a review returns to entry without executing', async () => {
    await open('stage=quoted');await click('.transfer-actions .transfer-secondary');
    assert.equal((await state()).label,'Review transfer');assert.deepEqual((await state()).calls,['cancel']);
  });
  await t.test('rate-limit cooldown keeps the review action disabled', async () => {
    await open('rate-limit');await selectAmount();await click('.transfer-primary');
    assert.equal((await state()).label,'Try again in 30s');assert.equal((await state()).disabled,true);
    await click('.transfer-primary');assert.deepEqual((await state()).calls,['quote']);
  });
  await t.test('review keeps keyboard focus styling and secondary button dimensions', async () => {
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await open('stage=quoted');
    await evaluate(`document.querySelector('.transfer-page-header button').focus()`);await key('Tab');
    assert.equal(await evaluate('document.activeElement.tagName'),'SUMMARY');
    await key('Tab');
    assert.equal(await evaluate(`document.activeElement.matches('.transfer-primary:focus-visible')`),true);
    assert.deepEqual(await evaluate(`(()=>{const s=getComputedStyle(document.activeElement);return [s.outlineWidth,s.outlineOffset,s.outlineColor]})()`),['2px','4px','rgb(242, 169, 59)']);
    assert.deepEqual(await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.transfer-secondary'));return [s.minHeight,s.borderRadius,s.padding,s.fontSize,s.fontWeight]})()`),['52px','26px','14px 18px','15px','600']);
    assert.deepEqual((await state()).calls,[]);
  });
  await t.test('all loading phases expose the shared busy state', async () => {
    for(const query of ['', 'stage=quoted', 'stage=returnQuoted', 'stage=funded', 'stage=funding', 'stage=quoted&live-review&refreshing']) {
      await open(query);if(!query)await selectAmount();if(!query.includes('refreshing'))await click('.transfer-primary');
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').type`),'button');
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').getAttribute('aria-busy')`),'true');
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').getAttribute('aria-label')===document.querySelector('.transfer-primary').textContent`),true);
      assert.equal(await evaluate(`document.querySelector('.transfer-primary').classList.contains('primary-action-button')`),true);
    }
  });
});
