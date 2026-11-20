// Synthetic shell-only fixture. Run after building production CSS; no live callers are migrated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { contrast, createBrowserFixture, wait } from './browserFixture.mjs';

const entry = new URL('./bottomSheetShell.fixture.tsx', import.meta.url);
async function setup(t, plugins = []) {
  if (process.env.BOTTOM_SHEET_REGRESSION_PROBE) plugins.push({
    name: 'disable-tab-containment-in-temporary-bundle',
    setup(build) {
      build.onLoad({ filter: /useBottomSheetDialog\.ts$/ }, async ({ path }) => ({
        contents: (await readFile(path, 'utf8')).replace("event.key === 'Tab'", "event.key === '__disabledTab'"), loader: 'ts',
      }));
    },
  });
  const browser = await createBrowserFixture(t, entry, '#fixture', plugins);
  const { evaluate, call, open } = browser;
  const point = id => evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const click = async id => {
    const p = await point(id);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
    await wait(30);
  };
  const show = async (query = '') => {
    await open(query);
    // Repeated headless navigations can leave Chrome hidden, suspending requestAnimationFrame.
    await call('Page.bringToFront');
    assert.equal(await evaluate('document.visibilityState'), 'visible');
    if (!query.includes('mounted')) await click('opener');
    await wait(350);
  };
  const active = () => evaluate('document.activeElement.id');
  const state = () => evaluate('JSON.parse(document.getElementById("state").textContent)');
  const closed = async () => {
    // Chrome can defer the hook's 280ms timer after external-overlay focus changes.
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await state()).closes === 1) return;
      await wait(50);
    }
    assert.equal((await state()).closes, 1, 'close callback should finish within 1.5s');
  };
  const swipe = async (kind = 'touch', cancel = false) => {
    const p = await point('handle');
    if (kind === 'touch') {
      await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y + 110 }] });
      await call('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    } else {
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y + 110, button: 'left', buttons: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y + 110, button: 'left', buttons: 0, clickCount: 1 });
    }
    await wait(30);
  };
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { ...browser, click, show, active, state, swipe, closed };
}

test('bottom-sheet shell naming and keyboard focus', { timeout: 45000 }, async t => {
  const { call, evaluate, key, show, active } = await setup(t);
  await t.test('both name sources and description reach the accessibility tree', async () => {
    for (const query of ['', 'label']) {
      await show(query);
      const { nodes } = await call('Accessibility.getFullAXTree');
      const dialog = nodes.find(node => node.role?.value === 'dialog' && !node.ignored);
      assert.equal(dialog.name.value, 'Actions');
      assert.equal(dialog.description.value, 'Choose a synthetic action.');
      assert.equal(await evaluate('document.getElementById("sheet").getAttribute("aria-modal")'), 'true');
      assert.equal(await active(), 'close');
    }
  });
  await t.test('explicit focus skips unavailable targets and empty content focuses the panel', async () => {
    for (const [query, expected] of [['initial', 'initial'], ['initial&disabled-initial', 'close'], ['empty', 'sheet']]) {
      await show(query); assert.equal(await active(), expected);
    }
    await key('Tab'); assert.equal(await active(), 'sheet');
  });
  await t.test('Tab and Shift+Tab wrap, radio groups are usable, and outside focus is contained', async () => {
    await show();
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    // CDP uses bit 8 for Shift, matching the browser's native keyboard event.
    assert.equal(await active(), 'done');
    await key('Tab'); assert.equal(await active(), 'close');
    await key('Tab'); assert.equal(await active(), 'initial');
    await key('Tab'); assert.equal(await active(), 'radio-one');
    await key('ArrowRight'); assert.equal(await active(), 'radio-two');
    await key('Tab'); assert.equal(await active(), 'nested-opener');
    await evaluate('document.getElementById("outside").focus();true');
    assert.equal(await active(), 'nested-opener');
    await evaluate('document.getElementById("done").hidden=true;document.getElementById("ping").focus();true');
    await key('Tab'); assert.equal(await active(), 'close');
  });
  await t.test('a child editor can consume Escape without closing its sheet', async () => {
    await show('initial&editor'); await key('Escape');
    assert.equal(await evaluate('!!document.getElementById("sheet")'), true);
    assert.equal(await active(), 'initial');
  });
});

test('bottom-sheet shell dismissal and exit lifecycle', { timeout: 45000 }, async t => {
  const { evaluate, call, key, show, click, active, state, swipe } = await setup(t);
  await t.test('Escape restores its opener and calls cleanup once', async () => {
    await show(); await key('Escape'); await wait(300);
    assert.equal((await state()).closes, 1); assert.equal(await active(), 'opener');
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
  await t.test('button, backdrop and caller close share the same dismissal path', async () => {
    for (const id of ['close', 'done', null]) {
      await show();
      if (id) await click(id);
      else {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
      }
      await wait(300); assert.equal((await state()).closes, 1);
    }
  });
  await t.test('blocked dismissal guards every path while content remains usable; policy can change', async () => {
    await show('blocked'); await key('Escape'); await click('close'); await click('done'); await swipe();
    await evaluate('window.pageEscapes=0;document.addEventListener("keydown",e=>{if(e.key==="Escape")window.pageEscapes++});true');
    await key('Escape'); assert.equal(await evaluate('window.pageEscapes'), 0);
    await evaluate('document.querySelector(".bottom-sheet-backdrop").click();true');
    await click('ping');
    assert.equal((await state()).closes, 0); assert.equal((await state()).pings, 1);
    assert.equal(await evaluate('document.getElementById("close").disabled'), true);
    await evaluate('window.sheetFixture.setDismissible(true)'); await wait(30); await key('Escape'); await wait(300);
    assert.equal((await state()).closes, 1);
  });
  await t.test('mouse and touch dismissal allow the first press to reopen the same owner', async () => {
    for (const kind of ['mouse', 'touch']) {
      await show(); await swipe(kind);
      assert.equal(await evaluate('document.getElementById("content").dataset.closing'), 'true');
      await click('opener'); await wait(350);
      assert.deepEqual(await state(), { closes: 1, childCloses: 0, presses: 2, pings: 0 });
      assert.equal(await evaluate('document.getElementById("content").dataset.closing'), 'false');
    }
  });
  await t.test('touch cancellation preserves interaction; unmount cancels pending cleanup', async () => {
    await show(); await swipe('touch', true); await wait(350); await click('ping');
    assert.equal((await state()).pings, 1); assert.equal((await state()).closes, 0);
    await key('Escape'); await evaluate('window.sheetFixture.unmount()'); await wait(300);
    assert.equal((await state()).closes, 0);
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
  await t.test('the first touch after dismissal focuses an outside input', async () => {
    await show(); await swipe();
    const p = await evaluate('(()=>{const r=document.getElementById("outside").getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()');
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await active(), 'outside');
    await call('Input.insertText', { text: 'first touch' });
    assert.equal(await evaluate('document.getElementById("outside").value'), 'first touch');
  });
  await t.test('explicit return target, missing opener, and navigation focus are respected', async () => {
    await show('return-ref'); await key('Escape'); await wait(300); assert.equal(await active(), 'fallback');
    await show(); await evaluate('document.getElementById("opener").remove();true'); await key('Escape'); await wait(300);
    assert.equal(await evaluate('document.activeElement === document.body'), true);
    await show(); await evaluate('window.sheetFixture.navigate()'); await wait(50); assert.equal(await active(), 'fallback');
  });
});

test('bottom-sheet shell layered ownership', { timeout: 45000 }, async t => {
  const { evaluate, key, show, click, active, state, closed } = await setup(t);
  await t.test('only a nested top sheet owns focus/Escape and the parent keeps its scroll lock', async () => {
    await show(); await click('nested-opener'); await wait(350);
    assert.equal(await active(), 'child-close');
    assert.equal(await evaluate('document.getElementById("sheet").inert'), true);
    assert.equal(await evaluate('document.getElementById("sheet").hasAttribute("aria-modal")'), false);
    await key('Escape'); await wait(300);
    assert.equal((await state()).childCloses, 1); assert.equal((await state()).closes, 0);
    assert.equal(await active(), 'nested-opener');
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), true);
    await click('ping'); assert.equal((await state()).pings, 1);
  });
  await t.test('initial nested mounts retain correct ownership under StrictMode', async () => {
    await show('mounted&nested');
    assert.equal(await active(), 'child-close');
    assert.equal(await evaluate('document.getElementById("sheet").inert && !document.getElementById("nested").inert'), true);
    await key('Escape'); await wait(300);
    assert.equal((await state()).childCloses, 1); assert.equal((await state()).closes, 0);
    assert.equal(await evaluate('document.getElementById("sheet").contains(document.activeElement)'), true);
  });
  await t.test('explicit suspension hands focus/Escape to a foreign overlay, then resumes the sheet', async () => {
    await show(); await click('foreign-opener');
    assert.equal(await active(), 'foreign-close');
    assert.equal(await evaluate('document.getElementById("sheet").inert'), true);
    await key('Escape'); await wait(40);
    assert.equal((await state()).closes, 0); assert.equal(await active(), 'foreign-opener');
    await key('Escape');
    assert.equal(await evaluate('document.getElementById("sheet").style.transition'), 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)');
    await closed();
  });
  await t.test('a suspended nested sheet remains a barrier above lower owned sheets', async () => {
    await show(); await click('nested-opener'); await wait(350);
    assert.equal(await evaluate('!!document.getElementById("child-foreign")'), true);
    await click('child-foreign');
    assert.equal(await active(), 'foreign-close');
    assert.equal(await evaluate('document.querySelectorAll(".bottom-sheet-panel[aria-modal=true]").length'), 0);
    await key('Escape'); await wait(40); assert.equal(await active(), 'child-foreign');
    assert.equal((await state()).closes, 0); assert.equal((await state()).childCloses, 0);
    await key('Escape');
    for (let attempt = 0; attempt < 30 && !(await state()).childCloses; attempt++) await wait(50);
    assert.equal((await state()).childCloses, 1); assert.equal((await state()).closes, 0);
  });
});

test('bottom-sheet shell rendering and reduced motion', { timeout: 45000 }, async t => {
  const { call, evaluate, show, key, state } = await setup(t);
  for (const theme of ['dark', 'light']) for (const [width, height] of [[320, 568], [390, 480], [1024, 844]]) {
    await t.test(`${theme} ${width}×${height}: long content scrolls inside visible shell`, async () => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
      await show(`theme=${theme}&long`);
      const geometry = await evaluate(`(()=>{const s=document.getElementById('sheet'),c=document.getElementById('content'),d=document.getElementById('done'),r=s.getBoundingClientRect();c.scrollTop=c.scrollHeight;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrolled:c.scrollTop,body:document.documentElement.scrollWidth,done:d.getBoundingClientRect().bottom,skin:s.classList.contains('caller-panel'),transition:getComputedStyle(s).transitionDuration}})()`);
      assert(geometry.left >= -1 && geometry.right <= width + 1 && geometry.top >= -1 && geometry.bottom <= height + 1);
      assert(geometry.scrolled > 100); assert(geometry.done <= height); assert(geometry.body <= width); assert(geometry.skin);
      assert.equal(geometry.transition, '0.32s');
      const colors = await evaluate(`(()=>{const s=getComputedStyle(document.getElementById('sheet')),d=getComputedStyle(document.getElementById('done'));return [s.color,s.backgroundColor,d.color,d.backgroundColor].map(c=>c.match(/[\\d.]+/g).map(Number))})()`);
      assert(contrast(colors[0], colors[1]) >= 4.5); assert(contrast(colors[2], colors[3]) >= 4.5);
      if (process.env.BOTTOM_SHEET_SCREENSHOTS) {
        await mkdir(process.env.BOTTOM_SHEET_SCREENSHOTS, { recursive: true });
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.BOTTOM_SHEET_SCREENSHOTS, `${theme}-${width}-${height}.png`), Buffer.from(data, 'base64'));
      }
    });
  }
  await t.test('native wheel/touch scroll stays in content; safe-area padding remains caller-owned', async () => {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 568, deviceScaleFactor: 1, mobile: true });
    await call('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 34, left: 0 } });
    await show('long');
    const p = await evaluate('(()=>{const r=document.getElementById("content").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...p, deltaX: 0, deltaY: 200 }); await wait(150);
    assert(await evaluate('document.getElementById("content").scrollTop') > 0);
    await evaluate('document.getElementById("content").scrollTop=0;true');
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    for (const delta of [20, 40, 80]) { await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y - delta }] }); await wait(30); }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(100);
    assert(await evaluate('document.getElementById("content").scrollTop') > 0);
    assert.equal((await state()).closes, 0);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#sheet footer")).paddingBottom'), '34px');
  });
  await t.test('reduced motion removes shell transitions while preserving dismissal cleanup', async () => {
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await show();
    assert.deepEqual(await evaluate('[document.getElementById("sheet"),document.querySelector(".bottom-sheet-backdrop")].map(e=>getComputedStyle(e).transitionDuration)'), ['0s', '0s']);
    await key('Escape'); await wait(300); assert.equal((await state()).closes, 1);
    assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'), false);
  });
});
