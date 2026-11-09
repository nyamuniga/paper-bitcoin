import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const source=new URL('../src/services/momoService.ts',import.meta.url).href;
const stub=code=>({url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true});
registerHooks({resolve(specifier,context,next){
  if(context.parentURL===source){
    if(specifier==='../utils/encryption')return stub('export const Encryption={encrypt:async()=>({encrypted:"fixture",iv:"fixture",hmac:"fixture",timestamp:1})};');
    if(specifier==='../constants')return stub('export const MOMO_API_BASE_URL="https://proxy.example";');
    if(specifier==='./proxyRequest')return next(new URL('../src/services/proxyRequest.ts',import.meta.url).href,context);
  }
  if(context.parentURL?.endsWith('/proxyRequest.ts')&&specifier==='@tauri-apps/plugin-http')return stub('export const fetch=(...a)=>globalThis.__momoFetch(...a);');
  return next(specifier,context);
}});
const service=await import(source);
test('invalid or missing status responses never falsely declare a transfer failed',async()=>{
  for(const body of [{status:'error',message:'Not found'}, {status:'success',data:{}}, {status:'success',data:{status:'NEW_UNKNOWN_STATE'}}]){
    globalThis.__momoFetch=async()=>({ok:true,json:async()=>body});
    assert.equal((await service.checkMomoPaymentStatus('saved-id')).status,'UNKNOWN');
    assert.equal((await service.checkMomoPayoutStatus('saved-id')).status,'UNKNOWN');
  }
});
test('only explicit provider outcomes become terminal',async()=>{
  for(const [status,expected] of [['SUCCESSFUL','SUCCESSFUL'],['APPROVED','SUCCESSFUL'],['FAILED','FAILED'],['REJECTED','FAILED'],['PENDING','PENDING']]){
    globalThis.__momoFetch=async()=>({ok:true,json:async()=>({status:'success',data:{status}})});
    assert.equal((await service.checkMomoPaymentStatus('saved-id')).status,expected);
    assert.equal((await service.checkMomoPayoutStatus('saved-id')).status,expected);
  }
});
test('topup and payout identify credential rejections and preserve ambiguous failures',async()=>{
  for(const [status,submission] of [[401,'rejected'],[403,'unknown'],[500,'unknown']]){
    globalThis.__momoFetch=async()=>({ok:false,status,json:async()=>({code:status===401?'INVALID_ENCRYPTED_REQUEST':'PAYMENT_OUTCOME_UNKNOWN'})});
    assert.equal((await service.initiateMomoPaymentRequest('id',100,'ecash',1000,'0780000000')).submission,submission);
    assert.equal((await service.initiateMomoPayout('id',1000,100,'0780000000')).submission,submission);
  }
});
