// Verify one shared presentation and motion contract for every payment caller.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const trigger = '#picker-frame button';
const menu = '[aria-label="Available mints"]';

test('MintBalancePicker animates consistently without caller options', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./mintBalancePicker.fixture.tsx', import.meta.url), trigger,
  );
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const openPicker = async () => {
    await open('');
    await evaluate('document.getElementById("before-picker").focus()');
    await key('Tab');await key('Enter');
  };
  const motion = () => evaluate(`(()=>{
    const m=document.querySelector('${menu}'),s=getComputedStyle(m),rows=[...m.querySelectorAll('button')];
    return {name:s.animationName,duration:s.animationDuration,easing:s.animationTimingFunction,
      rows:rows.slice(0,3).map(b=>{const s=getComputedStyle(b);return {name:s.animationName,duration:s.animationDuration,delay:s.animationDelay}}),
      chevron:getComputedStyle(document.querySelector('${trigger} svg')).transitionDuration,
      chevronProperty:getComputedStyle(document.querySelector('${trigger} svg')).transitionProperty};
  })()`);
  const assertGone = async () => assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);

  await t.test('all selectors share framed icons, typography, row borders and menu height', async () => {
    await open('');
    await evaluate('document.getElementById("before-picker").focus()');await key('Tab');await key('Enter');
    const appearance = await evaluate(`(()=>{
      const b=document.querySelector('${trigger}'),m=document.querySelector('${menu}'),row=m.querySelector('button');
      const icon=b.querySelector('span > div'),name=b.querySelector('span > span');
      return {iconBorder:getComputedStyle(icon).borderTopWidth,iconBackground:getComputedStyle(icon).backgroundColor,
        nameWeight:getComputedStyle(name).fontWeight,border:getComputedStyle(row).borderBottomWidth,
        balanceWeight:getComputedStyle(row.lastElementChild).fontWeight,maxHeight:getComputedStyle(m).maxHeight};
    })()`);
    assert.equal(appearance.iconBorder, '1px');
    assert.notEqual(appearance.iconBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(appearance.nameWeight, '500');
    assert.equal(appearance.border, '1px');
    assert.equal(appearance.balanceWeight, '700');
    assert.equal(appearance.maxHeight, '250px');
  });

  await t.test('default opening, item stagger and chevron use the established timings', async () => {
    await openPicker();
    const actual = await motion();
    assert.equal(actual.name, 'dropdown-expand-down');
    assert.equal(actual.duration, '0.24s');
    assert.equal(actual.easing, 'cubic-bezier(0.16, 1, 0.3, 1)');
    assert.deepEqual(actual.rows, [0, .03, .06].map(delay => ({ name: 'dropdown-item-reveal', duration: '0.2s', delay: `${delay}s` })));
    assert.equal(actual.chevron, '0.3s');
  });
  await t.test('full dropdown remains mounted for its original closing animation and returns focus', async () => {
    await openPicker();await wait(250);await key('Enter');
    const closing = await motion();
    assert.equal(closing.name, 'dropdown-collapse-up');
    assert.equal(closing.duration, '0.16s');
    assert.equal(closing.easing, 'cubic-bezier(0.32, 0.72, 0, 1)');
    assert.equal(await evaluate(`document.activeElement===document.querySelector('${trigger}')`), true);
    await wait(200);await assertGone();
    await key('Enter');
    assert.equal((await motion()).name, 'dropdown-expand-down');
  });
  await t.test('Escape still dismisses immediately', async () => {
    await openPicker();await key('Escape');await assertGone();
  });
  await t.test('reduced motion removes spatial animation and the closing delay', async () => {
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await openPicker();
    const actual = await motion();
    assert.equal(actual.name, 'none');
    assert(actual.rows.every(row => row.name === 'none'));
    assert.equal(actual.chevronProperty, 'none');
    await key('Escape');await assertGone();
  });
});
