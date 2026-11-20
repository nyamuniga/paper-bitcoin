// Uses production CSS: run with npm run test:segmented-controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

test('SlidingSegmentedControl themes and interactions', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./segmentedControl.fixture.tsx', import.meta.url), '#control-host button',
  );
  const focusFirst = async () => {
    await evaluate('document.getElementById("before-control").focus()');
    await key('Tab');
  };
  const readColors = () => evaluate(`(()=>{
    const control=document.querySelector('#control-host > div'),buttons=[...control.querySelectorAll('button')];
    const selected=buttons.find(button=>button.getAttribute('aria-selected')==='true'||button.getAttribute('aria-pressed')==='true');
    const inactive=buttons.find(button=>button!==selected),pill=control.querySelector('[data-segment-indicator]');
    const ctx=document.createElement('canvas').getContext('2d'),root=getComputedStyle(document.documentElement);
    function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
    const token=name=>rgba(root.getPropertyValue('--color-'+name));
    return {selected:rgba(getComputedStyle(selected).color),inactive:rgba(getComputedStyle(inactive).color),
      container:rgba(getComputedStyle(control).backgroundColor),pill:rgba(getComputedStyle(pill).backgroundColor),
      border:rgba(getComputedStyle(pill).borderTopColor),foreground:token('on-surface'),muted:token('on-surface-muted'),
      selectedToken:token('on-selection-container'),pillToken:token('selection-container'),borderToken:token('selection-outline'),
      selectedRole:root.getPropertyValue('--color-on-selection-container').trim(),
      icon:selected.querySelector('svg')?rgba(getComputedStyle(selected.querySelector('svg')).color):null,
      overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  const assertIndicatorAligned = async () => {
    await wait(350);
    const bounds = await evaluate(`(()=>{
      const selected=document.querySelector('#control-host [aria-selected="true"],#control-host [aria-pressed="true"]');
      const a=selected.getBoundingClientRect(),b=document.querySelector('[data-segment-indicator]').getBoundingClientRect();
      return {left:Math.abs(a.left-b.left),top:Math.abs(a.top-b.top),width:Math.abs(a.width-b.width),height:Math.abs(a.height-b.height)};
    })()`);
    assert(Object.values(bounds).every(value => value < 1), JSON.stringify(bounds));
  };

  for (const width of [390, 1024]) for (const theme of ['dark', 'light']) for (const compact of [false, true]) {
    await t.test(`${theme} ${compact ? 'compact tabs' : 'group'} at ${width}px distinguishes selection and keyboard focus`, async () => {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
      await open(`theme=${theme}${compact ? '&compact' : ''}`);
      await assertIndicatorAligned();
      const colors = await readColors();
      if (process.env.SEGMENTED_CONTROL_SNAPSHOT_DIR) {
        const name = `${theme}-${width}-${compact ? 'compact' : 'regular'}`;
        await writeFile(join(process.env.SEGMENTED_CONTROL_SNAPSHOT_DIR, name + '.json'), JSON.stringify(colors, null, 2));
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.SEGMENTED_CONTROL_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
      }
      assert(colors.selectedRole, 'Selected foreground must have a theme token.');
      assert.deepEqual(colors.selected, colors.selectedToken);
      assert.deepEqual(colors.inactive, colors.muted);
      assert.deepEqual(colors.pill, colors.pillToken);
      assert.deepEqual(colors.border, colors.borderToken);
      assert.notDeepEqual(colors.pill, colors.container);
      assert.notDeepEqual(colors.selected, colors.inactive);
      assert(contrast(colors.selected, colors.pill) >= 4.5);
      assert(contrast(colors.inactive, colors.container) >= 4.5);
      if (colors.icon) assert.deepEqual(colors.icon, colors.selected);
      assert.equal(colors.overflow, false);
      await focusFirst();
      await wait(250); // The existing transition-colors also animates outline color.
      const focus = await evaluate(`(()=>{const b=document.activeElement,s=getComputedStyle(b);return {within:!!b.closest('#control-host'),visible:b.matches(':focus-visible'),width:parseFloat(s.outlineWidth),style:s.outlineStyle,color:s.outlineColor,expected:getComputedStyle(document.body).color}})()`);
      assert.equal(focus.within, true);assert.equal(focus.visible, true);
      assert(focus.width >= 2);assert.equal(focus.style, 'solid');assert.equal(focus.color, focus.expected);
      assert(contrast(colors.foreground, colors.container) >= 3);
    });
  }
  await t.test('group buttons keep click and keyboard activation with pressed state', async () => {
    await open('theme=light');
    await focusFirst();await key('Tab');await wait(250);
    assert.equal(await evaluate('document.getElementById("value").textContent'), 'first');
    assert.deepEqual(await evaluate(`(()=>{const b=document.activeElement;return {pressed:b.getAttribute('aria-pressed'),visible:b.matches(':focus-visible'),width:parseFloat(getComputedStyle(b).outlineWidth)}})()`), { pressed: 'false', visible: true, width: 2 });
    await key('Enter');
    assert.equal(await evaluate('document.getElementById("value").textContent'), 'second');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-pressed")'), 'true');
    await assertIndicatorAligned();
    const point = await evaluate('(()=>{const r=document.querySelector("#control-host button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    assert.equal(await evaluate('document.getElementById("value").textContent'), 'first');
  });
  await t.test('compact tabs preserve roving focus, wrapping arrows, Home/End and panel links', async () => {
    await open('theme=light&compact');await focusFirst();
    for (const [name, expected] of [['ArrowRight','second'],['ArrowRight','first'],['End','second'],['Home','first'],['ArrowLeft','second']]) {
      await key(name);
      assert.equal(await evaluate('document.getElementById("value").textContent'), expected);
      assert.deepEqual(await evaluate(`(()=>{const b=document.activeElement;return {selected:b.getAttribute('aria-selected'),tabIndex:b.tabIndex,panel:document.getElementById(b.getAttribute('aria-controls')).hidden}})()`), { selected: 'true', tabIndex: 0, panel: false });
    }
    await assertIndicatorAligned();
  });
  await t.test('unselected hover text follows the theme without changing selection', async () => {
    for (const theme of ['dark','light']) {
      await open('theme=' + theme);
      const point = await evaluate('(()=>{const r=document.querySelectorAll("#control-host button")[1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });await wait(250);
      const colors = await readColors();
      assert.deepEqual(colors.inactive, colors.foreground);
      assert.deepEqual(colors.selected, colors.selectedToken);
      assert.equal(await evaluate('document.getElementById("value").textContent'), 'first');
    }
  });
  await t.test('indicator follows resize and honors reduced motion', async () => {
    await open('theme=dark');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await assertIndicatorAligned();
    await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 844, deviceScaleFactor: 1, mobile: false });
    await assertIndicatorAligned();
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-segment-indicator]")).transitionProperty'), 'none');
  });
});
