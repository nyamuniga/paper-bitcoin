import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const require = createRequire(import.meta.url);
const actualEncoder = require.resolve('react-qr-code');
// Use the installed encoder for real payloads; throw only for synthetic failures.
const injectedFailure = {
  name: 'qr-render-failure',
  setup(build) {
    build.onResolve({ filter: /^react-qr-code$/ }, () => ({
      path: 'qr-encoder', namespace: 'fixture-qr',
    }));
    build.onLoad({ filter: /.*/, namespace: 'fixture-qr' }, () => ({
      loader: 'js', resolveDir: dirname(actualEncoder), contents: `
    import React from 'react';
    import QRCode from ${JSON.stringify(actualEncoder)};
    export default function Encoder(props) {
      window.encoderAttempts = window.encoderAttempts || [];
      window.encoderAttempts.push(props.value);
      if (props.value.startsWith('fixture-render-error')) throw new Error('Synthetic QR rendering failure');
      return React.createElement(QRCode, props);
    }
      `,
    }));
  },
};

test('SafeQRCode keeps a copy fallback and recovers when its payload changes', {timeout:60000}, async t => {
  const { call, evaluate, open } = await createBrowserFixture(
    t, new URL('./safeQRCode.fixture.tsx', import.meta.url), '#copy', [injectedFailure],
  );
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.fixtureErrors=[];addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`,
  });
  const click = async id => {
    const position = await evaluate(`(() => {
      const element = document.getElementById('${id}');
      element.scrollIntoView({block: 'nearest'});
      const rect = element.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', buttons: 0, clickCount: 1 });
    await wait(80);
  };
  const state = () => evaluate(`(() => {
    const root = document.getElementById('qr');
    const svg = root.querySelector('svg.fixture-qr');
    const element = svg || root.querySelector('div.fixture-qr');
    const rect = element.getBoundingClientRect();
    return {
      qr: !!svg, text: root.textContent, width: rect.width, height: rect.height,
      path: svg?.querySelector('path:last-child')?.getAttribute('d') ?? null,
    };
  })()`);
  const assertFallback = async (title, size = 180) => {
    const actual = await state();
    assert.equal(actual.qr, false);
    assert(actual.text.includes(title));
    assert.equal(actual.width, size);
    assert.equal(actual.height, size);
    assert(actual.text.includes('Copy this payment using the button below.'));
    await click('copy');
    assert.equal(await evaluate('document.getElementById("copy").disabled'), false);
  };
  const capture = async name => {
    if (!process.env.SAFE_QR_SNAPSHOT_DIR) return;
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.SAFE_QR_SNAPSHOT_DIR, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  };

  for (const theme of ['dark', 'light']) {
    for (const width of [390, 1024]) {
      await t.test(`${theme} at ${width}px preserves successful and fallback presentation`, async () => {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
        await open('theme=' + theme);
        const initial = await state();
        assert.equal(initial.qr, true);
        assert.equal(initial.width, 180);
        assert.equal(initial.height, 180);
        assert(initial.path.length > 0);
        await capture(`${theme}-${width}-valid`);
        await click('oversized');
        await assertFallback('Data too large for QR');
        assert.equal(await evaluate('document.getElementById("copied").textContent'), 'a'.repeat(2001));
        await capture(`${theme}-${width}-fallback`);
      });
    }
  }
  for (const [button, payload] of [['empty', ''], ['unicode', 'é'.repeat(1001)], ['emojiOversized', '😀'.repeat(501)]]) {
    await t.test(`${button} uses the existing UTF-8 guard and preserves copying`, async () => {
      await open('');
      await click(button);
      await assertFallback('Data too large for QR');
      assert.equal(await evaluate('document.getElementById("copied").textContent'), payload);
    });
  }
  for (const button of ['limit', 'emojiLimit']) {
    await t.test(`${button} reaches the real QR encoder at the 2000-byte limit`, async () => {
      await open('');
      await click(button);
      assert.equal((await state()).qr, true);
    });
  }
  await t.test('healthy payload updates change the QR while retaining the same SVG node', async () => {
    await open('');
    const before = await state();
    await evaluate('window.previousSVG=document.querySelector("#qr svg.fixture-qr");true');
    await click('second');
    const after = await state();
    assert.equal(after.qr, true);
    assert.notEqual(after.path, before.path);
    assert.equal(await evaluate('window.previousSVG===document.querySelector("#qr svg.fixture-qr")'), true);
  });
  await t.test('default size and copy instruction remain available without optional props', async () => {
    await open('default-props');
    assert.equal((await state()).width, 180);
    await click('oversized');
    const actual = await state();
    assert.equal(actual.qr, false);
    assert.equal(actual.width, 180);
    assert.equal(actual.height, 180);
    assert(actual.text.includes('Use the Copy button below to share this token'));
  });
  await t.test('empty/oversized guard fallbacks recover when a renderable payload arrives', async () => {
    for (const initial of ['initial-large', '']) {
      await open(initial);
      if (!initial) await click('empty');
      await click('second');
      assert.equal((await state()).qr, true);
    }
  });
  await t.test('a child render error has the existing copy instruction and leaves sibling actions usable', async () => {
    await open('');
    await click('failure');
    await assertFallback('QR Code Unavailable');
    assert.equal(await evaluate('document.getElementById("copied").textContent'), 'fixture-render-error-a');
  });
  await t.test('size and fallback-copy updates do not retry an unchanged failing payload', async () => {
    await open('initial-error');
    const attempts = await evaluate('window.encoderAttempts.length');
    await click('resize');
    await click('change-hint');
    const actual = await state();
    assert.equal(actual.qr, false);
    assert.equal(actual.width, 224);
    assert.equal(actual.height, 224);
    assert(actual.text.includes('Caller-updated copy instruction.'));
    assert(actual.text.includes('QR Code Unavailable'));
    assert.equal(await evaluate('window.encoderAttempts.length'), attempts);
  });
  await t.test('a new valid payload recovers from an initial renderer error', async () => {
    await open('initial-error');
    await click('second');
    assert.equal((await state()).qr, true);
  });
  await t.test('a new valid payload recovers after a healthy QR later fails', async () => {
    await open('');
    await click('failure');
    await assertFallback('QR Code Unavailable');
    await click('second');
    assert.equal((await state()).qr, true);
  });
  await t.test('consecutive failing payloads still allow later recovery', async () => {
    await open('initial-error');
    await click('anotherFailure');
    await assertFallback('QR Code Unavailable');
    assert.equal(await evaluate('window.encoderAttempts.includes("fixture-render-error-b")'), true);
    await click('first');
    assert.equal((await state()).qr, true);
    assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  });
});
