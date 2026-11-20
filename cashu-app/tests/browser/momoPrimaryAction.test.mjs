import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const action = '.momo-primary';

test('Mobile Money primary action preserves presentation and feature workflow', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./momoMintPicker.fixture.tsx', import.meta.url), action,
  );
  const click = async () => {
    const point = await evaluate(`(()=>{const r=document.querySelector('${action}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(50);
  };
  const state = () => evaluate(`(()=>{const b=document.querySelector('${action}');return {label:b.textContent,type:b.type,disabled:b.disabled,review:Number(document.getElementById('review-calls').textContent),confirm:Number(document.getElementById('confirm-calls').textContent),icons:b.querySelectorAll('svg').length}})()`);
  const snapshot = async name => {
    if (!process.env.MOMO_ACTION_SNAPSHOT_DIR) return;
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.MOMO_ACTION_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };

  for (const cashout of [false, true]) for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
      await t.test(`${cashout ? 'cashout' : 'top-up'} ${theme} at ${width}x${height} keeps entry, review and confirming states`, async () => {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await open(`theme=${theme}${cashout ? '&cashout' : ''}`);
        const direction = cashout ? 'cashout' : 'top-up';
        const name = `${direction}-${theme}-${width}-${height}`;
        assert.deepEqual(await state(), { label: `Review ${direction}`, type: 'button', disabled: false, review: 0, confirm: 0, icons: 0 });
        const styles = await evaluate(`(()=>{const b=document.querySelector('${action}'),s=getComputedStyle(b);return {background:s.backgroundColor,color:s.color,radius:s.borderRadius,size:s.fontSize,weight:s.fontWeight,minHeight:s.minHeight,padding:s.padding}})()`);
        assert.deepEqual(styles, { background: 'rgb(242, 169, 59)', color: 'rgb(6, 17, 12)', radius: '16px', size: height < 520 ? '13px' : '15px', weight: '600', minHeight: height < 520 ? '36px' : '44px', padding: height < 520 ? '6px 8px' : '10px 16px' });
        await snapshot(name + '-entry');
        await click();
        assert.deepEqual(await state(), { label: `Confirm ${direction}`, type: 'button', disabled: false, review: 1, confirm: 0, icons: 0 });
        assert.equal(await evaluate('!!document.querySelector(".momo-review-content")'), true);
        await snapshot(name + '-review');
        await click();
        assert.deepEqual(await state(), { label: 'Confirming…', type: 'button', disabled: true, review: 1, confirm: 1, icons: 0 });
        await snapshot(name + '-confirming');
        await click();
        assert.equal((await state()).confirm, 1);
      });
    }
  }
  for (const cashout of [false, true]) {
    for (const entry of [
      { query: 'invalid', label: cashout ? 'Review cashout' : 'Review top-up', disabled: true },
      { query: 'loading-rate', label: 'Loading rate…', disabled: false },
      { query: 'loading-rate&invalid', label: 'Loading rate…', disabled: true },
      { query: 'submitting&loading-rate', label: 'Confirming…', disabled: true },
    ]) {
      await t.test(`${cashout ? 'cashout' : 'top-up'} ${entry.query} keeps the original label and guard`, async () => {
        await open(`${entry.query}${cashout ? '&cashout' : ''}`);
        const before = await state();
        assert.equal(before.label, entry.label);assert.equal(before.disabled, entry.disabled);
        await click();
        assert.equal((await state()).review, entry.disabled ? 0 : 1);
        assert.equal((await state()).confirm, 0);
      });
    }
    await t.test(`${cashout ? 'cashout' : 'top-up'} keyboard activates the right phase and blocks another confirmation`, async () => {
      await open(cashout ? 'cashout' : '');
      await evaluate(`document.querySelector('${action}').focus()`);await key('Enter');
      assert.equal((await state()).review, 1);assert.equal((await state()).confirm, 0);
      await key('Enter');await key('Enter');
      assert.equal((await state()).confirm, 1);assert.equal((await state()).disabled, true);
    });
  }
  await t.test('submitting uses the shared primitive and exposes the busy state', async () => {
    await open('submitting');
    assert.equal(await evaluate(`document.querySelector('${action}').getAttribute('aria-busy')`), 'true');
    assert.equal(await evaluate(`document.querySelector('${action}').classList.contains('primary-action-button')`), true);
  });
});
