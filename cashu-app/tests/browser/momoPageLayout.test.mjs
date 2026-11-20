import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createBrowserFixture, wait } from './browserFixture.mjs';

const boundaries = {
  name: 'momo-page-boundaries',
  setup(build) {
    build.initialOptions.define = { 'import.meta.env': '{}' };
    const path = fileURLToPath(new URL('./momoPageLayout.boundaries.ts', import.meta.url));
    build.onResolve({ filter: /\/(store\/(wallet|transactionStore)|services\/(flowServices|proxyBalanceService)|components\/shared\/SovereignStampOverlay)$/ }, () => ({ path }));
  },
};

test('Mobile Money page uses the shared layout without changing its form workflow', { timeout: 120000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./momoPageLayout.fixture.tsx', import.meta.url), 'body', [boundaries],
  );
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`,
  });
  const phone = '#momo-page-phone';
  const action = '.momo-primary';
  const header = '.momo-page-header';
  const click = async (selector, text) => {
    const point = await evaluate(`(() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const element = ${text === undefined ? 'elements[0]' : `elements.find(e => e.textContent.includes(${JSON.stringify(text)}))`};
      element.scrollIntoView({block: 'nearest'});
      const rect = element.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await wait(60);
  };
  const load = async (query = '', width = 390, height = 844, insets = {}) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets } });
    await open(query);
    await wait(400);
    assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  };
  const fill = async () => {
    await click(phone);
    await call('Input.insertText', { text: '0780000000' });
    for (const digit of ['1', '0', '0', '0']) await click('.momo-page-keypad button', digit);
    assert.equal(await evaluate(`document.querySelector('${action}').disabled`), false);
  };
  const presentation = () => evaluate(`(() => {
    const measure = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        color: style.color, background: style.backgroundColor, font: style.font,
        padding: style.padding, margin: style.margin, border: style.border, shadow: style.boxShadow};
    };
    return {header: measure('${header}'), field: measure('${phone}'), mint: measure('[aria-label="Choose mint"]'),
      amount: measure('.momo-page-amount'), keypad: measure('.momo-page-keypad'),
      review: measure('.momo-review-content'), action: measure('${action}')};
  })()`);
  const visible = async selector => {
    const result = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const nav = document.getElementById('fixture-navigation').getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= nav.bottom && rect.bottom <= innerHeight
        && rect.left >= 0 && rect.right <= innerWidth;
    })()`);
    assert.equal(result, true, selector + ' must stay visible below navigation');
  };
  const assertPage = async () => {
    await visible(header);
    await visible(action);
    assert.equal(await evaluate('scrollY'), 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  };
  const capture = async name => {
    if (!process.env.MOMO_LAYOUT_SNAPSHOT_DIR) return;
    await writeFile(join(process.env.MOMO_LAYOUT_SNAPSHOT_DIR, name + '.json'), JSON.stringify(await presentation()));
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.MOMO_LAYOUT_SNAPSHOT_DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  for (const cashout of [false, true]) {
    for (const theme of ['dark', 'light']) {
      for (const [width, height] of [[390, 844], [1024, 844], [390, 480]]) {
        await t.test(`${cashout ? 'cashout' : 'top-up'} ${theme} ${width}x${height} keeps entry and review presentation`, async () => {
          await load(`theme=${theme}${cashout ? '&cashout' : ''}`, width, height);
          await click(phone);
          const focus = await evaluate(`(() => {
            const input=document.querySelector('${phone}');
            const style=getComputedStyle(input), rect=input.getBoundingClientRect();
            const outset=Math.max(0,parseFloat(style.outlineOffset)+parseFloat(style.outlineWidth));
            const paint={left:rect.left-outset,right:rect.right+outset,top:rect.top-outset,bottom:rect.bottom+outset};
            const clips=[];
            for(let parent=input.parentElement;parent;parent=parent.parentElement){
              const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
              if(css.overflowX!=='visible') clips.push(paint.left>=box.left && paint.right<=box.right);
              if(css.overflowY!=='visible') clips.push(paint.top>=box.top && paint.bottom<=box.bottom);
            }
            return {focused:input.matches(':focus-visible'),outline:style.outlineStyle,width:parseFloat(style.outlineWidth),clips};
          })()`);
          assert.equal(focus.focused, true);
          assert.equal(focus.outline, 'solid');
          assert(focus.width >= 2);
          assert(focus.clips.length > 0);
          assert(focus.clips.every(Boolean), 'the complete phone focus outline must fit inside clipping ancestors');
          await capture(`${cashout ? 'cashout' : 'top-up'}-${theme}-${width}-${height}-focused`);
          await fill();
          await assertPage();
          await visible(phone);
          await visible('.momo-page-keypad');
          const entry = await presentation();
          const controlWidth = height <= 520 ? (entry.header.width - 12) / 2 : entry.header.width;
          assert.equal(entry.action.width, controlWidth);
          assert.equal(entry.keypad.width, controlWidth);
          const name = `${cashout ? 'cashout' : 'top-up'}-${theme}-${width}-${height}`;
          await capture(name + '-entry');
          await click(action);
          assert.equal(await evaluate('document.querySelector("h1").textContent'), cashout ? 'Review cashout' : 'Review top-up');
          assert.equal(await evaluate('document.querySelector(".momo-review-details").textContent.includes("0780000000")'), true);
          assert.equal(await evaluate(`document.querySelector('${action}').textContent.trim()`), cashout ? 'Confirm cashout' : 'Confirm top-up');
          await assertPage();
          const review = await presentation();
          assert.equal(review.action.width, review.header.width);
          await capture(name + '-review');
          assert.deepEqual(await evaluate('momoPageFixture.submissions'), []);
          await click('[aria-label="Go back"]');
          assert.equal(await evaluate(`document.querySelector('${phone}').value`), '0780000000');
          assert.equal(await evaluate('momoPageFixture.closes'), 0);
        });
      }
    }
  }
  for (const cashout of [false, true]) {
    await t.test(`${cashout ? 'cashout' : 'top-up'} viewport shrink preserves focus, phone, keypad and action visibility`, async () => {
      await load(cashout ? 'cashout' : '');
      await fill();
      await click(phone);
      for (const height of [420, 360, 844]) {
        await call('Emulation.setDeviceMetricsOverride', { width: 390, height, deviceScaleFactor: 1, mobile: true });
        await wait(100);
        await visible(phone);
        await visible('.momo-page-keypad');
        await assertPage();
        assert.equal(await evaluate('document.activeElement.id'), 'momo-page-phone');
        assert.equal(await evaluate(`document.querySelector('${phone}').value`), '0780000000');
      }
    });
    await t.test(`${cashout ? 'cashout' : 'top-up'} keyboard/contact and animated mint selection still work`, async () => {
      await load(cashout ? 'cashout' : '');
      await click(phone);
      await key('Tab');
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Choose phone number from address book');
      await key('Enter');
      await wait(400);
      await click('button', 'Fixture phone contact');
      assert.equal(await evaluate(`document.querySelector('${phone}').value`), '0791234567');
      await click('[aria-label="Choose mint"]');
      assert.equal(await evaluate('!!document.querySelector("[data-mint-picker-menu]")'), true);
      const menu = await evaluate('getComputedStyle(document.querySelector("[data-mint-picker-menu]")).animationName');
      assert.notEqual(menu, 'none');
      await click('[data-mint-picker-menu] button:nth-child(2)');
      await wait(250);
      assert.equal(await evaluate('document.querySelector(\'[aria-label="Choose mint"]\').textContent.includes("Fixture Mint 2")'), true);
      assert.deepEqual(await evaluate('momoPageFixture.submissions'), []);
    });
    await t.test(`${cashout ? 'cashout' : 'top-up'} confirmation keeps its existing busy/back guard`, async () => {
      await load(cashout ? 'cashout' : '');
      await fill();
      await click(action);
      await click(action);
      assert.equal(await evaluate(`document.querySelector('${action}').disabled`), true);
      assert.equal(await evaluate('document.querySelector(\'[aria-label="Go back"]\').disabled'), true);
      assert.equal(await evaluate('momoPageFixture.submissions.length'), 1);
      assert.equal(await evaluate('momoPageFixture.submissions[0][1]'), '0780000000');
      await assertPage();
    });
    await t.test(`${cashout ? 'cashout' : 'top-up'} long review feedback scrolls without moving the header or confirm action`, async () => {
      await load(cashout ? 'cashout' : '', 390, 480);
      await fill();
      await click(action);
      const before = await presentation();
      await evaluate(`momoPageFixture.setError('Synthetic review feedback. '.repeat(60))`);
      await wait(60);
      const point = await evaluate(`(() => {
        const rect=document.querySelector('.momo-review-content').getBoundingClientRect();
        return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
      })()`);
      await call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 600 });
      await wait(200);
      assert(await evaluate('document.querySelector(".momo-review-content").scrollTop > 0'));
      const after = await presentation();
      assert.deepEqual(after.header, before.header);
      assert.deepEqual(after.action, before.action);
      await assertPage();
    });
  }
  await t.test('saved transfers still resume the selected transfer and render progress', async () => {
    await load('saved');
    await click('.momo-saved-transfers summary');
    await click('.momo-saved-transfers button');
    assert.deepEqual(await evaluate('momoPageFixture.resumes'), ['fixture-saved-transfer']);
    assert.equal(await evaluate('document.body.textContent.includes("Processing Transfer")'), true);
    await visible(header);
    assert.deepEqual(await evaluate('momoPageFixture.submissions'), []);
  });
  await t.test('safe-area padding keeps the phone field and action within the usable viewport', async () => {
    await load('', 390, 844, { top: 32, left: 44, right: 28, bottom: 34 });
    await fill();
    await assertPage();
    const bounds = await evaluate(`(() => {
      const input=document.querySelector('${phone}').getBoundingClientRect();
      const button=document.querySelector('${action}').getBoundingClientRect();
      return {left: input.left, right: button.right, bottom: button.bottom};
    })()`);
    assert(bounds.left >= 44);
    assert(bounds.right <= 390 - 28);
    assert(bounds.bottom <= 844 - 34);
  });
  await t.test('the legacy sheet still renders its tabs and dismissal behavior', async () => {
    await load('legacy');
    assert.equal(await evaluate('document.querySelector(".payment-page-layout")===null'), true);
    assert.equal(await evaluate('document.documentElement.classList.contains("has-bottom-sheet-open")'), true);
    await click('button', 'CASH OUT');
    await click('button:has(> svg.lucide-x)');
    await wait(400);
    assert.equal(await evaluate('momoPageFixture.closes'), 1);
    assert.deepEqual(await evaluate('momoPageFixture.submissions'), []);
  });
  await t.test('page header is supplied to PaymentPageLayout outside its named body', async () => {
    await load();
    assert.equal(await evaluate('document.querySelector(".momo-page").classList.contains("payment-page-layout")'), true);
    assert.equal(await evaluate('document.querySelector(".payment-page-layout__header .momo-page-header")!==null'), true);
    assert.equal(await evaluate('document.querySelector(".payment-page-layout__body .momo-page-header")===null'), true);
    assert.equal(await evaluate('document.querySelector(".payment-page-layout__body").getAttribute("aria-label")'), 'Mobile Money transfer');
  });
});
