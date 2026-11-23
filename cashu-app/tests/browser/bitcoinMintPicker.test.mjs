// Uses production CSS: run with npm run test:bitcoin-mint-picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const trigger = '.bitcoin-body > div:first-child button';
// Keep the old selector so the same caller checks can run against the pre-migration view.
const menu = ':is([aria-label="Available mints"], .animate-dropdown-expand)';
const boundaries = {
  name: 'isolated-bitcoin-boundaries',
  setup(build) {
    build.onResolve({ filter: /\/(store\/wallet|hooks\/useBitcoin|hooks\/useHistory|services\/sparkService|hooks\/useLnurlValidation|services\/lnurlService)$/ }, () => ({
      path: fileURLToPath(new URL('./bitcoinMintPicker.boundaries.ts', import.meta.url)),
    }));
  },
};

test('Bitcoin mint-picker caller selection and locking', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./bitcoinMintPicker.fixture.tsx', import.meta.url), '.bitcoin-body', [boundaries],
  );
  const click = async (selector, text) => {
    const point = await evaluate(`(()=>{
      const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text === undefined ? 'true' : `b.textContent.trim()===${JSON.stringify(text)}`});
      if(!element) throw Error('Missing fixture control');
      const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(200);
  };
  const load = async (query, width = 390) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
    await open(query);await wait(400);
  };
  const assertNoSubmission = async () => assert.equal(await evaluate('window.bitcoinFixture.submissions'), 0);
  const selectSecond = async () => {
    await click(trigger);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${menu}')).animationName`), 'dropdown-expand-down');
    await click(`${menu} button:nth-child(2)`);
    assert.equal(await evaluate('window.bitcoinFixture.activeMint'), 'https://mint-2.example.test');
    assert.equal(await evaluate(`document.querySelector('${trigger}').textContent.includes('₿20,000')`), true);
    assert.equal(await evaluate(`document.querySelector('${menu}') === null`), true);
    await assertNoSubmission();
  };
  const receiveAmount = async () => {
    for (const digit of ['3', '0', '0', '0']) await click('.bitcoin-keypad button', digit);
  };

  for (const legacy of [false, true]) for (const receive of [false, true]) {
    await t.test(`${legacy ? 'legacy' : 'page'} ${receive ? 'receive' : 'send'} selection reaches the Bitcoin hook`, async () => {
      await load(`${legacy ? 'legacy&' : ''}${receive ? 'receive' : ''}`);
      await selectSecond();
      if (legacy) {
        assert.equal(await evaluate('document.getElementById("route").textContent'), receive ? '/receive-bitcoin' : '/send-bitcoin');
        assert(Number(await evaluate('document.getElementById("closes").textContent')) >= 1);
      }
    });
  }
  for (const legacy of [false, true]) for (const theme of ['dark', 'light']) for (const width of [390, 1024]) {
    await t.test(`${legacy ? 'legacy' : 'page'} ${theme} at ${width}px uses the animated shared portal, selected-row focus and Escape`, async () => {
      await load(`${legacy ? 'legacy&' : ''}theme=${theme}`, width);await click(trigger);
      assert.equal(await evaluate(`document.querySelector('[aria-label="Available mints"]')?.parentElement===document.body`), true);
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-current")'), 'true');
      assert.deepEqual(await evaluate(`(()=>{const m=document.querySelector('${menu}'),s=getComputedStyle(m),r=getComputedStyle(m.querySelectorAll('button')[1]);return {name:s.animationName,duration:s.animationDuration,item:r.animationName,delay:r.animationDelay}})()`),
        { name: 'dropdown-expand-down', duration: '0.24s', item: 'dropdown-item-reveal', delay: '0.03s' });
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=7&&r.bottom<=innerHeight-7})()`), true);
      if (process.env.BITCOIN_PICKER_SNAPSHOT_DIR) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.BITCOIN_PICKER_SNAPSHOT_DIR, `${legacy ? 'legacy' : 'page'}-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      await key('Escape');
      assert.equal(await evaluate(`document.querySelector('${menu}')===null && document.activeElement===document.querySelector('${trigger}')`), true);
    });
  }
  for (const busy of ['paying', 'requesting']) {
    await t.test(`page picker remains locked while ${busy}`, async () => {
      await load(busy);
      assert.equal(await evaluate(`document.querySelector('${trigger}').disabled`), true);
      await click(trigger);
      assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);
      assert.equal(await evaluate('window.bitcoinFixture.activeMint'), 'https://mint-1.example.test');
    });
  }
  await t.test('page picker remains locked while fetching a Lightning invoice', async () => {
    await load('lnurl');await click('.bitcoin-primary', 'Next');
    await click('.bitcoin-primary', 'Pay Lightning');
    assert.equal(await evaluate(`document.querySelector('${trigger}').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);
    await assertNoSubmission();
  });
  await t.test('page picker stays hidden during on-chain confirmation and returns on Back', async () => {
    await load('onchain');await selectSecond();
    await click('.bitcoin-primary', 'Review On-Chain Send');
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-review")'), true);
    assert.equal(await evaluate('document.querySelector(".bitcoin-mint-row")===null'), true);
    await click('[aria-label="Go back"]');
    assert.equal(await evaluate(`document.querySelector('${trigger}').disabled`), false);
    assert.equal(await evaluate('window.bitcoinFixture.activeMint'), 'https://mint-2.example.test');
    await assertNoSubmission();
  });
  for (const onchain of [false, true]) {
    await t.test(`page picker stays hidden after generating ${onchain ? 'a Bitcoin address' : 'an invoice'}`, async () => {
      await load('receive');await selectSecond();
      if (onchain) await click('.bitcoin-receive-mode button', 'On-Chain');
      await receiveAmount();
      await click('.bitcoin-primary', onchain ? 'Get Bitcoin Address' : 'Create Invoice');
      assert.equal(await evaluate('document.querySelector(".bitcoin-mint-row")===null'), true);
      assert.deepEqual(await evaluate('window.bitcoinFixture.receives'), [{ mode: onchain ? 'onchain' : 'lightning', amount: 3000, mint: 'https://mint-2.example.test' }]);
      await assertNoSubmission();
    });
  }
  await t.test('legacy mint changes retire the old address until another explicit request', async () => {
    await load('legacy&receive');await click('.bitcoin-receive-mode button', 'On-Chain');
    await receiveAmount();await click('.bitcoin-primary', 'Get Bitcoin Address');
    await selectSecond();
    assert.deepEqual(await evaluate('window.bitcoinFixture.receives'), [
      { mode: 'onchain', amount: 3000, mint: 'https://mint-1.example.test' },
    ]);
    assert.equal(await evaluate('!!document.querySelector(".bitcoin-receive-form")'), true);
    await click('.bitcoin-primary', 'Get Bitcoin Address');
    assert.deepEqual(await evaluate('window.bitcoinFixture.receives[1]'),
      { mode: 'onchain', amount: 3000, mint: 'https://mint-2.example.test' });
  });
});
