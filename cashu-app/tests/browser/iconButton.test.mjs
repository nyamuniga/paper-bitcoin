import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

test('IconButton preserves caller presentation and native interaction', {timeout: 60000}, async t => {
  const {call, evaluate, key, open} = await createBrowserFixture(t, new URL('./iconButton.fixture.tsx', import.meta.url), '#action');
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`});
  const click = async selector => {
    const p = await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', {type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent', {type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(50);
  };
  const counts = () => evaluate('({clicks:Number(document.getElementById("clicks").textContent),submits:Number(document.getElementById("submits").textContent),resets:Number(document.getElementById("resets").textContent)})');
  const style = selector => evaluate(`(()=>{
    const b=document.querySelector('${selector}'),s=getComputedStyle(b),r=b.getBoundingClientRect();
    return Object.fromEntries(['backgroundColor','color','padding','borderRadius','borderWidth','borderColor','boxShadow','lineHeight','fontSize','opacity','cursor'].map(k=>[k,s[k]]).concat([['width',r.width],['height',r.height]]));
  })()`);
  const accessibleName = async () => {
    const {root} = await call('DOM.getDocument');
    const {nodeId} = await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#action'});
    const {nodes} = await call('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:false});
    return nodes[0].name.value;
  };

  for (const addressBook of [false,true]) for (const theme of ['dark','light']) for (const [width,height] of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${addressBook?'address book':'copy'} ${theme} ${width}x${height} matches the original native control`, async () => {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await open(`theme=${theme}${addressBook?'&address-book':''}`);
      assert.deepEqual(await style('#action'),await style('#reference'));
      const actual=await style('#action');
      // Existing rem utilities scale with the app's 17px root size.
      assert.equal(actual.width,addressBook?29.75:33);assert.equal(actual.height,addressBook?29.75:33);
      assert.equal(actual.padding,addressBook?'6.375px':'8.5px');assert.equal(actual.borderRadius,addressBook?'8.5px':'12.75px');
      assert.equal(await accessibleName(),addressBook?'Open Address Book':'Copy Mint URL');
      assert.equal(await evaluate('document.querySelectorAll("#action svg").length'),1);
      const backgrounds=[];
      for(const selector of ['#action','#reference']) {
        const p=await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await wait(220);backgrounds.push((await style(selector)).backgroundColor);
      }
      assert.equal(backgrounds[0],backgrounds[1]);
      assert.notEqual(backgrounds[0],actual.backgroundColor);
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await wait(220);
      if(process.env.ICON_BUTTON_SNAPSHOT_DIR) {
        const s=await call('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.ICON_BUTTON_SNAPSHOT_DIR,`${addressBook?'address-book':'copy'}-${theme}-${width}-${height}.png`),Buffer.from(s.data,'base64'));
      }
      assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
    });
  }
  for(const addressBook of [false,true]) await t.test(`${addressBook?'address book':'copy'} disabled state blocks pointer/keyboard activation and leaves Tab order`,async()=>{
    await open(`disabled${addressBook?'&address-book':''}`);await click('#action');
    assert.equal(await evaluate('document.getElementById("action").disabled'),true);
    assert.equal((await style('#action')).opacity,'0.4');assert.equal((await style('#action')).cursor,'default');
    await evaluate('document.getElementById("native-input").focus()');await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'),'standalone');
    await key('Enter');assert.deepEqual(await counts(),{clicks:0,submits:0,resets:0});
    await click('#enable');await click('#action');assert.equal((await counts()).clicks,1);
  });
  await t.test('copy feedback icon, accessible label and tooltip remain controlled by the caller',async()=>{
    await open('');await click('#action');
    assert.equal(await accessibleName(),'Mint URL copied');
    assert.equal(await evaluate('document.getElementById("action").title'),'Mint URL copied');
    assert.equal(await evaluate('!!document.querySelector("#action .lucide-check")'),true);
    assert.equal(await evaluate('document.querySelectorAll("#action svg").length'),1);
    assert.equal(await evaluate('document.getElementById("action").textContent'),'');
  });
  await t.test('type=button supports pointer and keyboard without submitting the form',async()=>{
    await open('address-book');await click('#action');
    await evaluate('document.getElementById("native-input").focus()');await key('Tab');await key('Enter');
    assert.deepEqual(await counts(),{clicks:2,submits:0,resets:0});
  });
  await t.test('native submit semantics are forwarded',async()=>{
    await open('submit');await click('#action');assert.deepEqual(await counts(),{clicks:1,submits:1,resets:0});
  });
  await t.test('native reset semantics are forwarded',async()=>{
    await open('reset');await click('#native-input');await call('Input.insertText',{text:'changed'});
    assert.notEqual(await evaluate('document.getElementById("native-input").value'),'original');
    await click('#action');assert.equal(await evaluate('document.getElementById("native-input").value'),'original');
    assert.deepEqual(await counts(),{clicks:1,submits:0,resets:1});
  });
  await t.test('a caller can disable after activation and prevent another click',async()=>{
    await open('lock-on-click');await click('#action');await click('#action');assert.equal((await counts()).clicks,1);
  });
  await t.test('button refs and native attributes reach the underlying button',async()=>{
    await open('');await click('#focus-action');assert.equal(await evaluate('document.activeElement.id'),'action');
    assert.deepEqual(await evaluate(`(()=>{const b=document.getElementById('action');return [b.tagName,b.type,b.name,b.value,b.getAttribute('aria-describedby')]})()`),['BUTTON','button','action','copy','hint']);
    assert.equal(await evaluate('document.getElementById("standalone").getAttribute("title")'),null);
  });
  for(const theme of ['dark','light']) await t.test(`${theme} keyboard focus has one visible, contrasting outline`,async()=>{
    await open('theme='+theme);await evaluate('document.getElementById("native-input").focus()');await key('Tab');
    await wait(220);
    assert.equal(await evaluate('document.activeElement.matches("#action:focus-visible")'),true);
    const focus=await evaluate(`(()=>{const s=getComputedStyle(document.activeElement),root=getComputedStyle(document.documentElement),ctx=document.createElement('canvas').getContext('2d');
      const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
      return {outline:s.outlineStyle,width:s.outlineWidth,offset:s.outlineOffset,color:rgba(s.outlineColor),expected:rgba(root.getPropertyValue('--color-on-surface')),background:rgba(root.getPropertyValue('--color-surface'))}})()`);
    assert.equal(focus.outline,'solid');assert.equal(focus.width,'2px');assert.equal(focus.offset,'3px');
    assert.deepEqual(focus.color,focus.expected);assert(contrast(focus.color,focus.background)>=3);
  });
});
