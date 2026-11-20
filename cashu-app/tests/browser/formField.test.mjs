import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBrowserFixture, contrast, wait } from './browserFixture.mjs';

test('FormField composes native controls with unique labels and message references', {timeout:60000}, async t => {
  const {call,evaluate,key,open}=await createBrowserFixture(t,new URL('./formField.fixture.tsx',import.meta.url),'#phone input');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));`});
  const click=async selector=>{
    const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(60);
  };
  const controlState=field=>evaluate(`(()=>{
    const root=document.getElementById('${field}'),e=root.querySelector('input,textarea'),label=root.querySelector('label');
    const ids=(e.getAttribute('aria-describedby')||'').split(/\\s+/).filter(Boolean);
    return {id:e.id,labelFor:label.htmlFor,labels:[...e.labels].map(l=>l.textContent),invalid:e.getAttribute('aria-invalid'),
      descriptions:ids,descriptionText:ids.map(id=>document.getElementById(id)?.textContent),
      hintId:root.querySelector('.form-field-hint')?.id??null,errorId:root.querySelector('.form-field-error')?.id??null,
      errorRole:root.querySelector('.form-field-error')?.getAttribute('role')??null};
  })()`);
  const styles=field=>evaluate(`(()=>{
    const root=document.getElementById('${field}'),label=root.querySelector('label'),control=root.querySelector('input,textarea');
    const measure=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return Object.fromEntries(['fontSize','fontWeight','lineHeight','color','backgroundColor','borderWidth','borderColor','borderRadius','padding','marginBottom'].map(k=>[k,s[k]]).concat([['width',r.width],['height',r.height],['offsetY',r.y-root.getBoundingClientRect().y]]))};
    return {label:measure(label),control:measure(control),height:root.getBoundingClientRect().height};
  })()`);
  const accessible=async selector=>{
    const {root}=await call('DOM.getDocument');const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector});
    const {nodes}=await call('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:false});
    return {name:nodes[0].name.value,description:nodes[0].description?.value??''};
  };

  for(const theme of ['dark','light'])for(const [width,height]of [[390,844],[1024,844],[390,480]]) {
    await t.test(`${theme} ${width}x${height} retains both native field layouts`,async()=>{
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await open('theme='+theme);
      for(const field of ['phone','destination']) {
        assert.deepEqual(await styles(field),await styles(field+'-reference'));
        const current=await controlState(field);assert.equal(current.id,current.labelFor);
        assert.equal((await accessible(`#${field} ${field==='phone'?'input':'textarea'}`)).name,field==='phone'?'Phone number':'Pay to:');
        assert.deepEqual(current.descriptions,[]);assert.equal(current.invalid,null);
      }
      if(process.env.FORM_FIELD_SNAPSHOT_DIR) {
        const s=await call('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.FORM_FIELD_SNAPSHOT_DIR,`${theme}-${width}-${height}.png`),Buffer.from(s.data,'base64'));
      }
      assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
    });
  }
  for(const flags of ['', 'null-messages', 'empty-messages', 'hint', 'error', 'hint&error', 'hint&error&external', 'hint&error&external&explicit']) {
    await t.test(`${flags||'empty messages'} associates only mounted descriptions`,async()=>{
      await open(flags);
      const allIds=await evaluate('[...document.querySelectorAll("[id]")].map(e=>e.id)');
      assert.equal(new Set(allIds).size,allIds.length);
      for(const field of ['phone','destination']) {
        const actual=await controlState(field),hint=flags.includes('hint'),error=flags.includes('error');
        assert.equal(actual.labelFor,actual.id);assert.equal(actual.invalid,error?'true':null);
        assert.equal(actual.hintId,hint?actual.id+'-hint':null);assert.equal(actual.errorId,error?actual.id+'-error':null);
        assert.equal(actual.errorRole,error?'alert':null);
        assert.deepEqual(actual.descriptions,[...(flags.includes('external')?['external-note']:[]),...(hint?[actual.id+'-hint']:[]),...(error?[actual.id+'-error']:[])]);
        assert(actual.descriptionText.every(text=>typeof text==='string'&&text.length>0));
        if(flags.includes('explicit'))assert.equal(actual.id,'caller-'+field);
      }
    });
  }
  await t.test('repeated labels receive unique control, hint and error IDs',async()=>{
    await open('hint&error');
    const fields=await evaluate(`[...document.querySelectorAll('#repeated-fields .form-field')].map(root=>{const e=root.querySelector('input');return {id:e.id,label:root.querySelector('label').htmlFor,refs:e.getAttribute('aria-describedby').split(' '),owned:[...root.querySelectorAll('p[id]')].map(p=>p.id)}})`);
    assert.equal(new Set(fields.flatMap(f=>[f.id,...f.owned])).size,9);
    for(const field of fields){assert.equal(field.id,field.label);assert.deepEqual(field.refs,field.owned);}
  });
  await t.test('message toggles update references and invalid state without changing control IDs',async()=>{
    await open('');const original=[(await controlState('phone')).id,(await controlState('destination')).id];
    await click('#toggle-hint');await click('#toggle-error');
    for(const field of ['phone','destination'])assert.equal((await controlState(field)).descriptions.length,2);
    await click('#toggle-hint');
    for(const field of ['phone','destination']){const state=await controlState(field);assert.deepEqual(state.descriptions,[state.errorId]);}
    await click('#toggle-error');
    for(const [index,field]of ['phone','destination'].entries()){
      const state=await controlState(field);assert.equal(state.id,original[index]);assert.equal(state.invalid,null);assert.deepEqual(state.descriptions,[]);
    }
  });
  await t.test('keyed reordering preserves each field ID and existing description references',async()=>{
    await open('hint&error&external');const before=[await controlState('phone'),await controlState('destination')];
    await click('#reorder');assert.deepEqual([await controlState('phone'),await controlState('destination')],before);
  });
  for(const field of ['phone','destination'])await t.test(`${field} label clicks focus its own control`,async()=>{
    await open('');await click(`#${field} label`);
    assert.equal(await evaluate(`document.activeElement===document.querySelector('#${field} input,#${field} textarea')`),true);
    assert.equal(await evaluate('document.getElementById("actions").textContent'),'0');
  });
  await t.test('controlled input events, native props, refs and grouped actions remain caller-owned',async()=>{
    await open('');await click('#focus-phone');
    assert.equal(await evaluate('document.activeElement===document.querySelector("#phone input")'),true);
    await call('Input.insertText',{text:'0781234567'});assert.equal(await evaluate('document.querySelector("#phone input").value'),'0781234567');
    await click('#destination textarea');await call('Input.insertText',{text:'fixture@example.test'});
    assert.equal(await evaluate('document.querySelector("#destination textarea").value'),'fixture@example.test');
    assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector('#phone input');return [e.type,e.inputMode,e.autocomplete]})()`),['tel','tel','tel-national']);
    await click('#phone button');await click('#destination button');
    assert.equal(await evaluate('document.getElementById("actions").textContent'),'2');
    assert.equal(await evaluate('!!document.querySelector(".form-field-label button")'),false);
  });
  await t.test('disabled native controls stay disabled without disabling sibling actions',async()=>{
    await open('disabled');await click('#phone label');
    assert.equal(await evaluate('document.querySelector("#phone input").disabled'),true);
    assert.equal(await evaluate('document.activeElement===document.querySelector("#phone input")'),false);
    await click('#phone button');assert.equal(await evaluate('document.getElementById("actions").textContent'),'1');
  });
  await t.test('accessibility names and descriptions include external, hint and error text',async()=>{
    await open('hint&error&external');const actual=await accessible('#phone input');
    assert.equal(actual.name,'Phone number');
    assert.equal(actual.description,'Shared instruction. Caller-owned instruction. Check this phone number.');
  });
  for(const theme of ['dark','light'])await t.test(`${theme} long messages wrap and retain readable semantic colors`,async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await open('hint&error&long&theme='+theme);
    const result=await evaluate(`(()=>{const root=getComputedStyle(document.documentElement),ctx=document.createElement('canvas').getContext('2d');
      const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
      return {overflow:document.documentElement.scrollWidth>innerWidth,background:rgba(root.getPropertyValue('--color-surface')),
        hint:rgba(getComputedStyle(document.querySelector('.form-field-hint')).color),expectedHint:rgba(root.getPropertyValue('--color-on-surface-muted')),
        error:rgba(getComputedStyle(document.querySelector('.form-field-error')).color),expectedError:rgba(root.getPropertyValue('--color-error'))};})()`);
    assert.equal(result.overflow,false);assert.deepEqual(result.hint,result.expectedHint);assert.deepEqual(result.error,result.expectedError);
    assert(contrast(result.hint,result.background)>=4.5);assert(contrast(result.error,result.background)>=4.5);
  });
});
