import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createBrowserFixture,wait } from './browserFixture.mjs';

const callerBoundaries={name:'bitcoin-receive-caller-boundaries',setup(build){
  build.initialOptions.define={'import.meta.env':'{}'};
  const path=fileURLToPath(new URL('./bitcoinPageLayout.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^(@yudiel\/react-qr-scanner|react-hot-toast)$/},()=>({path}));
  build.onResolve({filter:/\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard)$/},()=>({path}));
}};
const qrBoundary={name:'record-receive-qr-with-real-encoder',setup(build){
  const encoder=createRequire(import.meta.url).resolve('react-qr-code');
  build.onResolve({filter:/^react-qr-code$/},()=>({path:'receive-qr',namespace:'receive-qr'}));
  build.onLoad({filter:/.*/,namespace:'receive-qr'},()=>({
    contents:`import React from 'react';import QRCode from ${JSON.stringify(encoder)};export default function QR(props){window.receiveFixture.qr=props.value;return React.createElement(QRCode,props);}`,
    resolveDir:fileURLToPath(new URL('../../',import.meta.url)),
  }));
}};
async function setup(t,caller=false){
  const browser=await createBrowserFixture(t,new URL(caller?'./bitcoinPageLayout.fixture.tsx':'./bitcoinReceive.fixture.tsx',import.meta.url),caller?'#route':'#fixture',caller?[callerBoundaries]:[qrBoundary]);
  const {call,evaluate,open}=browser;
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  const load=async(query='',width=390,height=844)=>{
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
    await open((caller?'receive&':'')+query);await call('Page.bringToFront');await wait(300);
  };
  const click=async(selector,text)=>{
    const p=await evaluate(`(()=>{const e=${text?`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`:`document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(40);
  };
  return{...browser,load,click};
}

for(const mode of ['lightning','onchain'])test(`Bitcoin receive caller: ${mode}`,{timeout:45000},async t=>{
  const {call,evaluate,load,click}=await setup(t,true);
  const capture=async name=>{
    await wait(350);
    const record=await evaluate(`({elements:Array.from(document.querySelector('.bitcoin-flow').querySelectorAll('*')).filter(e=>e instanceof HTMLElement).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,classes:e.className,text:e.childElementCount?null:e.textContent,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','padding','gap','font','backgroundColor','color','border','borderRadius','overflow','outline','outlineOffset'].map(k=>[k,s[k]]))}}),qr:document.querySelector('.bitcoin-flow svg[width="200"]')?.outerHTML??null})`);
    if(process.env.BITCOIN_RECEIVE_CAPTURE){await mkdir(process.env.BITCOIN_RECEIVE_CAPTURE,{recursive:true});await writeFile(join(process.env.BITCOIN_RECEIVE_CAPTURE,name+'.json'),JSON.stringify(record));}
    if(process.env.BITCOIN_RECEIVE_COMPARE)assert.deepEqual(record,JSON.parse(await readFile(join(process.env.BITCOIN_RECEIVE_COMPARE,name+'.json'),'utf8')));
    if(process.env.BITCOIN_RECEIVE_IMAGES){await mkdir(process.env.BITCOIN_RECEIVE_IMAGES,{recursive:true});const{data}=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(process.env.BITCOIN_RECEIVE_IMAGES,name+'.png'),Buffer.from(data,'base64'));}
  };
  for(const theme of ['dark','light'])for(const[width,height]of[[390,844],[1024,844],[390,480]])await t.test(`${theme} ${width}×${height} keeps entry, generated output and Back`,async()=>{
    await load(`theme=${theme}`,width,height);
    if(mode==='onchain')await click('button','On-Chain');
    for(const digit of ['3','0','0','0'])await click('.bitcoin-keypad button',digit);
    const name=`${mode}-${theme}-${width}-${height}`;
    await capture(name+'-entry');
    await click('.bitcoin-primary',mode==='onchain'?'Get Bitcoin Address':'Create Invoice');
    assert.deepEqual(await evaluate('bitcoinFixture.receives'),[{mode,amount:3000,mint:'https://mint-1.example.test'}]);
    assert.equal(await evaluate('!!document.querySelector(\'.bitcoin-flow svg[width="200"]\')'),true);
    await capture(name+'-output');
    await click('button',mode==='onchain'?'Copy URI (For Sparrow)':'Copy Invoice');
    assert.deepEqual(await evaluate('pageFixture.writes'),[mode==='onchain'?'bitcoin:bc1qfixture?amount=0.00003000':'lnbc1fixture']);
    if(mode==='onchain'){
      await click('button','Copy Address Only');
      assert.deepEqual(await evaluate('pageFixture.writes'),['bitcoin:bc1qfixture?amount=0.00003000','bc1qfixture']);
    }
    await click('button','Back');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'),true);
    assert.equal(await evaluate('bitcoinFixture.submissions'),0);
  });
});

test('Bitcoin receive presentation: output values and actions',{timeout:45000},async t=>{
  const {evaluate,load,click}=await setup(t);
  const calls=()=>evaluate('receiveFixture.calls');
  await t.test('invoice QR, clickable text, copy feedback and Back use supplied actions',async()=>{
    await load('state=invoice');assert.equal(await evaluate('receiveFixture.qr'),'lnbc1fixture');
    await click('p.select-all');assert.deepEqual(await calls(),[['copy','lnbc1fixture','text']]);
    assert.equal(await evaluate('document.body.textContent.includes("Copied!")'),true);
    await click('button','Back');assert.deepEqual((await calls()).at(-1),['invoice-back']);
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'),true);
  });
  for(const[deposit,expected]of[['3500','bitcoin:bc1qfixture?amount=0.00003500'],['0','bitcoin:bc1qfixture'],['none','bitcoin:bc1qfixture']])await t.test(`address deposit=${deposit} preserves QR/URI, address-only copy and explorer callback`,async()=>{
    await load(`state=address&deposit=${deposit}`);assert.equal(await evaluate('receiveFixture.qr'),expected);
    assert.equal(await evaluate('document.querySelector("dd").textContent'),'≈ ₿0');
    await click('button','Copy URI (For Sparrow)');assert.deepEqual(await calls(),[['copy',expected,'uri']]);
    await click('button','Copy Address Only');assert.deepEqual((await calls()).at(-1),['copy','bc1qfixture','address']);
    await click('button','Track on Mempool');assert.deepEqual((await calls()).at(-1),['track','bc1qfixture']);
    await click('button','Back');assert.deepEqual((await calls()).at(-1),['address-back']);
  });
  await t.test('unknown fee remains a dash',async()=>{await load('state=address&fee=none');assert.equal(await evaluate('document.querySelector("dd").textContent'),'—');});
  await t.test('success and invoice retain precedence over older output values',async()=>{
    await load('state=success&also-invoice&also-address');assert.equal(await evaluate('document.body.textContent.includes("RECEIVED")'),true);
    assert.equal(await evaluate('receiveFixture.qr'),'');await click('button','Done');assert.deepEqual(await calls(),[['done']]);
    await load('state=invoice&also-address');assert.equal(await evaluate('receiveFixture.qr'),'lnbc1fixture');
    await click('button','Back');assert.equal(await evaluate('receiveFixture.qr'),'bitcoin:bc1qfixture?amount=0.00003500');
  });
});

test('Bitcoin receive presentation: controlled entry',{timeout:45000},async t=>{
  const {evaluate,load,click}=await setup(t);
  await t.test('keypad and mode changes report values; request is a separate supplied action',async()=>{
    await load();assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    await click('.bitcoin-keypad button','3');await click('.bitcoin-keypad button','0');
    await click('.bitcoin-primary');assert.deepEqual(await evaluate('receiveFixture.calls'),[['amount','3'],['amount','30'],['request']]);
    await click('button','On-Chain');assert.deepEqual((await evaluate('receiveFixture.calls')).at(-1),['mode','onchain']);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
  });
  for(const[amount,label]of[['2000','Min Deposit is 2,500 sats'],['100000001','Exceeds 100,000,000 sats limit']])await t.test(`on-chain ${amount} retains supplied guard and limit feedback`,async()=>{
    await load(`mode=onchain&amount=${amount}&disabled`);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").textContent'),label);
    assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-limits")'),true);
  });
  await t.test('requesting leaves keypad/request disabled and renders the existing spinner',async()=>{
    await load('amount=3000&requesting');
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".bitcoin-keypad button,.bitcoin-primary")).every(b=>b.disabled)'),true);
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-primary .animate-spin")'),true);
    await click('.bitcoin-keypad button','1');assert.deepEqual(await evaluate('receiveFixture.calls'),[]);
  });
});
