import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assets = fileURLToPath(new URL('../../dist/assets/', import.meta.url));

const luminance = rgb => rgb.slice(0, 3).map(value => value / 255)
  .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);

export function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

/** Serves only the fixture bundle and production CSS/fonts in a temporary Chrome profile. */
export async function createBrowserFixture(t, entry, readySelector, plugins = []) {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  let executable;
  for (const candidate of candidates) {
    try { await access(candidate); executable = candidate; break; } catch {}
  }
  assert(executable, 'Chrome is required; set CHROME_BIN to its executable.');
  const css = (await readdir(assets)).find(name => /^index-.*\.css$/.test(name));
  assert(css, 'Build the app before running the browser fixture.');

  const directory = await mkdtemp(join(tmpdir(), 'bitnotes-browser-fixture-'));
  let chrome, socket, server;
  t.after(async () => {
    socket?.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, wait(2000)]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  await build({entryPoints:[fileURLToPath(entry)], outfile:join(directory,'fixture.js'), bundle:true, platform:'browser', format:'iife', jsx:'automatic', logLevel:'silent', plugins});
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${css}"><div id="root"></div><script src="/fixture.js"></script>`;
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
      const file = path === '/fixture.js' ? join(directory, 'fixture.js')
        : path.startsWith('/assets/') && /\.(css|woff2?)$/.test(path) ? join(assets, basename(path)) : null;
      if (!file) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'font/woff2');
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = join(directory, 'profile');
  chrome = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await wait(100); }
  }
  assert(port, 'Chrome did not start.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  let resolvePageLoad;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.loadEventFired') resolvePageLoad?.();
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const key = async name => {
    const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 };
    assert(name in codes, `Unsupported fixture key: ${name}`);
    await call('Input.dispatchKeyEvent', {type:'keyDown', key:name, code:name, windowsVirtualKeyCode:codes[name], nativeVirtualKeyCode:codes[name], ...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    await call('Input.dispatchKeyEvent', {type:'keyUp', key:name, code:name, windowsVirtualKeyCode:codes[name]});
    await wait(30);
  };
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  const open = async query => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    const loaded = new Promise(resolve => { resolvePageLoad = resolve; });
    await call('Page.navigate', { url: origin + '/?' + query });
    await loaded;
    resolvePageLoad = undefined;
    await evaluate(`new Promise(resolve=>{const check=()=>document.querySelector(${JSON.stringify(readySelector)})?resolve(true):requestAnimationFrame(check);check()})`);
    await evaluate('document.fonts.ready');
    await wait(50);
  };
  return { call, evaluate, key, open };
}
