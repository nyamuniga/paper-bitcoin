// Run with npm run test:success-overlays. Set CHROME_BIN if Chrome is installed elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('success overlay completion returns to the wallet', {timeout:60000}, async t => {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  let executable;
  for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
  assert(executable, 'Chrome is required; set CHROME_BIN to its executable.');
  const directory = await mkdtemp(join(tmpdir(), 'success-overlay-test-'));
  let chrome, socket;
  try {
    await build({entryPoints:[fileURLToPath(new URL('./successOverlay.fixture.tsx', import.meta.url))], outfile:join(directory,'fixture.js'), bundle:true, platform:'browser', format:'iife', jsx:'automatic', logLevel:'silent'});
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
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});

    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const open=async query => {
      await call('Page.navigate',{url:pathToFileURL(join(directory,'fixture.html')).href+'?'+query});
      await evaluate('new Promise(resolve=>{const check=()=>document.querySelector("#route")?resolve(true):requestAnimationFrame(check);check()})');
      await wait(50);
    };
    const click=async label => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Button missing: '+${JSON.stringify(label)});button.click()})()`);
    const route=()=>evaluate('document.getElementById("route").textContent');
    await t.test('Done runs cleanup once, returns home, and replaces the completed page',async()=>{
      await open('status=success');await click('Done');await wait(60);
      assert.equal(await route(),'/');
      assert.equal(await evaluate('document.getElementById("dismissals").textContent'),'1');
      await click('History back');await wait(60);assert.equal(await route(),'/history');
    });
    await t.test('custom success labels use the same home destination',async()=>{
      await open('status=success&custom');await click('Back to wallet');await wait(60);assert.equal(await route(),'/');
    });
    await t.test('success completion works without a cleanup callback',async()=>{
      await open('status=success&no-dismiss');await click('Done');await wait(60);assert.equal(await route(),'/');
    });
    await t.test('failed dismissal stays on the current page',async()=>{
      await open('status=failed');await click('Go back');await wait(60);
      assert.equal(await route(),'/send-bitcoin');assert.equal(await evaluate('document.getElementById("dismissals").textContent'),'1');
    });
    await t.test('failed retry does not navigate or dismiss',async()=>{
      await open('status=failed');await click('Try again');await wait(60);
      assert.equal(await route(),'/send-bitcoin');assert.equal(await evaluate('document.getElementById("retries").textContent'),'1');
      assert.equal(await evaluate('document.getElementById("dismissals").textContent'),'0');
    });
    await t.test('pending operations do not offer Done or navigate',async()=>{
      await open('status=pending');assert.equal(await route(),'/send-bitcoin');
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Done")'),false);
    });
  } finally {
    socket?.close();
    if(chrome && chrome.exitCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await Promise.race([exited,wait(2000)]);}
    await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
