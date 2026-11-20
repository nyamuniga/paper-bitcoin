import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

test('payment page layout reserves header/footer space and scrolls only its body', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./paymentPageLayout.fixture.tsx', import.meta.url), '#layout',
  );
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`,
  });
  const body = '.payment-page-layout__body';
  const load = async (query = '', width = 390, height = 844, insets = {}) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...insets } });
    await open(query);
  };
  const measure = () => evaluate(`(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const {x,y,width,height,top,bottom,left,right} = element.getBoundingClientRect();
      return {x,y,width,height,top,bottom,left,right};
    };
    const root = document.getElementById('layout');
    const content = document.querySelector('${body}');
    const styles = getComputedStyle(root);
    return {
      root: rect('#layout'), header: rect('.payment-page-layout__header'), body: rect('${body}'),
      footer: rect('.payment-page-layout__footer'), action: rect('#continue'), navigation: rect('#navigation'),
      padding: ['Top','Right','Bottom','Left'].map(side => parseFloat(styles['padding'+side])),
      scroll: content.scrollTop, documentScroll: scrollY,
      documentHeight: document.documentElement.scrollHeight, documentWidth: document.documentElement.scrollWidth,
      viewport: {width: innerWidth, height: innerHeight}, overflow: getComputedStyle(content).overflowY,
    };
  })()`);
  const assertReservedSpace = actual => {
    assert(actual.root.top >= actual.navigation.bottom);
    assert(actual.header.bottom <= actual.body.top);
    assert(actual.body.height > 0);
    assert(actual.root.bottom <= actual.viewport.height);
    assert(actual.body.bottom <= (actual.footer?.top ?? actual.root.bottom));
    if (actual.action) {
      assert(actual.action.top >= actual.body.bottom);
      assert(actual.action.bottom <= actual.viewport.height - actual.padding[2]);
    }
    assert.equal(actual.documentScroll, 0);
    assert(actual.documentHeight <= actual.viewport.height);
    assert(actual.documentWidth <= actual.viewport.width);
    assert.equal(actual.overflow, 'auto');
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({block: 'nearest'});
      const rect = element.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(60);
  };
  const wheel = async () => {
    const actual = await measure();
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: actual.body.x + actual.body.width / 2, y: actual.body.y + actual.body.height / 2,
      deltaX: 0, deltaY: 600,
    });
    await wait(200);
  };
  const capture = async name => {
    if (!process.env.PAYMENT_LAYOUT_SNAPSHOT_DIR) return;
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.PAYMENT_LAYOUT_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  const state = () => evaluate('JSON.parse(document.getElementById("fixture-state").textContent)');

  for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[320, 568], [390, 844], [1024, 844], [390, 480]]) {
      await t.test(`${theme} ${width}x${height} keeps the header/actions visible during body scrolling`, async () => {
        await load('theme=' + theme, width, height);
        const before = await measure();
        assertReservedSpace(before);
        assert.equal(await evaluate(`document.querySelector('${body}').getAttribute('aria-label')`), 'Review information');
        assert.equal(await evaluate(`document.querySelector('${body}').tabIndex`), 0);
        assert.equal(await evaluate('document.querySelectorAll("main").length'), 1);
        await capture(`${theme}-${width}-${height}`);
        await wheel();
        const after = await measure();
        assert(after.scroll > 0);
        assert.deepEqual(after.header, before.header);
        assert.deepEqual(after.action, before.action);
        assertReservedSpace(after);
        assert.deepEqual(await evaluate('window.fixtureErrors'), []);
      });
    }
  }
  for (const [width, height, insets] of [
    [390, 844, { top: 32, right: 28, bottom: 34, left: 44 }],
    [844, 390, { top: 0, right: 44, bottom: 21, left: 44 }],
  ]) {
    await t.test(`${width}x${height} respects emulated safe areas without duplicating the navigation inset`, async () => {
      await load('theme=light', width, height, insets);
      const actual = await measure();
      assertReservedSpace(actual);
      assert.equal(actual.navigation.height, 64 + insets.top);
      assert.equal(actual.root.top, actual.navigation.bottom);
      assert(actual.padding[1] >= insets.right);
      assert(actual.padding[2] >= insets.bottom);
      assert(actual.padding[3] >= insets.left);
      assert(actual.action.left >= insets.left);
      assert(actual.action.right <= width - insets.right);
      await capture(`safe-area-${width}-${height}`);
    });
  }
  await t.test('omitting the footer leaves the body all remaining height', async () => {
    await load('no-footer');
    const actual = await measure();
    assertReservedSpace(actual);
    assert.equal(actual.footer, null);
    assert.equal(actual.body.bottom, actual.root.bottom - actual.padding[2]);
  });
  await t.test('Tab and keyboard scrolling reach the body, fields and footer without moving the document', async () => {
    await load();
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Go back');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.getAttribute("role")'), 'region');
    const before = await measure();
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 });
    await wait(250);
    assert((await measure()).scroll > before.scroll);
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'), 'first-input');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'), 'last-input');
    const visible = await evaluate(`(() => {
      const input=document.activeElement.getBoundingClientRect();
      const region=document.querySelector('${body}').getBoundingClientRect();
      return input.top >= region.top && input.bottom <= region.bottom;
    })()`);
    assert.equal(visible, true);
    await key('Tab');
    await key('Tab');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'), 'continue');
    await key('Enter');
    assert.equal((await state()).submissions, 1);
    assertReservedSpace(await measure());
  });
  await t.test('caller-owned native form submission and back action remain usable', async () => {
    await load();
    await click('#first-input');
    await call('Input.insertText', { text: 'A synthetic description' });
    await click('#continue');
    await click('[aria-label="Go back"]');
    assert.deepEqual(await state(), { value: 'A synthetic description', submissions: 1, backs: 1 });
  });
  for (const query of ['loading', 'disabled']) {
    await t.test(`${query} footer behavior remains controlled by its child`, async () => {
      await load(query);
      assert.equal(await evaluate('document.getElementById("continue").disabled'), true);
      assert.equal(await evaluate('document.getElementById("continue").getAttribute("aria-busy")'), query === 'loading' ? 'true' : null);
      await click('#continue');
      assert.equal((await state()).submissions, 0);
      assertReservedSpace(await measure());
    });
  }
  await t.test('dynamic error/footer content changes body space without losing state', async () => {
    await load();
    await click('#first-input');
    await call('Input.insertText', { text: 'Keep this value' });
    const before = await measure();
    await click('#toggle-error');
    assert.equal(await evaluate('document.querySelector("[role=alert]").textContent'), 'Caller-owned error message.');
    await click('#toggle-footer');
    const withoutFooter = await measure();
    assert.equal(withoutFooter.footer, null);
    assert(withoutFooter.body.height > before.body.height);
    await click('#toggle-footer');
    assert.equal((await state()).value, 'Keep this value');
    assertReservedSpace(await measure());
  });
  await t.test('resizing the available viewport preserves focused input and visible actions', async () => {
    await load();
    await click('#first-input');
    await call('Input.insertText', { text: 'Retained through resize' });
    for (const height of [420, 844]) {
      await call('Emulation.setDeviceMetricsOverride', { width: 390, height, deviceScaleFactor: 1, mobile: true });
      await wait(100);
      assertReservedSpace(await measure());
      assert.equal(await evaluate('document.activeElement.id'), 'first-input');
      assert.equal((await state()).value, 'Retained through resize');
    }
  });
  await t.test('empty content and caller classes retain the layout structure', async () => {
    await load('empty&no-footer');
    assert.equal(await evaluate('document.querySelector("#layout").classList.contains("fixture-layout")'), true);
    assert.equal(await evaluate(`document.querySelector('${body}').classList.contains('fixture-body')`), true);
    assert.equal(await evaluate('document.querySelector("#layout").getAttribute("aria-label")'), 'Review page');
    assert.equal(await evaluate(`document.querySelector('${body}').textContent.includes('No details to review.')`), true);
    const { nodes } = await call('Accessibility.getFullAXTree');
    assert(nodes.some(node => node.role?.value === 'main' && node.name?.value === 'Review page'));
    assert(nodes.some(node => node.role?.value === 'region' && node.name?.value === 'Review information'));
    assertReservedSpace(await measure());
  });
});
