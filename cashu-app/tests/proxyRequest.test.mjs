import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const source = new URL('../src/services/proxyRequest.ts', import.meta.url).href;
registerHooks({resolve(specifier,context,next) {
  if (context.parentURL === source && specifier === '@tauri-apps/plugin-http') return {
    url:'data:text/javascript,'+encodeURIComponent('export const fetch=(...args)=>globalThis.__proxyFetch(...args);'),shortCircuit:true,
  };
  return next(specifier,context);
}});
const { requestProxyJson, withDeadline } = await import(source);
test('a request that never returns is bounded and aborted', async () => {
  let signal;
  await assert.rejects(withDeadline(s => {signal=s;return new Promise(()=>{});}, 5), /timed out/i);
  assert.equal(signal.aborted,true);
});
test('slow response bodies also time out without claiming rejection', async () => {
  globalThis.__proxyFetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  await assert.rejects(requestProxyJson('https://proxy.example',{},5), e=>e.submission==='unknown');
});
test('explicit backend authentication rejection asks for an update', async () => {
  for(const status of [401]) {
    globalThis.__proxyFetch=async()=>({ok:false,status,json:async()=>({code:'INVALID_ENCRYPTED_REQUEST'})});
    await assert.rejects(requestProxyJson('https://proxy.example'), e=>e.submission==='rejected' && /update/i.test(e.message));
  }
});
test('network and server failures remain ambiguous rather than safe to resend', async () => {
  for(const response of [()=>Promise.reject(Error('offline')),async()=>({ok:false,status:500,json:async()=>({})}),async()=>({ok:false,status:401,json:async()=>({code:'UPSTREAM_AUTH_ERROR'})})]) {
    globalThis.__proxyFetch=response;
    await assert.rejects(requestProxyJson('https://proxy.example'), e=>e.submission==='unknown');
  }
});
