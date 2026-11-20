import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

test('Mobile Money phone field preserves input, feedback and contact selection', {timeout:60000}, async t => {
  const {call,evaluate,key,open}=await createBrowserFixture(t,new URL('./momoMintPicker.fixture.tsx',import.meta.url),'#momo-page-phone');
  const phone='#momo-page-phone',book='[aria-label="Choose phone number from address book"]';
  const click=async(selector,text)=>{
    const p=await evaluate(`(()=>{const e=${text ? `[...document.querySelectorAll('${selector}')].find(e=>e.textContent.includes(${JSON.stringify(text)}))` : `document.querySelector(${JSON.stringify(selector)})`};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(60);
  };
  const load=async(cashout=false,theme='dark',width=390,height=844)=>{
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await open(`phone-field&theme=${theme}${cashout?'&cashout':''}`);
  };
  const callbacks=()=>evaluate('({review:Number(document.getElementById("review-calls").textContent),confirm:Number(document.getElementById("confirm-calls").textContent),book:Number(document.getElementById("address-book-calls").textContent)})');
  const feedback=()=>evaluate(`({text:document.querySelector('.momo-entry-feedback').textContent,live:document.querySelector('.momo-entry-feedback').getAttribute('aria-live'),alerts:document.querySelectorAll('[role="alert"]').length,invalid:document.querySelector('${phone}').getAttribute('aria-invalid')})`);
  for(const cashout of [false,true])for(const theme of ['dark','light'])for(const [width,height]of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${cashout?'cashout':'top-up'} ${theme} ${width}x${height} preserves native field presentation`,async()=>{
      await load(cashout,theme,width,height);
      assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector('${phone}');return [e.type,e.inputMode,e.autocomplete,e.placeholder,e.value,e.labels.length,e.labels[0].textContent.trim()]})()`),['tel','tel','tel-national','078 or 079…','0780000000',1,cashout?'Recipient phone number':'Phone number']);
      const presentation=await evaluate(`(()=>{const measure=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return Object.fromEntries(['fontSize','fontWeight','color','backgroundColor','padding','marginBottom','borderRadius','borderWidth','borderColor'].map(k=>[k,s[k]]).concat([['x',r.x],['y',r.y],['width',r.width],['height',r.height]]))};return {field:measure(document.querySelector('.momo-phone-field')),label:measure(document.querySelector('.momo-phone-field label')),input:measure(document.querySelector('${phone}')),book:measure(document.querySelector('${book}')),amount:measure(document.querySelector('.momo-page-amount')),action:measure(document.querySelector('.momo-primary'))}})()`);
      if(process.env.MOMO_PHONE_SNAPSHOT_DIR){
        const name=`${cashout?'cashout':'top-up'}-${theme}-${width}-${height}`;
        await writeFile(join(process.env.MOMO_PHONE_SNAPSHOT_DIR,name+'.json'),JSON.stringify(presentation));
        const s=await call('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.MOMO_PHONE_SNAPSHOT_DIR,name+'.png'),Buffer.from(s.data,'base64'));
      }
      await click('.momo-phone-field label');
      assert.equal(await evaluate(`document.activeElement===document.querySelector('${phone}')`),true);
      await key('Tab');assert.equal(await evaluate(`document.activeElement===document.querySelector('${book}')`),true);
      assert.deepEqual(await callbacks(),{review:0,confirm:0,book:0});
    });
  }
  for(const cashout of [false,true]) {
    await t.test(`${cashout?'cashout':'top-up'} retains digit filtering, length limit and Enter-to-blur`,async()=>{
      await load(cashout);await click(phone);await evaluate(`document.querySelector('${phone}').select()`);
      await call('Input.insertText',{text:'079 abc-123 4567 99'});await wait(60);
      assert.equal(await evaluate(`document.querySelector('${phone}').value`),'0791234567');
      await key('Enter');assert.equal(await evaluate(`document.activeElement===document.querySelector('${phone}')`),false);
      assert.deepEqual(await callbacks(),{review:0,confirm:0,book:0});
    });
    await t.test(`${cashout?'cashout':'top-up'} address-book action selects the same phone contact`,async()=>{
      await load(cashout);await click(phone);await key('Tab');await key('Enter');
      assert.equal(await evaluate('document.querySelector("h3")?.textContent.trim()'),'Address Book');
      assert.equal(await evaluate('document.body.textContent.includes("Fixture Bitcoin contact")'),false);
      await click('button','Fixture phone contact');
      assert.equal(await evaluate('document.querySelector("h3")===null'),true);
      assert.equal(await evaluate(`document.querySelector('${phone}').value`),'0791234567');
      assert.deepEqual(await callbacks(),{review:0,confirm:0,book:1});
      await click('.momo-primary');
      assert.equal(await evaluate('document.querySelector(".momo-review-details").textContent.includes("0791234567")'),true);
      assert.equal(await evaluate(`document.querySelector('${phone}')===null`),true);
      assert.deepEqual(await callbacks(),{review:1,confirm:0,book:1});
    });
    await t.test(`${cashout?'cashout':'top-up'} keeps validation priority and its existing live region`,async()=>{
      await load(cashout);await evaluate(`window.originalFeedback=document.querySelector('.momo-entry-feedback');momoPhoneFixture.setError('Payment service unavailable.');momoPhoneFixture.setValidation('Check the phone number.');`);await wait(60);
      assert.deepEqual(await feedback(),{text:'Check the phone number.',live:'polite',alerts:0,invalid:null});
      await evaluate(`momoPhoneFixture.setValidation('Amount must be at least 100 RWF.');`);await wait(60);
      assert.equal((await feedback()).text,'Amount must be at least 100 RWF.');
      await evaluate('momoPhoneFixture.setValidation("")');await wait(60);
      assert.equal((await feedback()).text,'Payment service unavailable.');
      await evaluate('momoPhoneFixture.setError(null);momoPhoneFixture.setRateUnavailable(true)');await wait(60);
      assert.equal((await feedback()).text,'Exchange rate unavailable. Retry');
      await evaluate('momoPhoneFixture.setRateUnavailable(false)');await wait(60);
      assert.deepEqual(await feedback(),{text:'',live:'polite',alerts:0,invalid:null});
      assert.equal(await evaluate('window.originalFeedback===document.querySelector(".momo-entry-feedback")'),true);
      assert.deepEqual(await callbacks(),{review:0,confirm:0,book:0});
    });
    await t.test(`${cashout?'cashout':'top-up'} review retains the original validation alert`,async()=>{
      await load(cashout);await click('.momo-primary');
      await evaluate(`momoPhoneFixture.setError('Original service error.');momoPhoneFixture.setValidation('Original validation message.');`);await wait(60);
      assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'),1);
      assert.equal(await evaluate('document.querySelector("[role=alert]").textContent.trim()'),'Original validation message.');
      assert.deepEqual(await callbacks(),{review:1,confirm:0,book:0});
    });
  }
  await t.test('the phone label and native input are supplied by FormField without moving global feedback',async()=>{
    await load();
    assert.equal(await evaluate('document.querySelector(".momo-phone-field").classList.contains("form-field")'),true);
    assert.equal(await evaluate('document.querySelector(".momo-phone-field label").htmlFor'),'momo-page-phone');
    assert.equal(await evaluate('document.querySelectorAll("#momo-page-phone").length'),1);
    assert.equal(await evaluate('document.querySelector(".momo-phone-field .momo-entry-feedback")===null'),true);
  });
});
