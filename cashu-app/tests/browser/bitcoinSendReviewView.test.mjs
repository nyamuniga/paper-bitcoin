import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries={name:'synthetic-bitcoin-review-boundaries',setup(build){
  const path=fileURLToPath(new URL('./bitcoinSendReview.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^(@yudiel\/react-qr-scanner|react-hot-toast)$/},()=>({path}));
  build.onResolve({filter:/\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard)$/},()=>({path}));
}};
test('Bitcoin send review: actual page and legacy view',{timeout:60000},async t=>{
  const {call,evaluate,open}=await createBrowserFixture(t,new URL('./bitcoinSendReviewView.fixture.tsx',import.meta.url),'.bitcoin-primary',[boundaries]);
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const click=async(selector,text)=>{
    const point=await evaluate(`(()=>{const e=${text?`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`:`document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await wait(80);
  };
  const load=async(legacy=false,theme='dark',width=390,height=844)=>{
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await open(`${legacy?'legacy&':''}theme=${theme}`);await call('Page.bringToFront');await wait(400);
    await click('.bitcoin-primary','Review On-Chain Send');await wait(250);
  };
  for(const legacy of [false,true])for(const theme of ['dark','light'])for(const [width,height] of [[390,844],[1024,844],[390,480]])await t.test(`${legacy?'legacy':'page'} ${theme} ${width}x${height} preserves review and confirmation placement`,async()=>{
    await load(legacy,theme,width,height);
    const record=await evaluate(`(()=>{const measure=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,color:s.color,background:s.backgroundColor,padding:s.padding,font:s.font,border:s.border,shadow:s.boxShadow,gap:s.gap}};return {review:measure(document.querySelector('.bitcoin-review')),value:measure(document.querySelector('.bitcoin-review-value')),details:[...document.querySelectorAll('.bitcoin-review-details > div')].map(measure),action:measure(document.querySelector('.bitcoin-primary')),footer:measure(document.querySelector('.bitcoin-actions')),text:document.querySelector('.bitcoin-review').textContent.replace(/\\s+/g,' ').trim(),inside:!!document.querySelector('.bitcoin-review .bitcoin-primary')}})()`);
    assert.equal(record.inside,legacy);
    assert.match(record.text,/₿3,000/);assert.match(record.text,/Fixture Mint 1/);
    assert.match(record.text,/Network & bridge fee17 sats/);assert.match(record.text,/Lightning & mint fee5 sats/);assert.match(record.text,/Total deducted3,022 sats/);
    assert.match(record.text,/bc1qa{38}/);assert.equal(await evaluate('document.querySelectorAll(".bitcoin-primary").length'),1);
    const name=`${legacy?'legacy':'page'}-${theme}-${width}-${height}`;
    if(process.env.BITCOIN_REVIEW_COMPARE)assert.deepEqual(record,JSON.parse(await readFile(join(process.env.BITCOIN_REVIEW_COMPARE,name+'.json'),'utf8')));
    if(process.env.BITCOIN_REVIEW_SNAPSHOT_DIR){
      await writeFile(join(process.env.BITCOIN_REVIEW_SNAPSHOT_DIR,name+'.json'),JSON.stringify(record));
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await wait(250);
      const screenshot=await call('Page.captureScreenshot',{format:'png'});
      await writeFile(join(process.env.BITCOIN_REVIEW_SNAPSHOT_DIR,name+'.png'),Buffer.from(screenshot.data,'base64'));
    }
    assert.deepEqual(await evaluate('reviewFixture.executions'),[]);
  });
  for(const legacy of [false,true])await t.test(`${legacy?'legacy':'page'} Back restores amount and confirm forwards the reviewed values`,async()=>{
    await load(legacy);
    if(legacy)await click('button','Back to amount');else await click('[aria-label="Go back"]');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-send-amount-form")'),true);
    await click('.bitcoin-primary','Review On-Chain Send');await click('.bitcoin-primary','Confirm & Send');
    assert.deepEqual(await evaluate('reviewFixture.executions'),[{destination:'bc1q'+'a'.repeat(38),estimate:{amount:3000,total_cost:3022,cashu_fee:5,ark_fee:17,bridging_invoice:'synthetic-review-only'}}]);
  });
});
