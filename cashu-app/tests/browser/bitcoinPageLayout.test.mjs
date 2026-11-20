import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = {
  name: 'bitcoin-page-layout-boundaries',
  setup(build) {
    build.initialOptions.define = { 'import.meta.env': '{}' };
    const path = fileURLToPath(new URL('./bitcoinPageLayout.boundaries.ts', import.meta.url));
    build.onResolve({ filter: /^(@yudiel\/react-qr-scanner|react-hot-toast)$/ }, () => ({ path }));
    build.onResolve({ filter: /\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService|utils\/clipboard)$/ }, () => ({ path }));
  },
};

// Keep each browser lifetime bounded; route and receive cases use fresh profiles.
for (const group of ['forms', 'routes', 'receive']) {
  test(`Bitcoin page layout: ${group}`, { timeout: 60000 }, async t => {
    const { call, evaluate, open } = await createBrowserFixture(
      t, new URL('./bitcoinPageLayout.fixture.tsx', import.meta.url), 'body', [boundaries],
    );
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`,
    });
    const header = '.bitcoin-page h1';
    const action = '.bitcoin-primary';
    let scenario = 0;
    const load = async (query = '', width = 390, height = 844, insets = {}) => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await call('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets } });
      await open(`${query}&fixture-case=${scenario++}`);
      await wait(400);
      assert.deepEqual(await evaluate('window.fixtureErrors'), []);
    };
    const click = async (selector, text) => {
      const point = await evaluate(`(() => {
      const elements=[...document.querySelectorAll(${JSON.stringify(selector)})];
      const element=${text === undefined ? 'elements[0]' : `elements.find(e=>e.textContent.trim()===${JSON.stringify(text)})`};
      element.scrollIntoView({block:'nearest'});
      const rect=element.getBoundingClientRect();
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    })()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
      await wait(100);
    };
    const measure = () => evaluate(`(() => {
    const rect=selector=>{
      const element=typeof selector==='string' ? document.querySelector(selector) : selector;
      if(!element)return null;
      const box=element.getBoundingClientRect(),style=getComputedStyle(element);
      return {x:box.x,y:box.y,width:box.width,height:box.height,color:style.color,
        background:style.backgroundColor,padding:style.padding,font:style.font,
        border:style.border,shadow:style.boxShadow};
    };
    const title=document.querySelector('${header}');
    const pageHeader=title?.closest('.bitcoin-page-header') || title?.parentElement.parentElement.parentElement;
    return {header:rect(pageHeader),body:rect('.bitcoin-body'),action:rect('${action}'),
      field:rect('.bitcoin-payment-input textarea'),mint:rect('[aria-label="Choose mint"]'),
      amount:rect('.bitcoin-amount-display'),keypad:rect('.bitcoin-keypad'),review:rect('.bitcoin-review')};
  })()`);
    const visible = async selector => {
      assert.equal(await evaluate(`(() => {
      const element=document.querySelector(${JSON.stringify(selector)});
      if(!element)return false;
      const box=element.getBoundingClientRect(),nav=document.getElementById('fixture-navigation').getBoundingClientRect();
      return box.width>0 && box.height>0 && box.top>=nav.bottom && box.bottom<=innerHeight
        && box.left>=0 && box.right<=innerWidth;
    })()`), true, selector + ' must be visible below navigation');
    };
    const assertPage = async () => {
      await visible(header);
      await visible(action);
      assert.equal(await evaluate('scrollY'), 0);
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
      assert.equal(await evaluate('bitcoinFixture.submissions'), 0);
    };
    const capture = async name => {
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      await wait(250);
      if (!process.env.BITCOIN_LAYOUT_SNAPSHOT_DIR) return;
      await writeFile(join(process.env.BITCOIN_LAYOUT_SNAPSHOT_DIR, name + '.json'), JSON.stringify(await measure()));
      const screenshot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(process.env.BITCOIN_LAYOUT_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
    };
    const flows = [{ name: 'send', query: '' }, { name: 'amount', query: 'onchain' }, { name: 'receive', query: 'receive' }];
    if (group === 'forms') for (const flow of flows) {
      for (const theme of ['dark', 'light']) {
        for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
          await t.test(`${flow.name} ${theme} ${width}x${height} preserves presentation and navigation`, async () => {
            await load(`${flow.query}&theme=${theme}`, width, height);
            await assertPage();
            const initial = await measure();
            assert.equal(initial.body.width, initial.header.width);
            const name = `${flow.name}-${theme}-${width}-${height}`;
            await capture(name);
            if (flow.name === 'amount') {
              await click(action, 'Review On-Chain Send');
              assert.equal(await evaluate(`document.querySelector('${header}').textContent`), 'Review Bitcoin send');
              await assertPage();
              await capture(name + '-review');
              if (height <= 520) {
                await call('Emulation.setDeviceMetricsOverride', { width, height: 360, deviceScaleFactor: 1, mobile: true });
                await wait(100);
                const before = await measure();
                const point = await evaluate(`(() => {const r=document.querySelector('.bitcoin-body').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
                await call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 600 });
                await wait(200);
                assert(await evaluate('document.querySelector(".bitcoin-body").scrollTop>0'));
                const after = await measure();
                assert.deepEqual(after.header, before.header);
                assert.deepEqual(after.action, before.action);
              }
              await click('[aria-label="Go back"]');
              assert.equal(await evaluate('!!document.querySelector(".bitcoin-keypad")'), true);
              await click('[aria-label="Go back"]');
              assert.equal(await evaluate('!!document.querySelector(".bitcoin-payment-input textarea")'), true);
              assert.equal(await evaluate('document.getElementById("route").textContent'), '/send-bitcoin');
            }
          });
        }
      }
    }
    if (group === 'routes') for (const receive of [false, true]) {
      for (const theme of ['dark', 'light']) {
        for (const width of [390, 1024]) {
          await t.test(`empty ${receive ? 'receive' : 'send'} ${theme} ${width}px keeps setup and back links`, async () => {
            const query = `empty&theme=${theme}${receive ? '&receive' : ''}`;
            await load(query, width, 480);
            await visible(header);
            await visible('a[href="/mints"]');
            await capture(`empty-${receive ? 'receive' : 'send'}-${theme}-${width}`);
            await click('a[href="/mints"]');
            assert.equal(await evaluate('document.getElementById("route").textContent'), '/mints');
            await load(query, width, 480);
            await click('[aria-label="Go back"]');
            assert.equal(await evaluate('document.getElementById("route").textContent'), '/');
          });
        }
      }
      for (const history of [false, true]) {
        await t.test(`${receive ? 'receive' : 'send'} back uses ${history ? 'history' : 'wallet fallback'}`, async () => {
          await load(`${receive ? 'receive&' : ''}${history ? 'history' : ''}`);
          await click('[aria-label="Go back"]');
          assert.equal(await evaluate('document.getElementById("route").textContent'), history ? '/previous' : '/');
        });
      }
    }
    if (group === 'forms') for (const flow of flows) {
      await t.test(`${flow.name} safe-area padding protects controls`, async () => {
        await load(flow.query, 390, 844, { top: 32, left: 44, right: 28, bottom: 34 });
        await assertPage();
        const actual = await measure();
        assert(actual.action.x >= 44);
        assert(actual.action.x + actual.action.width <= 390 - 28);
        assert(actual.action.y + actual.action.height <= 844 - 34);
      });
    }
    const contractQueries = group === 'forms' ? ['', 'receive'] : group === 'routes' ? ['empty', 'empty&receive'] : [];
    for (const query of contractQueries) {
      await t.test(`${query || 'send'} uses the shared layout header and named body`, async () => {
        await load(query);
        assert.equal(await evaluate('document.querySelector(".bitcoin-page").classList.contains("payment-page-layout")'), true);
        assert.equal(await evaluate('document.querySelector(".payment-page-layout__header h1")!==null'), true);
        assert.equal(await evaluate('document.querySelector(".payment-page-layout__body .bitcoin-page-header")===null'), true);
        assert.equal(await evaluate('document.querySelector(".payment-page-layout__body").getAttribute("aria-label")'), query.includes('empty') ? 'Bitcoin setup' : 'Bitcoin payment');
      });
    }
    if (group === 'receive') await t.test('receive modes preserve animated mint selection, QR and copy actions', async () => {
      await load('receive');
      await click('[aria-label="Choose mint"]');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-mint-picker-menu]")).animationName'), 'dropdown-expand-down');
      await click('[data-mint-picker-menu] button:nth-child(2)');
      await wait(250);
      const expectedRequests = [], expectedWrites = [];
      for (const onchain of [false, true]) {
        if (onchain) await click('.bitcoin-receive-mode button', 'On-Chain');
        for (const digit of ['3', '0', '0', '0']) await click('.bitcoin-keypad button', digit);
        await click(action, onchain ? 'Get Bitcoin Address' : 'Create Invoice');
        expectedRequests.push({ mode: onchain ? 'onchain' : 'lightning', amount: 3000, mint: 'https://mint-2.example.test' });
        assert.deepEqual(await evaluate('bitcoinFixture.receives'), expectedRequests);
        assert.equal(await evaluate('!!document.querySelector(\'.bitcoin-body svg[width="200"]\')'), true);
        await click('button', onchain ? 'Copy Address Only' : 'Copy Invoice');
        expectedWrites.push(onchain ? 'bc1qfixture' : 'lnbc1fixture');
        assert.deepEqual(await evaluate('pageFixture.writes'), expectedWrites);
        await click('button', 'Back');
        await assertPage();
      }
    });
  });
}
