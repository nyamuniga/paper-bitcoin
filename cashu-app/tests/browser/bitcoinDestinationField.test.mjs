import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries={name:'bitcoin-destination-boundaries',setup(build){
  const path=fileURLToPath(new URL('./bitcoinDestinationField.boundaries.ts',import.meta.url));
  build.onResolve({filter:/^(@yudiel\/react-qr-scanner|react-hot-toast)$/},()=>({path}));
  build.onResolve({filter:/\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard)$/},()=>({path}));
}};
const textarea='.bitcoin-payment-input textarea';
const caption='.bitcoin-payment-input > p,.bitcoin-destination-field > label';
const scan='[aria-label="Scan Bitcoin payment"],button[title="Scan QR Code"]';

test('Bitcoin destination field preserves its page and legacy workflows', {timeout:60000}, async t=>{
  const {call,evaluate,key,open}=await createBrowserFixture(t,new URL('./bitcoinDestinationField.fixture.tsx',import.meta.url),textarea,[boundaries]);
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`});
  const click=async(selector,text)=>{
    const p=await evaluate(`(()=>{const e=${text ? `[...document.querySelectorAll('${selector}')].find(e=>e.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(60);
  };
  const load=async(legacy=false,query='',width=390,height=844)=>{
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await open(`${legacy?'legacy&':''}${query}`);await call('Page.bringToFront');await wait(400);
  };
  const type=async text=>{await click(textarea);await evaluate(`document.querySelector('${textarea}').select()`);await call('Input.insertText',{text});await wait(220);};
  const noPayment=async()=>{
    assert.equal(await evaluate('window.bitcoinFixture.submissions'),0);
    assert.deepEqual(await evaluate('window.bitcoinFixture.receives'),[]);
    assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
  };
  for(const legacy of [false,true])for(const theme of ['dark','light'])for(const [width,height]of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${legacy?'legacy':'page'} ${theme} ${width}x${height} preserves field and toolbar presentation`,async()=>{
      await load(legacy,'theme='+theme,width,height);
      const presentation=await evaluate(`(()=>{const measure=e=>{if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return Object.fromEntries(['fontSize','fontWeight','lineHeight','color','backgroundColor','padding','borderRadius','borderWidth','borderColor','boxShadow','gap'].map(k=>[k,s[k]]).concat([['x',r.x],['y',r.y],['width',r.width],['height',r.height]]))};return {caption:measure(document.querySelector('${caption}')),control:measure(document.querySelector('${textarea}')),shell:measure(document.querySelector('${textarea}').parentElement),book:measure(document.querySelector('[title="Open Address Book"]')),scanner:measure(document.querySelector('${scan}')),action:measure(document.querySelector('.bitcoin-primary'))}})()`);
      assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector('${textarea}');return [e.placeholder,e.rows,e.spellcheck,e.value]})()`),['Lightning, LNURL, or On-Chain...',3,false,'']);
      assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),true);
      if(process.env.BITCOIN_FIELD_COMPARE){
        const name=`${legacy?'legacy':'page'}-${theme}-${width}-${height}`;
        assert.deepEqual(presentation,JSON.parse(await readFile(join(process.env.BITCOIN_FIELD_COMPARE,name+'.json'),'utf8')));
      }
      if(process.env.BITCOIN_FIELD_SNAPSHOT_DIR){
        const name=`${legacy?'legacy':'page'}-${theme}-${width}-${height}`;
        await writeFile(join(process.env.BITCOIN_FIELD_SNAPSHOT_DIR,name+'.json'),JSON.stringify(presentation));
        const s=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(process.env.BITCOIN_FIELD_SNAPSHOT_DIR,name+'.png'),Buffer.from(s.data,'base64'));
      }
      await click(caption);
      assert.equal(await evaluate(`document.activeElement===document.querySelector('${textarea}')`),true);
      assert.equal(await evaluate(`document.querySelector('${textarea}').labels[0].textContent`),'Pay to:');
      await noPayment();
    });
  }
  for(const legacy of [false,true]) {
    for(const scenario of ['','clipboard-onchain','clipboard-empty','clipboard-error'])await t.test(`${legacy?'legacy':'page'} paste ${scenario||'lightning address'} and clear retain behavior`,async()=>{
      await load(legacy,scenario);await click('button','Paste');await wait(220);
      const expected=scenario==='clipboard-onchain'?'bc1q'+'a'.repeat(38):scenario===''?'fixture@example.test':'';
      assert.equal(await evaluate(`document.querySelector('${textarea}').value`),expected);
      assert.equal(await evaluate('window.destinationFixture.reads'),1);
      if(expected){await click('button','Clear');assert.equal(await evaluate(`document.querySelector('${textarea}').value`),'');}
      await noPayment();
    });
    await t.test(`${legacy?'legacy':'page'} keeps contact filtering and selection`,async()=>{
      await load(legacy);await click('[title="Open Address Book"]');
      assert.equal(await evaluate('document.querySelector("h3")?.textContent.trim()'),'Address Book');
      assert.equal(await evaluate('document.body.textContent.includes("Fixture phone contact")'),false);
      const p=await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Fixture Bitcoin contact')),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(220);
      assert.equal(await evaluate(`document.querySelector('${textarea}').value`),'fixture@example.test');
      assert.equal(await evaluate('document.querySelector("h3")===null'),true);await noPayment();
    });
    await t.test(`${legacy?'legacy':'page'} scanner errors, cancel and result handling are unchanged`,async()=>{
      await load(legacy);await click(scan);
      assert.equal(await evaluate('!!document.getElementById("fixture-scanner")'),true);
      await click('#scan-error');assert.deepEqual(await evaluate('window.destinationFixture.errors'),['Synthetic camera failure.']);
      await click('button','Cancel Scanner');assert.equal(await evaluate('document.getElementById("fixture-scanner")===null'),true);
      await click(scan);await click('#scan-result');
      assert.equal(await evaluate(`document.querySelector('${textarea}').value`),'fixture@example.test');
      assert.equal(await evaluate('document.getElementById("fixture-scanner")===null'),true);await noPayment();
    });
    for(const scenario of [
      {text:'not a payment',query:'',message:'Invalid invoice or address',blocked:true},
      {text:'fixture@example.test',query:'validation=checking',message:'Checking fixture@example.test…',blocked:true},
      {text:'fixture@example.test',query:'validation=invalid',message:'Synthetic address validation failure.',blocked:true},
      {text:'fixture@example.test',query:'validation=valid',message:'Valid · example.test',blocked:false},
      {text:'lnbc200u1fixture',query:'',message:'Invoice Amount: ₿20,000 (Insufficient balance)',blocked:true},
      {text:'bc1q'+'a'.repeat(38),query:'',message:'On-Chain Bitcoin Address',blocked:false},
    ])await t.test(`${legacy?'legacy':'page'} ${scenario.query||scenario.text.slice(0,18)} retains validation and guards`,async()=>{
      await load(legacy,scenario.query);await type(scenario.text);
      assert.equal(await evaluate(`document.querySelector('.bitcoin-destination-form').textContent.includes(${JSON.stringify(scenario.message)})`),true);
      assert.equal(await evaluate('document.querySelector(".bitcoin-primary").disabled'),scenario.blocked);
      await noPayment();
    });
  }
  await t.test('FormField associates the visible Pay to label and keeps toolbar keyboard access',async()=>{
    for(const legacy of [false,true]){
      await load(legacy);
      assert.equal(await evaluate('!!document.querySelector(".bitcoin-destination-field.form-field")'),true);
      await click(caption);assert.equal(await evaluate(`document.activeElement===document.querySelector('${textarea}')`),true);
      assert.equal(await evaluate(`(()=>{const e=document.querySelector('${textarea}');return !!e.id&&e.labels.length===1&&e.labels[0].textContent==='Pay to:'})()`),true);
      await key('Tab');assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Paste');
      await key('Tab');assert.equal(await evaluate('document.activeElement.title'),'Open Address Book');await noPayment();
    }
  });
});
