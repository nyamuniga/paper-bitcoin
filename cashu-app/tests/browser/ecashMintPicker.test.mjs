// Uses production CSS: run with npm run test:ecash-mint-picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

// Retain old selectors so caller behavior can also be checked before migration.
const trigger = ':is([aria-controls="ecash-mint-options"], [aria-label="Choose mint"])';
const menu = ':is(#ecash-mint-options, [aria-label="Available mints"])';
const boundaries = {
  name: 'isolated-ecash-boundaries',
  setup(build) {
    build.onResolve({ filter: /\/(store\/wallet|hooks\/useEcash|hooks\/useEcashInvoice|hooks\/useUrEncoder|hooks\/useUrDecoder|EcashRequestPayment|utils\/clipboard)$/ }, () => ({
      path: fileURLToPath(new URL('./ecashMintPicker.boundaries.ts', import.meta.url)),
    }));
  },
};

async function createEcashFixture(t) {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./ecashMintPicker.fixture.tsx', import.meta.url), '#root', [boundaries],
  );
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixtureErrors=[];
    window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    window.addEventListener('unhandledrejection',e=>window.fixtureErrors.push(String(e.reason)));
  ` });
  const click = async (selector, text) => {
    const point = await evaluate(`(()=>{
      const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text === undefined ? 'true' : `b.textContent.trim()===${JSON.stringify(text)}`});
      if(!element) throw Error('Missing fixture control');
      const r=element.getBoundingClientRect();
      if(r.top<0||r.bottom>innerHeight) throw Error('Fixture control is outside the viewport: '+element.textContent);
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(200);
  };
  const viewport = (width, height = 844) => call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
  });
  const load = async (query, width = 390, height = 844) => {
    await viewport(width, height);await open(query);await wait(400);
    assert.deepEqual(await evaluate('window.fixtureErrors'), []);
    assert.equal(await evaluate('!!document.querySelector(".ecash-body")'), true);
  };
  const assertNoOperations = async () => {
    assert.deepEqual(await evaluate('({sends:window.ecashFixture.sends,claims:window.ecashFixture.claims,refreshes:window.ecashFixture.refreshes})'), { sends: [], claims: 0, refreshes: 0 });
  };
  const assertFits = async () => {
    const bounds = await evaluate(`(()=>{
      const m=document.querySelector('${menu}'),r=m.getBoundingClientRect(),b=document.querySelector('${trigger}').getBoundingClientRect();
      return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=7&&r.bottom<=innerHeight-7,
        aligned:Math.abs(r.left-b.left)<1&&Math.abs(r.width-b.width)<1,
        portal:m.parentElement===document.body,contentFits:m.scrollWidth<=m.clientWidth};
    })()`);
    assert.deepEqual(bounds, { fits: true, aligned: true, portal: true, contentFits: true });
  };
  return { call, evaluate, key, load, click, viewport, assertFits, assertNoOperations };
}

test('Ecash mint-picker callers and portal positioning', { timeout: 60000 }, async t => {
  const { call, evaluate, key, load, click, assertFits, assertNoOperations } = await createEcashFixture(t);
  for (const legacy of [false, true]) for (const receive of [false, true]) {
    await t.test(`${legacy ? 'legacy' : 'page'} ${receive ? 'receive' : 'send'} selection updates balance and hook mint`, async () => {
      await load(`${legacy ? 'legacy&' : ''}${receive ? 'receive' : ''}`);
      await click(trigger);await click(`${menu} button:nth-child(2)`);
      assert.equal(await evaluate('window.ecashFixture.activeMint'), 'https://mint-2.example.test/');
      assert.equal(await evaluate(`document.querySelector('${trigger}').textContent.includes('₿20,000')`), true);
      assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);
      if (receive) assert.equal(await evaluate('window.ecashFixture.invoiceMint'), 'https://mint-2.example.test/');
      if (legacy) {
        assert.equal(await evaluate('document.getElementById("route").textContent'), receive ? '/receive-ecash' : '/send-ecash');
        assert(Number(await evaluate('document.getElementById("closes").textContent')) >= 1);
      }
      await assertNoOperations();
    });
  }
  for (const legacy of [false, true]) for (const theme of ['dark', 'light']) for (const width of [390, 1024]) {
    await t.test(`${legacy ? 'legacy' : 'page'} ${theme} at ${width}px uses a viewport-bounded shared portal`, async () => {
      await load(`theme=${theme}${legacy ? '&legacy' : ''}`, width);await click(trigger);
      await assertFits();
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-current")'), 'true');
      assert.deepEqual(await evaluate(`(()=>{const m=document.querySelector('${menu}'),s=getComputedStyle(m),r=getComputedStyle(m.querySelectorAll('button')[1]);return {menu:s.animationName,item:r.animationName,delay:r.animationDelay}})()`),
        { menu: 'dropdown-expand-down', item: 'dropdown-item-reveal', delay: '0.03s' });
      if (process.env.ECASH_PICKER_SNAPSHOT_DIR) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.ECASH_PICKER_SNAPSHOT_DIR, `${legacy ? 'legacy' : 'page'}-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      await key('Escape');
      assert.equal(await evaluate(`document.querySelector('${menu}')===null && document.activeElement===document.querySelector('${trigger}')`), true);
      await assertNoOperations();
    });
  }
  await t.test('creating a synthetic send token hides the picker without changing the selected mint', async () => {
    await load('');await click(trigger);await click(`${menu} button:nth-child(2)`);
    await click('.ecash-number-pad button', '8');await click('.ecash-create', 'Create Token');
    assert.deepEqual(await evaluate('window.ecashFixture.sends'), [{ mint: 'https://mint-2.example.test/', amount: 8 }]);
    assert.equal(await evaluate(`document.querySelector('${trigger}')===null`), true);
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Token mint and amount"]')`), true);
    assert.equal(await evaluate('window.ecashFixture.claims'), 0);
  });
  await t.test('a busy request hides the picker through the existing child callback', async () => {
    await load('request-busy');
    assert.equal(await evaluate(`document.querySelector('${trigger}')===null`), true);
    await assertNoOperations();
  });
  for (const unknown of [false, true]) {
    await t.test(`receive preview auto-selects ${unknown ? 'an unlisted mint' : 'a matching trusted mint with a trailing slash'}`, async () => {
      await load('receive&preview' + (unknown ? '&unknown-mint' : ''));
      assert.equal(await evaluate('window.ecashFixture.activeMint'), unknown ? 'https://unknown-mint.example.test' : 'https://mint-2.example.test/');
      assert.equal(await evaluate('!!document.querySelector(".received-token-preview")'), true);
      assert.equal(await evaluate(`document.querySelector('${trigger}')===null`), true);
      await assertNoOperations();
    });
  }
  await t.test('pasted token still changes the mint and hides the picker only after a valid preview', async () => {
    await load('receive&paste-token');
    assert.equal(await evaluate(`!!document.querySelector('${trigger}')`), true);
    await click('button', 'Paste token');
    assert.equal(await evaluate('window.ecashFixture.activeMint'), 'https://mint-2.example.test/');
    assert.equal(await evaluate(`document.querySelector('${trigger}')===null`), true);
    assert.equal(await evaluate('!!document.querySelector(".received-token-preview")'), true);
    await assertNoOperations();
  });
});

// Give device-metric changes their own Chrome profile; later pointer checks must not inherit them.
test('Ecash page menu stays aligned after a short-viewport resize', { timeout: 30000 }, async t => {
  const { evaluate, key, load, click, viewport, assertFits } = await createEcashFixture(t);
  await load('');await click(trigger);await viewport(320, 480);await wait(150);
  await assertFits();await key('Escape');
  assert.equal(await evaluate(`document.querySelector('${menu}')===null`), true);
});

test('Ecash text fields have one unclipped focus indicator', { timeout: 60000 }, async t => {
  const { call, evaluate, key, load, click, assertNoOperations } = await createEcashFixture(t);
  const fields = [
    { name: 'description', query: 'receive', selector: '.ecash-invoice-entry input', anchor: '[aria-label="Scan ecash token"]' },
    { name: 'pubkey', query: '', selector: '#ecash-lock-pubkey', anchor: '[aria-label="Choose mint"]' },
    { name: 'token', query: 'receive&invalid-token', selector: 'textarea', anchor: '[aria-label="Scan ecash token"]' },
  ];
  const appearance = selector => evaluate(`(()=>{
    const input=document.querySelector(${JSON.stringify(selector)}),owner=input.tagName==='TEXTAREA'?input.parentElement:input;
    const s=getComputedStyle(owner),p=getComputedStyle(input,'::placeholder'),i=getComputedStyle(input),root=getComputedStyle(document.documentElement);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
    return {outline:s.outlineStyle,width:s.outlineWidth,offset:s.outlineOffset,color:rgba(s.outlineColor),shadow:s.boxShadow,
      background:rgba(s.backgroundColor),expectedBackground:rgba(root.getPropertyValue('--color-surface-container')),
      text:rgba(i.color),expectedText:rgba(root.getPropertyValue('--color-on-surface')),
      placeholder:rgba(p.color),placeholderOpacity:p.opacity,
      expectedFocus:rgba(root.getPropertyValue('--color-'+(document.documentElement.dataset.theme==='light'?'outline':'primary'))),
      childOutline:input===owner?null:i.outlineStyle,childShadow:input===owner?null:i.boxShadow,
      focused:document.activeElement===input,keyboard:input.matches(':focus-visible')};
  })()`);
  for (const field of fields) for (const theme of ['dark', 'light']) for (const width of [390, 1024]) {
    await t.test(`${field.name} ${theme} at ${width}px uses one inset stroke and readable field colors`, async () => {
      await load(`${field.query}&theme=${theme}`, width);
      const before = await evaluate(`(()=>{const r=document.querySelector('${field.selector}').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`);
      await evaluate(`document.querySelector('${field.anchor}').focus()`);await key('Tab');await wait(250);
      const actual = await appearance(field.selector);
      if (process.env.ECASH_FIELD_SNAPSHOT_DIR) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.ECASH_FIELD_SNAPSHOT_DIR, `${field.name}-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      assert.equal(actual.focused, true);assert.equal(actual.keyboard, true);
      assert.equal(actual.outline, 'solid');assert.equal(actual.width, '2px');assert.equal(actual.offset, '-2px');
      assert.equal(actual.shadow, 'none');assert.deepEqual(actual.color, actual.expectedFocus);
      assert.deepEqual(actual.background, actual.expectedBackground);assert.deepEqual(actual.text, actual.expectedText);
      assert.equal(actual.placeholderOpacity, '1');assert.equal(actual.placeholder[3], 255);
      assert(contrast(actual.placeholder, actual.background) >= 4.5);
      assert(contrast(actual.color, actual.background) >= 3);
      if (field.name === 'token') { assert.equal(actual.childOutline, 'none');assert.equal(actual.childShadow, 'none'); }
      assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('${field.selector}').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`), before);
      await evaluate(`document.querySelector('${field.selector}').blur()`);
      assert.equal((await appearance(field.selector)).outline, 'none');
      await assertNoOperations();
    });
  }
  await t.test('description typing, length limit and blur preserve its value', async () => {
    await load('receive');await click('.ecash-invoice-entry input');
    await call('Input.insertText', { text: 'Rent for June' });
    assert.equal(await evaluate('document.querySelector(".ecash-invoice-entry input").value'), 'Rent for June');
    await evaluate('document.querySelector(".ecash-invoice-entry input").select()');
    await call('Input.insertText', { text: 'x'.repeat(170) });
    assert.equal(await evaluate('document.querySelector(".ecash-invoice-entry input").value.length'), 160);
    await evaluate('document.querySelector(".ecash-invoice-entry input").blur()');
    assert.equal(await evaluate('document.querySelector(".ecash-invoice-entry input").value.length'), 160);
    await assertNoOperations();
  });
  await t.test('pubkey normalization remains unchanged', async () => {
    await load('');await click('#ecash-lock-pubkey');
    await call('Input.insertText', { text: 'a'.repeat(64) });
    assert.equal(await evaluate('document.getElementById("ecash-lock-pubkey").value'), '02' + 'a'.repeat(64));
    await assertNoOperations();
  });
  await t.test('editing and clearing an invalid token still returns to invoice entry', async () => {
    await load('receive&invalid-token');await click('textarea');
    await evaluate('document.querySelector("textarea").select()');await call('Input.insertText', { text: 'still-invalid' });
    assert.equal(await evaluate('document.querySelector("textarea").value'), 'still-invalid');
    await click('button', 'Clear');
    assert.equal(await evaluate('document.querySelector("textarea")===null'), true);
    assert.equal(await evaluate('document.querySelector(".ecash-request-panel").hidden'), false);
    await assertNoOperations();
  });
});
