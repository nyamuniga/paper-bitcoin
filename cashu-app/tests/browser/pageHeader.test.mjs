// Uses production CSS: run with npm run test:page-headers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

test('PageHeader themes, focus and navigation', { timeout: 60000 }, async t => {
  const { call, evaluate, key, open } = await createBrowserFixture(
    t, new URL('./pageHeader.fixture.tsx', import.meta.url), '.fixture-header h1',
  );
  const focusBack=async()=>{
    await evaluate('document.getElementById("before-header").focus()');
    await key('Tab');
  };
  const readColors=()=>evaluate(`(()=>{
    const header=document.querySelector('.fixture-header'),button=header.querySelector('button');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
    const root=getComputedStyle(document.documentElement),surface=rgba(root.getPropertyValue('--color-surface'));
    return {title:rgba(getComputedStyle(header.querySelector('h1')).color),subtitle:rgba(getComputedStyle(header.querySelector('p')).color),
      icon:rgba(getComputedStyle(button.querySelector('svg')).color),button:rgba(getComputedStyle(button).backgroundColor),surface,
      border:rgba(getComputedStyle(button).borderTopColor),expectedBorder:rgba(root.getPropertyValue('--color-outline-subtle')),
      headerBackground:rgba(getComputedStyle(header).backgroundColor),hover:rgba(root.getPropertyValue('--color-surface-container-high')),
      expected:rgba(root.getPropertyValue('--color-on-surface')),muted:root.getPropertyValue('--color-on-surface-muted').trim(),
      mutedColor:rgba(root.getPropertyValue('--color-on-surface-muted')),
      overflow:document.documentElement.scrollWidth>innerWidth,detail:!!document.getElementById('header-detail')};
  })()`);

  for (const width of [390,1024]) for (const theme of ['dark','light']) {
    await t.test(`${theme} theme at ${width}px keeps readable text and a visible keyboard focus`,async()=>{
      await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
      await open('theme='+theme);
      const colors=await readColors();
      if(process.env.PAGE_HEADER_SNAPSHOT_DIR) {
        await writeFile(join(process.env.PAGE_HEADER_SNAPSHOT_DIR,`${theme}-${width}.json`),JSON.stringify(colors,null,2));
        const screenshot=await call('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.PAGE_HEADER_SNAPSHOT_DIR,`${theme}-${width}.png`),Buffer.from(screenshot.data,'base64'));
      }
      assert.deepEqual(colors.title,colors.expected);
      assert(colors.muted,'The muted foreground token must be defined.');
      assert.deepEqual(colors.subtitle,colors.mutedColor);
      assert.deepEqual(colors.icon,colors.mutedColor);
      assert.deepEqual(colors.border,colors.expectedBorder);
      assert.deepEqual(colors.headerBackground,[...colors.surface.slice(0,3),Math.round(255*.95)]);
      assert(contrast(colors.title,colors.surface)>=4.5);
      assert(contrast(colors.subtitle,colors.surface)>=4.5);
      assert(contrast(colors.icon,colors.button)>=3);
      assert.equal(colors.overflow,false);assert.equal(colors.detail,true);
      await focusBack();
      const focus=await evaluate(`(()=>{const b=document.activeElement,s=getComputedStyle(b);return {label:b.getAttribute('aria-label'),visible:b.matches(':focus-visible'),width:parseFloat(s.outlineWidth),style:s.outlineStyle,color:s.outlineColor,expected:getComputedStyle(document.querySelector('h1')).color}})()`);
      assert.equal(focus.label,'Go back');assert.equal(focus.visible,true);
      assert(focus.width>=2);assert.equal(focus.style,'solid');assert.equal(focus.color,focus.expected);
    });
  }
  await t.test('hover colors follow the current theme',async()=>{
    for(const theme of ['dark','light']) {
      await open('theme='+theme);
      const point=await evaluate('(()=>{const r=document.querySelector(".fixture-header button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
      await wait(300);
      const colors=await readColors();
      assert.deepEqual(colors.button,colors.hover);
      assert.deepEqual(colors.icon,colors.expected);
    }
  });
  await t.test('default back navigation, explicit callbacks, disabled and hidden states are preserved',async()=>{
    await open('theme=light');await focusBack();
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Go back');
    await key('Enter');
    assert.equal(await evaluate('document.getElementById("route").textContent'),'/previous');
    await open('theme=dark&custom');await focusBack();await key('Enter');
    assert.equal(await evaluate('document.getElementById("route").textContent'),'/header');
    assert.equal(await evaluate('document.getElementById("back-calls").textContent'),'1');
    await open('theme=light&disabled');await focusBack();
    assert.equal(await evaluate('document.activeElement.id'),'header-action');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Go back"]').disabled`),true);
    await open('theme=dark&hidden');
    assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Go back"]').length`),0);
  });
  await t.test('sticky positioning and the non-sticky option remain intact',async()=>{
    await open('theme=dark');await evaluate('scrollTo(0,300)');await wait(30);
    const sticky=await evaluate('(()=>{const h=document.querySelector(".fixture-header"),s=getComputedStyle(h);return {position:s.position,y:h.getBoundingClientRect().top,top:parseFloat(s.top)}})()');
    assert.equal(sticky.position,'sticky');assert(Math.abs(sticky.y-sticky.top)<1);
    await open('theme=light&static');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".fixture-header")).position'),'static');
  });
});
