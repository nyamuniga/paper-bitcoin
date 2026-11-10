// Run with npm run test:bottom-sheets. Set CHROME_BIN if Chrome is installed elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('bottom-sheet dismissal preserves the first following interaction', {timeout:60000}, async t => {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  let executable;
  for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
  assert(executable, 'Chrome is required; set CHROME_BIN to its executable.');
  const directory = await mkdtemp(join(tmpdir(), 'bottom-sheet-test-'));
  let chrome, socket;
  try {
    await build({entryPoints:[fileURLToPath(new URL('./bottomSheet.fixture.tsx', import.meta.url))], outfile:join(directory,'fixture.js'), bundle:true, platform:'browser', format:'iife', jsx:'automatic', logLevel:'silent'});
    await writeFile(join(directory,'fixture.html'), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}html.has-bottom-sheet-open,body.has-bottom-sheet-open{overflow:hidden;overscroll-behavior:none;touch-action:none}</style><div id="root"></div><script src="fixture.js"></script>');
    const profile = join(directory,'profile');
    chrome = spawn(executable, ['--headless','--disable-gpu','--no-first-run',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'], {stdio:'ignore'});
    let port;
    for (let attempt=0; attempt<150; attempt++) {
      try { port = Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); break; } catch { await wait(100); }
    }
    assert(port, 'Chrome did not start.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject;});
    let next=0; const pending=new Map();
    socket.onmessage=event => {
      const message=JSON.parse(event.data); if(!message.id) return;
      const entry=pending.get(message.id); if(!entry) return; pending.delete(message.id);
      message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    };
    const call=(method,params={}) => new Promise((resolve,reject) => {
      const id=++next; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression => {
      const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const point=async id => evaluate(`(()=>{const rect=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`);
    const touch=async (type,points=[]) => call('Input.dispatchTouchEvent',{type,touchPoints:points});
    const tap=async id => {const p=await point(id); await touch('touchStart',[p]); await touch('touchEnd');};
    const click=async id => {const p=await point(id); await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});};
    const open=async () => {
      await call('Page.navigate',{url:pathToFileURL(join(directory,'fixture.html')).href});
      await evaluate('new Promise(resolve=>{const check=()=>document.getElementById("opener")?resolve(true):requestAnimationFrame(check);check()})');
      await tap('opener'); await wait(360);
      assert.equal(await evaluate('document.querySelector("#presses").textContent'),'1');
    };
    const swipe=async (kind='touch',id='sheet') => {
      const p=await point(`${id}-handle`);
      if(kind==='touch') {
        await touch('touchStart',[p]);await touch('touchMove',[{x:p.x,y:p.y+50}]);await touch('touchMove',[{x:p.x,y:p.y+110}]);await touch('touchEnd');
      } else {
        await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
        await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y+110,button:'left',buttons:1});
        await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y+110,button:'left',buttons:0,clickCount:1});
      }
      await wait(25);
    };
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:568,deviceScaleFactor:1,mobile:true});
    await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});

    for(const kind of ['touch','mouse']) await t.test(`${kind} swipe lets the first press reopen the same sheet`,async()=>{
      await open();await swipe(kind);
      assert.equal(await evaluate('document.querySelector("#sheet").dataset.closing'),'true');
      assert.equal(await evaluate('document.elementFromPoint(110,110).id'),'opener');
      await (kind==='touch'?tap('opener'):click('opener'));await wait(30);
      assert.equal(await evaluate('document.querySelector("#presses").textContent'),'2');
      await wait(320);
      assert.equal(await evaluate('document.querySelector("#sheet")?.dataset.closing'),'false');
      assert.equal(await evaluate('document.querySelector("#closes").textContent'),'1');
    });
    await t.test('first touch focuses an input after a swipe',async()=>{
      await open();await swipe();await tap('field');
      assert.equal(await evaluate('document.activeElement.id'),'field');
      await call('Input.insertText',{text:'first tap'});
      assert.equal(await evaluate('document.querySelector("#field").value'),'first tap');
    });
    await t.test('nested dismissal keeps the remaining sheet locked and interactive',async()=>{
      await open();await tap('open-nested');await wait(360);await swipe('touch','nested');
      assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'),true);
      await tap('sheet-ping');await wait(320);
      assert.equal(await evaluate('document.querySelector("#pings").textContent'),'1');
      assert.equal(await evaluate('!!document.querySelector("#sheet")'),true);
      assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'),true);
    });
    await t.test('unmount cancels the old close callback',async()=>{
      await open();await swipe();await evaluate('window.bottomSheetTest.unmount()');await wait(320);
      assert.equal(await evaluate('document.querySelector("#closes").textContent'),'0');
      assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'),false);
      await tap('opener');await wait(30);
      assert.equal(await evaluate('document.querySelector("#presses").textContent'),'2');
    });
    await t.test('cancelled and disabled drags leave sheet buttons working',async()=>{
      await open();const p=await point('sheet-handle');
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x,y:p.y+80}]);await touch('touchCancel');
      await wait(360);await tap('sheet-ping');
      assert.equal(await evaluate('document.querySelector("#pings").textContent'),'1');
      await evaluate('window.bottomSheetTest.disable()');await swipe();
      assert.equal(await evaluate('document.querySelector("#sheet").dataset.closing'),'false');
      assert.equal(await evaluate('document.body.classList.contains("has-bottom-sheet-open")'),true);
    });
  } finally {
    socket?.close();
    if(chrome && chrome.exitCode === null) {
      const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await Promise.race([exited,wait(2000)]);
    }
    await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
