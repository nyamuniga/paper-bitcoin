import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = {
  name: 'action-menu-synthetic-boundaries',
  setup(build) {
    const path = fileURLToPath(new URL('./actionMenu.boundaries.ts', import.meta.url));
    build.onResolve({ filter: /\/(store\/(wallet|currencyStore)|hooks\/(useStableBalance|useMintInfo))$|^@tauri-apps\/api\/core$/ }, () => ({ path }));
    if (process.env.ACTION_MENU_ORDER_PROBE) build.onLoad({ filter: /ActionMenuModal\.tsx$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace('opt.onClick(); close();', 'close(); opt.onClick();'), loader: 'tsx',
    }));
  },
};

async function setup(t) {
  const browser = await createBrowserFixture(t, new URL('./actionMenu.fixture.tsx', import.meta.url), '#fixture', [boundaries]);
  const { call, evaluate, open } = browser;
  const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1, buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1, buttons: 0 });
    await wait(30);
  };
  const show = async (query = '') => {
    await open(query); await call('Page.bringToFront');
    assert.equal(await evaluate('document.visibilityState'), 'visible');
    if (!query.includes('card')) await click('#opener');
    await wait(380);
  };
  const until = async expression => {
    for (let attempt = 0; attempt < 30; attempt++) { if (await evaluate(expression)) return; await wait(50); }
    assert.fail(`Timed out: ${expression}`);
  };
  const swipe = async (kind = 'touch', cancel = false) => {
    const point = await evaluate(`(()=>{const r=document.querySelector('h2').parentElement.getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2}})()`);
    if (kind === 'touch') {
      await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 110 }] });
      await call('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    } else {
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y + 110, buttons: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y + 110, button: 'left', buttons: 0, clickCount: 1 });
    }
    await wait(30);
  };
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { ...browser, click, show, until, swipe };
}

for (const theme of ['dark', 'light']) test(`action menu preserves ${theme} presentation`, { timeout: 45000 }, async t => {
  const { call, evaluate, show } = await setup(t);
  for (const [width, height] of [[320, 568], [390, 480], [1024, 844]]) for (const menu of ['Send', 'Receive']) {
    await t.test(`${menu} ${width}×${height}`, async () => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
      await show(`theme=${theme}&menu=${menu}`);
      const record = await evaluate(`(()=>{
        const panel=document.querySelector('h2').parentElement.parentElement, backdrop=panel.parentElement;
        const elements=[backdrop,panel,...panel.querySelectorAll('*')];
        const fields=['backgroundColor','color','font','padding','gap','borderRadius','borderColor','borderWidth','boxShadow','backdropFilter','overflow','transform','transition'];
        const styles=elements.map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,text:el.childElementCount?null:el.textContent,rect:[r.x,r.y,r.width,r.height],styles:Object.fromEntries(fields.map(k=>[k,s[k]]))}});
        const r=panel.getBoundingClientRect();return {styles,clip:{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(innerWidth,r.right)-Math.max(0,r.x),height:Math.min(innerHeight,r.bottom)-Math.max(0,r.y)}};
      })()`);
      const key = `${theme}-${menu}-${width}-${height}`;
      for (const directory of [process.env.ACTION_MENU_CAPTURE, process.env.ACTION_MENU_COMPARE].filter(Boolean)) {
        if (directory === process.env.ACTION_MENU_CAPTURE) {
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, `${key}.json`), JSON.stringify(record));
          const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { ...record.clip, scale: 1 } });
          await writeFile(join(directory, `${key}.png`), Buffer.from(data, 'base64'));
        } else {
          assert.deepEqual(record, JSON.parse(await readFile(join(directory, `${key}.json`), 'utf8')));
          const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { ...record.clip, scale: 1 } });
          assert.deepEqual(Buffer.from(data, 'base64'), await readFile(join(directory, `${key}.png`)));
        }
      }
      assert.equal(record.styles[1].styles.transition, 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)');
      const desktop = width >= 640;
      const panel = record.styles[1];
      const expectedHeight = menu === 'Send' ? (desktop ? 484.875 : 524.25) : (desktop ? 391.5 : 430.875);
      assert.deepEqual(panel.rect, [(width - Math.min(width, 480)) / 2, (height - expectedHeight) / (desktop ? 2 : 1), Math.min(width, 480), expectedHeight]);
      assert.equal(panel.styles.padding, desktop ? '0px 0px 17px' : '0px 0px 34px');
      assert.equal(panel.styles.borderRadius, desktop ? '17px' : '28px 28px 0px 0px');
      assert.equal(panel.styles.color, theme === 'dark' ? 'rgb(247, 244, 235)' : 'rgb(11, 21, 17)');
      assert.equal(panel.styles.borderColor, 'rgb(20, 45, 32)');
      assert.equal(panel.styles.backdropFilter, 'blur(24px)');
      assert.equal(panel.styles.overflow, 'hidden');
      assert.equal(record.styles[0].styles.padding, desktop ? '17px' : '0px');
      assert.deepEqual(await evaluate('Array.from(document.querySelector("h2").parentElement.parentElement.querySelectorAll("button")).slice(1).map(b=>b.textContent)'), menu === 'Send' ? ['Printable Note', 'Ecash', 'Bitcoin', 'Cash Out'] : ['Ecash', 'Bitcoin', 'Top Up']);
    });
  }
});

test('action menu shell contract and lifecycle', { timeout: 45000 }, async t => {
  const { evaluate, call, key, show, click, until, swipe } = await setup(t);
  await t.test('named dialog, labelled close button, initial focus and Tab containment', async () => {
    await show('menu=Receive');
    const { nodes } = await call('Accessibility.getFullAXTree');
    assert.equal(nodes.find(node => node.role?.value === 'dialog' && !node.ignored)?.name?.value, 'Receive');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close Receive menu');
    await key('Tab'); assert.equal(await evaluate('document.activeElement.textContent'), 'Ecash');
    await evaluate('document.querySelectorAll("h2")[0].parentElement.parentElement.querySelectorAll("button")[3].focus();true');
    await key('Tab'); assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close Receive menu');
    await key('Escape'); await until('!document.querySelector("h2")');
    assert.equal(await evaluate('document.activeElement.id'), 'opener');
  });
  await t.test('option callback precedes animated close and a no-navigation callback still dismisses', async () => {
    await show(); await click('h2 ~ button');
    await until('!document.querySelector("h2")');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['close']);
    await show(); await click('h2'); // Heading interaction does not dismiss.
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Ecash").click();true');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['Ecash']);
    await until('!document.querySelector("h2")');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['Ecash', 'close']);
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
  await t.test('option callback finishes before dismissal is requested', async () => {
    await show('probe-order');
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Ecash").click();true');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['Ecash', 'option-complete']);
    await until('!document.querySelector("h2")');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['Ecash', 'option-complete', 'close']);
  });
  await t.test('backdrop dismisses without running an option', async () => {
    await show();
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
    await until('!document.querySelector("h2")');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['close']);
  });
  for (const kind of ['touch', 'mouse']) await t.test(`${kind} header dismissal preserves first-press reopening`, async () => {
    await show(); await swipe(kind); await click('#opener'); await wait(380);
    assert.equal(await evaluate('document.getElementById("presses").textContent'), '2');
    assert.deepEqual(await evaluate('window.actionFixture.events'), ['close']);
    assert.equal(await evaluate('!!document.querySelector("h2")'), true);
  });
  await t.test('cancelled drag stays usable; unmount cancels pending close callback', async () => {
    await show(); await swipe('touch', true); await wait(350);
    assert.deepEqual(await evaluate('window.actionFixture.events'), []);
    await key('Escape'); await evaluate('window.actionFixture.unmount()'); await wait(350);
    assert.deepEqual(await evaluate('window.actionFixture.events'), []);
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
  await t.test('reduced motion retains dismiss and focus-return cleanup', async () => {
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await show();
    assert.equal(await evaluate('getComputedStyle(document.querySelector("h2").parentElement.parentElement).transitionDuration'), '0s');
    await key('Escape'); await until('!document.querySelector("h2")');
    assert.equal(await evaluate('document.activeElement.id'), 'opener');
  });
});

for (const menu of ['Send', 'Receive']) test(`wallet card ${menu} routes`, { timeout: 45000 }, async t => {
  const { evaluate, show, until, key } = await setup(t);
  const routes = menu === 'Send' ? [['Printable Note', '/issue'], ['Ecash', '/send-ecash'], ['Bitcoin', '/send-bitcoin'], ['Cash Out', '/cash-out']]
    : [['Ecash', '/receive-ecash'], ['Bitcoin', '/receive-bitcoin'], ['Top Up', '/top-up']];
  for (const [label, path] of routes) await t.test(`${label} forwards the expected route and mint`, async () => {
    await show('card');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(menu)}).click();true`); await wait(380);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)}).click();true`);
    await until('!!document.getElementById("destination")');
    assert.deepEqual(await evaluate('JSON.parse(document.getElementById("destination").textContent)'), { path, state: path === '/issue' ? null : { mintUrl: 'https://fixture.invalid' } });
    await wait(300); assert.equal(await evaluate('!!document.querySelector("h2") || document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
  await t.test('native keyboard opens the menu and Escape returns to the actual card trigger', async () => {
    await show('card');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(menu)}).focus();true`);
    await key('Enter'); await wait(380);
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), `Close ${menu} menu`);
    await key('Escape'); await until('!document.querySelector("h2")');
    assert.equal(await evaluate('document.activeElement.textContent'), menu);
  });
  await t.test('missing mint retains the existing guarded callback and dismissal', async () => {
    await show('card&empty');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(menu)}).click();true`); await wait(380);
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Ecash").click();true');
    await until('!document.querySelector("h2")');
    assert.equal(await evaluate('!!document.getElementById("destination")'), false);
  });
});
