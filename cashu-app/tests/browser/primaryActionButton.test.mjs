import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

test('PrimaryActionButton semantics and existing action presentation', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./primaryActionButton.fixture.tsx', import.meta.url), '#action',
  );
  const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(40);
  };
  const counts = () => evaluate('({clicks:Number(document.getElementById("clicks").textContent),submits:Number(document.getElementById("submits").textContent)})');
  const style = selector => evaluate(`(()=>{
    const b=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(b),r=b.getBoundingClientRect();
    return Object.fromEntries(['backgroundColor','color','borderRadius','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','minHeight','display','gap','opacity','cursor','outlineWidth','outlineColor','outlineOffset'].map(k=>[k,s[k]]).concat([['width',r.width],['height',r.height]]));
  })()`);
  const actionName = async () => {
    const { root } = await call('DOM.getDocument');
    const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: '#action' });
    const { nodes } = await call('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return nodes[0].name.value;
  };

  for (const conversion of [false, true]) for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
      await t.test(`${conversion ? 'conversion' : 'Mobile Money'} ${theme} at ${width}x${height} matches its native button`, async () => {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await open(`theme=${theme}${conversion ? '&conversion' : ''}`);
        const actual = await style('#action');
        assert.deepEqual(actual, await style('#reference'));
        // Freeze the pre-migration values too: changing both buttons' feature CSS must not hide a regression.
        assert.equal(actual.backgroundColor, 'rgb(242, 169, 59)');
        assert.equal(actual.color, 'rgb(6, 17, 12)');
        assert.equal(actual.borderRadius, '16px');
        assert.equal(actual.fontWeight, '600');
        assert.equal(actual.fontSize, height < 520 ? '13px' : '15px');
        assert.equal(actual.minHeight, height < 520 ? conversion ? '32px' : '36px' : '44px');
        assert.equal(actual.paddingTop, height < 520 ? '6px' : conversion ? '12px' : '10px');
        assert.equal(actual.paddingRight, height < 520 ? '8px' : conversion ? '18px' : '16px');
        assert.equal(await actionName(), conversion ? 'Review transfer' : 'Review cashout');
        assert.deepEqual(await evaluate('({type:document.getElementById("action").type,busy:document.getElementById("action").getAttribute("aria-busy"),name:document.getElementById("action").name,value:document.getElementById("action").value,hint:document.getElementById("action").getAttribute("aria-describedby")})'),
          { type: 'button', busy: null, name: 'action', value: 'review', hint: 'action-hint' });
        if (process.env.PRIMARY_ACTION_SNAPSHOT_DIR) {
          const screenshot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(join(process.env.PRIMARY_ACTION_SNAPSHOT_DIR, `${conversion ? 'conversion' : 'momo'}-${theme}-${width}-${height}.png`), Buffer.from(screenshot.data, 'base64'));
        }
      });
    }
  }
  for (const conversion of [false, true]) for (const state of ['disabled', 'loading']) {
    await t.test(`${conversion ? 'conversion' : 'Mobile Money'} ${state} keeps its label and blocks activation`, async () => {
      await open(`${state}${conversion ? '&conversion' : ''}`);
      assert.deepEqual(await style('#action'), await style('#reference'));
      assert.equal(await evaluate('document.getElementById("action").disabled'), true);
      assert.equal(await evaluate('document.getElementById("action").getAttribute("aria-busy")'), state === 'loading' ? 'true' : null);
      assert.equal(await actionName(), state === 'loading' ? conversion ? 'Getting rate and fees…' : 'Confirming…' : conversion ? 'Review transfer' : 'Review cashout');
      assert.equal(await evaluate('document.querySelectorAll("#action svg").length'), conversion ? 1 : 0);
      await click('#action');
      await evaluate('document.getElementById("native-input").focus()');await key('Tab');
      assert.equal(await evaluate('document.activeElement.id'), 'standalone');
      await key('Enter');assert.deepEqual(await counts(), { clicks: 0, submits: 0 });
    });
  }
  await t.test('type=button supports pointer and keyboard activation without submitting', async () => {
    await open('');await click('#action');
    await evaluate('document.getElementById("before-action").focus()');await key('Tab');await key('Tab');await key('Enter');
    assert.deepEqual(await counts(), { clicks: 2, submits: 0 });
  });
  await t.test('type=submit retains native form submission', async () => {
    await open('submit');await click('#action');
    assert.deepEqual(await counts(), { clicks: 1, submits: 1 });
  });
  await t.test('type=reset retains native form reset', async () => {
    await open('reset');await evaluate('document.getElementById("native-input").focus()');
    await call('Input.insertText', { text: 'changed' });
    assert.notEqual(await evaluate('document.getElementById("native-input").value'), 'original');
    await click('#action');
    assert.equal(await evaluate('document.getElementById("native-input").value'), 'original');
    assert.deepEqual(await counts(), { clicks: 1, submits: 0 });
  });
  await t.test('controlled loading blocks another activation and can be released', async () => {
    await open('lock-on-click');await click('#action');await click('#action');
    assert.deepEqual(await counts(), { clicks: 1, submits: 0 });
    assert.equal(await evaluate('document.getElementById("action").disabled'), true);
    await click('#ready');await click('#action');
    assert.deepEqual(await counts(), { clicks: 2, submits: 0 });
  });
  await t.test('clearing loading does not clear the caller disabled state', async () => {
    await open('disabled&loading');await click('#ready');
    assert.equal(await evaluate('document.getElementById("action").disabled'), true);
    assert.equal(await evaluate('document.getElementById("action").getAttribute("aria-busy")'), null);
  });
  await t.test('forwarded ref and keyboard focus remain usable', async () => {
    await open('');await click('#focus-action');
    assert.equal(await evaluate('document.activeElement.id'), 'action');
    await evaluate('document.getElementById("before-action").focus()');await key('Tab');await key('Tab');
    assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true);
    const focus = await style('#action');
    assert.equal(focus.outlineWidth, '2px');assert.equal(focus.outlineOffset, '3px');
  });
  for (const conversion of [false, true]) {
    await t.test(`${conversion ? 'conversion' : 'Mobile Money'} hover remains caller-owned`, async () => {
      await open(conversion ? 'conversion' : '');
      const colors = [];
      for (const selector of ['#action', '#reference']) {
        const point = await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });await wait(200);
        colors.push((await style(selector)).backgroundColor);
      }
      assert.equal(colors[0], colors[1]);
      assert.equal(colors[0], conversion ? 'rgb(255, 197, 100)' : 'rgb(242, 169, 59)');
    });
  }
  await t.test('standalone primitive supplies the common base without injecting content', async () => {
    await open('');const standalone = await style('#standalone');
    assert.equal(standalone.backgroundColor, 'rgb(242, 169, 59)');
    assert.equal(standalone.color, 'rgb(6, 17, 12)');
    assert.equal(standalone.borderRadius, '16px');
    assert.equal(standalone.minHeight, '44px');
    assert.equal(await evaluate('document.getElementById("standalone").textContent'), 'Continue');
    assert.equal(await evaluate('document.querySelectorAll("#standalone svg").length'), 0);
  });
});
