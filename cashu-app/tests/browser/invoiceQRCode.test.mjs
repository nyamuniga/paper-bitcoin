import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

const require = createRequire(import.meta.url);
const encoder = require.resolve('react-qr-code');
const boundaries = {
  name: 'invoice-qr-boundaries',
  setup(build) {
    const path = fileURLToPath(new URL('./invoiceQRCode.boundaries.ts', import.meta.url));
    build.onResolve({ filter: /^(react-hot-toast)$|\/utils\/clipboard$/ }, () => ({ path }));
    build.onResolve({ filter: /^react-qr-code$/ }, () => ({ path: 'encoder', namespace: 'invoice-qr' }));
    build.onLoad({ filter: /.*/, namespace: 'invoice-qr' }, () => ({
      loader: 'js', resolveDir: dirname(encoder), contents: `
        import React from 'react';
        import QRCode from ${JSON.stringify(encoder)};
        export default function Encoder(props) {
          if (props.value.startsWith('fixture-render-error')) throw new Error('Synthetic QR failure');
          return React.createElement(QRCode, props);
        }
      `,
    }));
  },
};

test('pending invoice QR preserves presentation, actions and copy recovery', { timeout: 60000 }, async t => {
  const { call, evaluate, open, key } = await createBrowserFixture(
    t, new URL('./invoiceQRCode.fixture.tsx', import.meta.url), '#controls', [boundaries],
  );
  const copy = '#caller button.btn-secondary';
  const cancel = '#caller button.text-on-surface-variant';
  const qr = '#caller .bg-white > svg';
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`,
  });
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
  const load = async (query = '', width = 390, height = 844) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await open(query);
  };
  const snapshot = async name => {
    if (!process.env.INVOICE_QR_SNAPSHOT_DIR) return;
    await evaluate('window.scrollTo(0,0)');
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.INVOICE_QR_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  const assertOriginalQR = async () => {
    const actual = await evaluate(`(() => {
      const svg = document.querySelector('${qr}');
      const reference = document.querySelector('#reference svg');
      return {markup: svg?.outerHTML, reference: reference?.outerHTML,
        size: svg ? [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height] : [],
        fills: svg ? [...svg.querySelectorAll('path')].map(p => p.getAttribute('fill')) : []};
    })()`);
    assert(actual.markup, 'the caller must render a QR');
    assert.equal(actual.markup, actual.reference, 'payload and encoder output must match the original direct renderer');
    assert.deepEqual(actual.size, [200, 200]);
    assert.deepEqual(actual.fills, ['#FFFFFF', '#000000']);
    assert.equal(contrast([255, 255, 255], [0, 0, 0]), 21);
  };
  const feedback = () => evaluate('window.invoiceFixture');

  for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
      await t.test(`${theme} ${width}x${height} keeps QR output and the surrounding layout`, async () => {
        await load('theme=' + theme, width, height);
        await assertOriginalQR();
        assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Pay Lightning Invoice');
        assert.equal(await evaluate('document.querySelector("#caller main").textContent.includes("₿1,200")'), true);
        assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
        assert.deepEqual(await evaluate('window.fixtureErrors'), []);
        await snapshot(`${theme}-${width}-${height}`);
      });
    }
  }
  await t.test('new valid payloads update the QR and keep the SVG node', async () => {
    await load();
    await evaluate(`window.previousSVG=document.querySelector('${qr}');true`);
    await click('#second');
    await assertOriginalQR();
    assert.equal(await evaluate(`window.previousSVG===document.querySelector('${qr}')`), true);
    await click(copy);
    assert.deepEqual((await feedback()).writes, ['lnbc2fixture-only-not-payable']);
  });
  for (const target of [copy, '#caller [title="Click to copy"]']) {
    await t.test(`${target} copies the exact invoice and retains success feedback`, async () => {
      await load();
      await click(target);
      const actual = await feedback();
      assert.deepEqual(actual.writes, ['lnbc1fixture-only-not-payable']);
      assert.deepEqual(actual.successes, ['Invoice copied to clipboard']);
      assert.equal(await evaluate(`document.querySelector('${copy}').textContent`), 'Copied to Clipboard!');
    });
  }
  await t.test('keyboard activation still reaches the copy action', async () => {
    await load();
    await evaluate(`document.querySelector('${copy}').focus()`);
    await key('Enter');
    assert.deepEqual((await feedback()).writes, ['lnbc1fixture-only-not-payable']);
  });
  await t.test('thrown clipboard errors retain error feedback', async () => {
    await load('copy-error');
    await click(copy);
    assert.deepEqual((await feedback()).errors, ['Failed to copy invoice']);
    assert.deepEqual((await feedback()).successes, []);
  });
  await t.test('the existing false-result clipboard behavior is preserved', async () => {
    await load('copy-false');
    await click(copy);
    assert.deepEqual((await feedback()).successes, ['Invoice copied to clipboard']);
  });
  await t.test('status, cancellation, loading and feedback remain caller-owned', async () => {
    await load('feedback');
    await click('#caller button.btn-primary');
    await click(cancel);
    assert.equal((await feedback()).checks, 1);
    assert.equal((await feedback()).cancels, 1);
    await click('#loading');
    assert.equal(await evaluate('document.querySelector("#caller button.btn-primary").disabled'), true);
    assert.equal(await evaluate(`document.querySelector('${cancel}').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('${copy}').disabled`), false);
    await click('#error');
    assert.equal(await evaluate('document.querySelector("#caller").textContent.includes("Synthetic invoice status error")'), true);
    assert.equal(await evaluate('document.querySelector("#caller").textContent.includes("Synthetic status detail")'), true);
    await load('no-cancel');
    assert.equal(await evaluate('document.querySelector("#caller").textContent.includes("Cancel & Choose")'), false);
  });
  await t.test('exactly 2000 bytes still encode and copy without truncation', async () => {
    await load();
    await click('#long');
    await assertOriginalQR();
    await click(copy);
    assert.deepEqual((await feedback()).writes, ['lnbc' + 'a'.repeat(1996)]);
  });
  for (const [button, title] of [['oversized', 'Data too large for QR'], ['failure', 'QR Code Unavailable']]) {
    for (const theme of ['dark', 'light']) {
      await t.test(`${theme} ${button} has an actionable fallback, exact copy and payload recovery`, async () => {
        await load('theme=' + theme);
        await click('#' + button);
        const actual = await evaluate(`(() => {
          const container=document.querySelector('#caller .bg-white');
          const fallback=container?.firstElementChild;
          return {text: container?.textContent, width: fallback?.getBoundingClientRect().width,
            height: fallback?.getBoundingClientRect().height,
            background: fallback ? getComputedStyle(fallback).backgroundColor : '',
            foregrounds: fallback ? [...fallback.querySelectorAll('p')].map(p => getComputedStyle(p).color) : []};
        })()`);
        assert(actual.text?.includes(title), 'the page should retain the QR fallback instead of crashing');
        assert(actual.text.includes('Use Copy Lightning Invoice below to copy the invoice.'));
        assert.equal(actual.width, 200);
        assert.equal(actual.height, 200);
        const background = actual.background.match(/[\d.]+/g).map(Number);
        assert.equal(background[3] ?? 1, 1, 'fallback surface must be opaque inside the white frame');
        assert.equal(actual.foregrounds.length, 2);
        for (const color of actual.foregrounds) {
          const foreground = color.match(/[\d.]+/g).map(Number);
          assert.equal(foreground[3] ?? 1, 1);
          assert(contrast(foreground, background) >= 4.5, 'fallback instructions must be readable in both themes');
        }
        assert.equal(await evaluate(`document.querySelector('${copy}').disabled`), false);
        await click(copy);
        assert.deepEqual((await feedback()).writes, [button === 'oversized' ? 'lnbc' + 'a'.repeat(1997) : 'fixture-render-error-invoice']);
        await snapshot(`${theme}-${button}`);
        await click('#second');
        await assertOriginalQR();
      });
    }
  }
});
