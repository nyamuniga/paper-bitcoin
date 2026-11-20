// Uses production CSS: run with npm run test:mint-picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const trigger = '#picker-frame button';
const menu = '[aria-label="Available mints"]';

test('MintBalancePicker interactions and portal positioning', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./mintBalancePicker.fixture.tsx', import.meta.url), trigger,
  );
  const viewport = (width = 390, height = 844) => call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
  });
  const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(50);
  };
  const selected = () => evaluate('document.getElementById("selected-mint").textContent');
  const assertClosed = async (count = 0) => {
    await wait(200); // The shared menu stays mounted through its 160ms exit.
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(menu)}) === null`), true);
    assert.deepEqual(await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(trigger)});return {expanded:b.getAttribute('aria-expanded'),focused:document.activeElement===b,count:document.getElementById('selection-count').textContent}})()`),
      { expanded: 'false', focused: true, count: String(count) });
  };
  const openPicker = async query => {
    await open(query);
    await click(trigger);
    await wait(250); // Measure bounds after the 240ms opening has settled.
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-expanded')`), 'true');
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${menu} [aria-current="true"]')`), true);
    assert.equal(await evaluate('scrollY'), 0, 'Opening must not scroll the page to the portal.');
  };
  const geometry = () => evaluate(`(()=>{
    const menu=document.querySelector('${menu}'),trigger=document.querySelector('${trigger}');
    const m=menu.getBoundingClientRect(),b=trigger.getBoundingClientRect();
    return {top:m.top,bottom:m.bottom,left:m.left,right:m.right,width:m.width,
      triggerTop:b.top,triggerBottom:b.bottom,triggerWidth:b.width,triggerLeft:b.left,
      viewportWidth:innerWidth,viewportHeight:innerHeight,scrollHeight:menu.scrollHeight,
      clientHeight:menu.clientHeight,contentFits:menu.scrollWidth<=menu.clientWidth,portal:menu.parentElement===document.body,
      overflow:getComputedStyle(menu).overflowY,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  const assertFits = bounds => {
    assert(bounds.top >= 7 && bounds.bottom <= bounds.viewportHeight - 7, JSON.stringify(bounds));
    assert(bounds.left >= 0 && bounds.right <= bounds.viewportWidth, JSON.stringify(bounds));
    assert(Math.abs(bounds.width - bounds.triggerWidth) < 1);
    assert(Math.abs(bounds.left - bounds.triggerLeft) < 1);
    assert.equal(bounds.portal, true);
    assert.equal(bounds.horizontalOverflow, false);
    assert.equal(bounds.contentFits, true);
    assert.equal(bounds.overflow, 'auto');
    assert(bounds.scrollHeight > bounds.clientHeight, 'Long mint list must scroll within the menu.');
  };

  for (const theme of ['dark', 'light']) {
    for (const [width, height, bottom] of [[390, 844, false], [390, 844, true], [320, 240, true], [1024, 600, false]]) {
      await t.test(`${theme} ${width}x${height} ${bottom ? 'bottom' : 'top'} menu escapes its clipped parent and fits the viewport`, async () => {
        await viewport(width, height);
        await openPicker(`theme=${theme}${bottom ? '&bottom' : ''}`);
        const bounds = await geometry();
        assertFits(bounds);
        assert(bottom ? bounds.bottom <= bounds.triggerTop - 7 : bounds.top >= bounds.triggerBottom + 7);
        assert.equal(await evaluate(`document.querySelector('${menu} [aria-current="true"]').textContent.includes('Fixture Mint 1')`), true);
        if (process.env.MINT_PICKER_SNAPSHOT_DIR) {
          const screenshot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(join(process.env.MINT_PICKER_SNAPSHOT_DIR, `${theme}-${width}-${height}-${bottom ? 'bottom' : 'top'}.png`), Buffer.from(screenshot.data, 'base64'));
        }
        await key('Escape');
        await assertClosed();
      });
    }
  }

  await t.test('pointer selection updates the mint once, closes and restores focus', async () => {
    await viewport();await openPicker('theme=dark');
    assert.equal(await evaluate(`document.querySelector('${trigger}').textContent.includes('₿0')`), true);
    await click(`${menu} button:nth-child(2)`);
    assert.equal(await selected(), 'https://mint-2.example.test');
    await assertClosed(1);
    assert.equal(await evaluate(`document.querySelector('${trigger}').textContent.includes('₿1,000')`), true);
    await click(trigger);
    await wait(250); // Measure bounds after the 240ms opening has settled.
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${menu} button:nth-child(2)')`), true);
    await key('Escape');await assertClosed(1);
  });

  await t.test('keyboard selection works and Escape dismisses without selecting', async () => {
    await viewport();await open('theme=light');
    await key('Tab');await key('Tab');
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${trigger}')`), true);
    await key('Enter');await key('Tab');await key('Enter');
    assert.equal(await selected(), 'https://mint-2.example.test');
    await assertClosed(1);
    await key('Enter');await key('Tab');await key('Escape');
    assert.equal(await selected(), 'https://mint-2.example.test');
    await assertClosed(1);
  });

  await t.test('disabled picker rejects pointer and keyboard activation', async () => {
    await viewport();await open('disabled');
    assert.equal(await evaluate(`document.querySelector('${trigger}').disabled`), true);
    await click(trigger);
    await key('Tab');await key('Enter');
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${trigger}')`), false);
    assert.equal(await evaluate(`document.querySelector('${menu}') === null`), true);
    assert.equal(await selected(), 'https://mint-1.example.test');
    assert.equal(await evaluate('document.getElementById("selection-count").textContent'), '0');
  });

  await t.test('outside click dismisses without selection and returns focus', async () => {
    await viewport();await openPicker('');
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', buttons: 0, clickCount: 1 });
    await wait(50);await assertClosed();
    assert.equal(await selected(), 'https://mint-1.example.test');
  });

  await t.test('portal stays aligned when its scrollable page moves', async () => {
    await viewport();await openPicker('');
    const before = await geometry();
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 5, y: 100, deltaX: 0, deltaY: 40 });
    await wait(150);
    const after = await geometry();assertFits(after);
    assert(after.triggerTop < before.triggerTop, 'The fixture page must actually scroll.');
    assert(Math.abs(after.top - after.triggerBottom - 8) < 1);
    await key('Escape');await assertClosed();
  });

  await t.test('menu responds to viewport resize and its final option remains reachable', async () => {
    await viewport();await openPicker('bottom');
    await viewport(320, 240);await wait(100);
    const bounds = await geometry();assertFits(bounds);
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: bounds.left + 20, y: bounds.top + 20, deltaX: 0, deltaY: 1200 });
    await wait(150);
    assert.equal(await evaluate(`(()=>{const m=document.querySelector('${menu}').getBoundingClientRect(),b=document.querySelector('${menu} button:last-child').getBoundingClientRect();return b.top>=m.top&&b.bottom<=m.bottom})()`), true);
    await click(`${menu} button:last-child`);
    assert.equal(await selected(), 'https://mint-12.example.test');
    await assertClosed(1);
  });
});
