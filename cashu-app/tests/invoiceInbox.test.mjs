import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {generateSecretKey} from 'nostr-tools';
const url=new URL('../src/services/invoiceInbox.ts',import.meta.url).href;
const nostr=new URL('../node_modules/nostr-tools/lib/esm/index.js',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(context.parentURL===url){
  if(specifier==='nostr-tools')return {url:'data:text/javascript,'+encodeURIComponent(`export {finalizeEvent,getPublicKey} from '${nostr}';export class SimplePool {ensureRelay(url){return globalThis.__inbox.connect(url)}destroy(){globalThis.__inbox.destroyed++}}`),shortCircuit:true};
  if(specifier.startsWith('./'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
 }
 return next(specifier,context);
}});
const {openInvoiceInbox}=await import(url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const invoice={id:'invoice-1',amount:100,mint:'https://mint.example',qr:''};
function fixture(){
 const f={destroyed:0,params:new Map(),connect:async url=>({subscribe(_filters,params){f.params.set(url,params);return {close(){}}},publish:async()=>{}})};
 globalThis.__inbox=f;return f;
}
test('a ready relay is usable without waiting for another blocked connection',async()=>{
 const f=fixture(),connect=f.connect;
 f.connect=url=>url==='wss://blocked.example'?new Promise(()=>{}):connect(url);
 const inbox=openInvoiceInbox(invoice,generateSecretKey(),['wss://fast.example','wss://blocked.example'],()=>{},()=>{});
 const pending=inbox.ready.then(value=>value);
 await tick();f.params.get('wss://fast.example')?.oneose();
 const ready=await Promise.race([pending,tick().then(()=>null)]);
 inbox.close();
 assert.deepEqual(ready,['wss://fast.example']);
});
test('late relay readiness and lost connections update advertised active routes',async()=>{
 const f=fixture(),routes=[];let disconnected=0;
 const inbox=openInvoiceInbox(invoice,generateSecretKey(),['wss://one.example','wss://two.example'],()=>{},()=>{disconnected++},()=>{},value=>routes.push(value));
 await tick();f.params.get('wss://one.example').oneose();await inbox.ready;
 f.params.get('wss://two.example').oneose();await tick();
 assert.deepEqual(routes.at(-1),['wss://one.example','wss://two.example']);
 f.params.get('wss://one.example').onclose('connection lost');await tick();
 assert.deepEqual(routes.at(-1),['wss://two.example']);assert.equal(disconnected,0);
 f.params.get('wss://two.example').onclose('connection lost');await tick();
 assert.equal(disconnected,1);assert.deepEqual(routes.at(-1),[]);inbox.close();
});
test('offline failures retain safe per-relay reasons and do not claim a ready QR',async()=>{
 const f=fixture();f.connect=async url=>{throw new Error(url.includes('one')?'DNS lookup failed':'connection timed out')};
 const inbox=openInvoiceInbox(invoice,generateSecretKey(),['wss://one.example','wss://two.example'],()=>{},()=>{});
 await assert.rejects(inbox.ready,error=>error.details?.length===2&&error.details.some(text=>text.includes('DNS lookup failed'))&&error.details.some(text=>text.includes('connection timed out')));
 inbox.close();
});
test('closing while connecting clears the in-memory key and prevents a late subscription',async()=>{
 const f=fixture();let finish;
 f.connect=()=>new Promise(resolve=>{finish=resolve});
 const secret=generateSecretKey(),inbox=openInvoiceInbox(invoice,secret,['wss://one.example'],()=>{},()=>{});
 inbox.close();finish({subscribe(){throw Error('Late subscription after close')}});
 assert.deepEqual(await inbox.ready,[]);assert.ok(secret.every(byte=>byte===0));
});
