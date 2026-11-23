import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

// Exercise the actual parent-to-entry boundary with existing synthetic contacts/mint metadata.
for (const cashout of [false, true]) test(`Mobile Money ${cashout ? 'cashout' : 'top-up'} entry extraction`, { timeout: 45000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(t, new URL('./momoMintPicker.fixture.tsx', import.meta.url), '#momo-page-phone');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  const load = async (query = '', width = 390, height = 844) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await open(`phone-field${cashout ? '&cashout' : ''}&${query}`);
    await call('Page.bringToFront');
    assert.equal(await evaluate('document.visibilityState'), 'visible');
    // Give the standalone form the same flex reservation its page supplies.
    await evaluate('Object.assign(document.querySelector("main").style,{display:"flex",flexDirection:"column"});true');
  };
  const click = async (selector, text) => {
    const p = await evaluate(`(()=>{const e=${text ? `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
    await wait(40);
  };
  const capture = async name => {
    // Capture settled paint after layout and the controls' normal pointer transitions.
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait(200);
    const record = await evaluate(`Array.from(document.querySelector('.momo-payment-form').querySelectorAll('*')).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,text:e.childElementCount?null:e.textContent,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','gridArea','gap','padding','font','backgroundColor','color','border','borderRadius','outline','outlineOffset','transform','transition'].map(k=>[k,s[k]]))}})`);
    for (const directory of [process.env.MOMO_ENTRY_CAPTURE, process.env.MOMO_ENTRY_COMPARE].filter(Boolean)) {
      if (directory === process.env.MOMO_ENTRY_CAPTURE) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, name + '.json'), JSON.stringify(record));
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(directory, name + '.png'), Buffer.from(data, 'base64'));
      } else {
        assert.deepEqual(record, JSON.parse(await readFile(join(directory, name + '.json'), 'utf8')));
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        const actual = Buffer.from(data, 'base64');
        if (process.env.MOMO_ENTRY_ACTUAL) {
          await mkdir(process.env.MOMO_ENTRY_ACTUAL, { recursive: true });
          await writeFile(join(process.env.MOMO_ENTRY_ACTUAL, name + '.png'), actual);
        }
        // Rounded-edge raster bytes vary even when comparing the original component to itself.
        // Geometry/styles above stay exact; retain both images for visual inspection.
        if (!actual.equals(await readFile(join(directory, name + '.png')))) t.diagnostic(name + ': PNG raster differs; inspect the paired captures');
      }
    }
  };
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
    await t.test(`${theme} ${width}×${height}: entry and review retain their exact presentation`, async () => {
      await load(`theme=${theme}`, width, height);
      const name = `${cashout ? 'cashout' : 'top-up'}-${theme}-${width}-${height}`;
      assert.deepEqual(await evaluate('Array.from(document.querySelector(".momo-payment-form").children).map(e=>e.className)'), ['momo-entry-fields', 'momo-page-amount', 'momo-entry-feedback', 'momo-page-keypad', 'momo-page-actions']);
      const entry = await evaluate(`(()=>{const phone=document.querySelector('#momo-page-phone'),pad=document.querySelector('.momo-page-keypad'),action=document.querySelector('.momo-primary');return {phone:[phone.type,phone.inputMode,phone.autocomplete,phone.value,phone.labels[0].textContent],amount:document.querySelector('.momo-page-amount output').textContent.trim(),keys:pad.querySelectorAll('button').length,phoneVisible:phone.getBoundingClientRect().left>=0&&phone.getBoundingClientRect().right<=innerWidth,actionVisible:action.getBoundingClientRect().bottom<=innerHeight}})()`);
      assert.deepEqual(entry, {phone:['tel','tel','tel-national','0780000000',cashout?'Recipient phone number':'Phone number'],amount:'1,000 RWF',keys:12,phoneVisible:true,actionVisible:true});
      await capture(name + '-entry');
      await click('.momo-primary');
      assert.equal(await evaluate('!!document.querySelector(".momo-entry-fields")'), false);
      assert.equal(await evaluate('document.querySelectorAll(".momo-review-content").length'), 1);
      await capture(name + '-review');
      await click('.momo-primary');
      assert.equal(await evaluate('document.querySelector(".momo-primary").disabled'), true);
      assert.equal(await evaluate('document.getElementById("confirm-calls").textContent'), '1');
    });
  }
  await t.test('keypad keeps six-digit limit, deletion, clear and cashout Max', async () => {
    await load();
    await click('[aria-label="Clear amount"]');
    for (const digit of ['1', '2', '3', '4', '5', '6', '7']) await click('.momo-page-keypad button', digit);
    assert.equal(await evaluate('document.querySelector(".momo-page-amount output").textContent.replace(/[^0-9]/g, "")'), '123456');
    await click('[aria-label="Delete last digit"]');
    assert.equal(await evaluate('document.querySelector(".momo-page-amount output").textContent.replace(/[^0-9]/g, "")'), '12345');
    await click('[aria-label="Clear amount"]');
    assert.equal(await evaluate('document.querySelector(".momo-page-amount output").textContent.trim()'), '0 RWF');
    if (cashout) {
      await click('.momo-page-amount button');
      assert.equal(await evaluate('document.querySelector(".momo-page-amount output").textContent.trim()'), '1,000 RWF');
    } else assert.equal(await evaluate('document.querySelector(".momo-page-amount button")'), null);
  });
  await t.test('phone, address-book, mint and feedback still reach the same parent review', async () => {
    await load();
    await click('#momo-page-phone');
    await evaluate('document.querySelector("#momo-page-phone").select();true');
    await call('Input.insertText', { text: '079 abc-1234567 99' });
    assert.equal(await evaluate('document.querySelector("#momo-page-phone").value'), '0791234567');
    await key('Enter'); assert.notEqual(await evaluate('document.activeElement.id'), 'momo-page-phone');
    await click('[aria-label="Choose phone number from address book"]');
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Fixture phone contact")).click();true');
    await click('.momo-entry-fields [aria-label="Choose mint"]');
    await wait(200);
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Fixture Mint 2")).click();true');
    await wait(200);
    assert.equal(await evaluate('document.getElementById("selected-mint").textContent'), 'https://mint-2.example.test');
    await evaluate('momoPhoneFixture.setError("Service error");momoPhoneFixture.setValidation("Check phone");momoPhoneFixture.setRateUnavailable(true)'); await wait(30);
    assert.equal(await evaluate('document.querySelector(".momo-entry-feedback").textContent'), 'Check phoneExchange rate unavailable. Retry');
    await evaluate('momoPhoneFixture.setValidation("");momoPhoneFixture.setError(null);momoPhoneFixture.setRateUnavailable(false)'); await wait(30);
    await click('.momo-primary');
    assert.equal(await evaluate('document.querySelector(".momo-review-details").textContent.includes("0791234567")'), true);
    assert.equal(await evaluate('document.querySelector(".momo-review-details").textContent.includes("Fixture Mint 2")'), true);
    assert.equal(await evaluate('document.getElementById("review-calls").textContent'), '1');
    assert.equal(await evaluate('document.getElementById("confirm-calls").textContent'), '0');
  });
});
