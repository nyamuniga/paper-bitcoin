import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

for (const cashout of [false, true]) test(`Mobile Money ${cashout ? 'cashout' : 'top-up'} review presentation`, { timeout: 45000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(t, new URL('./momoMintPicker.fixture.tsx', import.meta.url), '#momo-page-phone');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  const load = async (query = '', width = 390, height = 844) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await open(`phone-field${cashout ? '&cashout' : ''}&${query}`);
    await call('Page.bringToFront');
    await evaluate('Object.assign(document.querySelector("main").style,{display:"flex",flexDirection:"column"});window.reviewAction=document.querySelector(".momo-primary");window.reviewAction.focus();true');
    await key('Enter');
  };
  const calls = () => evaluate('({review:document.getElementById("review-calls").textContent,confirm:document.getElementById("confirm-calls").textContent})');
  const capture = async name => {
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait(200);
    const record = await evaluate(`Array.from(document.querySelector('.momo-payment-form').querySelectorAll('*')).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,text:e.childElementCount?null:e.textContent,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','padding','font','backgroundColor','color','border','borderRadius','outline','outlineOffset','overflow','transform','transition'].map(k=>[k,s[k]]))}})`);
    if (process.env.MOMO_REVIEW_CAPTURE) {
      await mkdir(process.env.MOMO_REVIEW_CAPTURE, { recursive: true });
      await writeFile(join(process.env.MOMO_REVIEW_CAPTURE, name + '.json'), JSON.stringify(record));
    }
    if (process.env.MOMO_REVIEW_COMPARE) assert.deepEqual(record, JSON.parse(await readFile(join(process.env.MOMO_REVIEW_COMPARE, name + '.json'), 'utf8')));
    const directory = process.env.MOMO_REVIEW_IMAGES;
    if (directory) {
      await mkdir(directory, { recursive: true });
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(directory, name + '.png'), Buffer.from(data, 'base64'));
    }
  };
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
    await t.test(`${theme} ${width}×${height} retains details, action and keyboard focus`, async () => {
      await load(`theme=${theme}`, width, height);
      const details = await evaluate('Array.from(document.querySelectorAll(".momo-review-details > div")).map(row=>[row.querySelector("dt").textContent,row.querySelector("dd").textContent])');
      assert.deepEqual(details, cashout ? [
        ['To phone', '0780000000'], ['From mint', 'Fixture Mint 1'], ['MoMo fee', '10 RWF'], ['Routing reserve', '5 sats'], ['Estimated wallet debit', '₿1,025'],
      ] : [['From phone', '0780000000'], ['To mint', 'Fixture Mint 1'], ['Estimated wallet credit', '₿990']]);
      assert.equal(await evaluate('document.querySelector(".momo-review-amount strong").textContent.trim()'), '1,000 RWF');
      assert.equal(await evaluate('document.querySelector(".momo-review-amount p").textContent'), cashout ? 'Recipient receives' : 'You pay');
      assert.equal(await evaluate('document.querySelector(".momo-review-note").textContent'), cashout
        ? 'Your recipient receives the RWF amount above. The wallet estimate includes fees and the routing reserve.'
        : 'Confirming sends a payment prompt to this phone.');
      assert.equal(await evaluate('window.reviewAction===document.querySelector(".momo-primary") && document.activeElement===window.reviewAction'), true);
      assert.equal(await evaluate('document.querySelector(".momo-primary").textContent'), cashout ? 'Confirm cashout' : 'Confirm top-up');
      assert.equal(await evaluate('document.querySelectorAll(".momo-entry-fields,.momo-saved-transfers").length'), 0);
      await capture(`${cashout ? 'cashout' : 'top-up'}-${theme}-${width}-${height}`);
      assert.deepEqual(await calls(), { review: '1', confirm: '0' });
      await key('Enter'); await key('Enter');
      assert.deepEqual(await calls(), { review: '1', confirm: '1' });
      assert.equal(await evaluate('document.querySelector(".momo-primary").disabled'), true);
      assert.equal(await evaluate('document.querySelector(".momo-primary").textContent'), 'Confirming…');
    });
  }
  await t.test('review feedback retains its alert, validation priority and service fallback', async () => {
    await load();
    await evaluate('momoPhoneFixture.setError("Service failure");momoPhoneFixture.setValidation("Details changed");true'); await wait(30);
    assert.equal(await evaluate('document.querySelectorAll(".momo-review-content [role=alert]").length'), 1);
    assert.equal(await evaluate('document.querySelector("[role=alert]").textContent.trim()'), 'Details changed');
    await evaluate('momoPhoneFixture.setValidation("");true'); await wait(30);
    assert.equal(await evaluate('document.querySelector("[role=alert]").textContent.trim()'), 'Service failure');
    await evaluate('momoPhoneFixture.setError(null);true'); await wait(30);
    assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'), 0);
    assert.deepEqual(await calls(), { review: '1', confirm: '0' });
  });
});
