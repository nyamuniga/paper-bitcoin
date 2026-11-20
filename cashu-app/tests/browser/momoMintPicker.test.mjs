import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const trigger = '[aria-label="Choose mint"]';
const menu = '[aria-label="Available mints"]';

test('Mobile Money uses the same animated mint picker for top-up and cashout', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./momoMintPicker.fixture.tsx', import.meta.url), trigger,
  );
  const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(300);
  };
  for (const cashout of [false, true]) for (const theme of ['dark', 'light']) for (const width of [390, 1024]) {
    await t.test(`${cashout ? 'cashout' : 'top-up'} ${theme} at ${width}px animates and selects a mint`, async () => {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
      await open(`theme=${theme}${cashout ? '&cashout' : ''}`);await click(trigger);
      const motion = await evaluate(`(()=>{const m=document.querySelector('${menu}'),s=getComputedStyle(m),r=getComputedStyle(m.querySelectorAll('button')[1]),b=m.getBoundingClientRect();return {menu:s.animationName,duration:s.animationDuration,row:r.animationName,delay:r.animationDelay,portal:m.parentElement===document.body,fits:b.top>=7&&b.bottom<=innerHeight-7&&b.left>=0&&b.right<=innerWidth}})()`);
      assert.deepEqual(motion, { menu: 'dropdown-expand-down', duration: '0.24s', row: 'dropdown-item-reveal', delay: '0.03s', portal: true, fits: true });
      if (process.env.MOMO_PICKER_SNAPSHOT_DIR) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.MOMO_PICKER_SNAPSHOT_DIR, `${cashout ? 'cashout' : 'top-up'}-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      await click(`${menu} button:nth-child(2)`);
      assert.equal(await evaluate('document.getElementById("selected-mint").textContent'), 'https://mint-2.example.test');
      assert.equal(await evaluate(`document.querySelector('${trigger}').textContent.includes('₿20,000')`), true);
      assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);
      await click(trigger);await key('Escape');
      assert.equal(await evaluate(`document.querySelector('${menu}')===null && document.activeElement===document.querySelector('${trigger}')`), true);
    });
  }
  await t.test('review keeps the selected mint and hides the editable picker', async () => {
    await open('');await click(trigger);await click(`${menu} button:nth-child(2)`);
    await click('.momo-primary');
    assert.equal(await evaluate('!!document.querySelector(".momo-review-content")'), true);
    assert.equal(await evaluate('document.querySelector(".momo-review-details").textContent.includes("Fixture Mint 2")'), true);
    assert.equal(await evaluate(`document.querySelector('${trigger}')===null`), true);
    assert.equal(await evaluate('document.getElementById("selected-mint").textContent'), 'https://mint-2.example.test');
  });
  await t.test('submitting keeps the existing primary-action lock', async () => {
    await open('submitting');
    assert.equal(await evaluate('document.querySelector(".momo-primary").disabled'), true);
  });
});
