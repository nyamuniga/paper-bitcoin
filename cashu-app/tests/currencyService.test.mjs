import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const url = new URL('../src/services/currencyService.ts', import.meta.url).href;
const stub = source => 'data:text/javascript,' + encodeURIComponent(source);
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === url) {
    if (specifier === '@tauri-apps/plugin-http') return {url:stub('export const fetch=(...args)=>globalThis.__currencyFetch(...args);'),shortCircuit:true};
    if (specifier === '../constants') return {url:stub('export const EXCHANGE_RATE_API_URL="https://ticker.example",SATS_PER_BTC=100000000,SPREAD=0.01,RWF_USD_PEG=1500;'),shortCircuit:true};
  }
  return next(specifier,context);
}});
const service = await import(url);

test('Bitcoin is available in currency settings with eight decimal places',()=>{
  assert.deepEqual(service.CURRENCIES.BTC,{code:'BTC',name:'Bitcoin',symbol:'₿',decimals:8});
  assert.ok(service.POPULAR_CURRENCIES.includes('BTC'));
});
test('sats convert to BTC offline, including one sat and a zero balance',()=>{
  assert.equal(service.convertSatsToFiat(1,'BTC',{}).formatted,'₿0.00000001 BTC');
  assert.equal(service.convertSatsToFiat(2997,'BTC',{}).formatted,'₿0.00002997 BTC');
  assert.equal(service.convertSatsToFiat(0,'BTC',{}).formatted,'₿0.00000000 BTC');
  assert.equal(service.convertSatsToFiat(100000000,'BTC',{BTC:123},0.5).value,1);
});
test('BTC preference persists and ticker refresh keeps the BTC identity rate',async()=>{
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  service.setStoredPreferredCurrency('BTC');
  assert.equal(service.getStoredPreferredCurrency(),'BTC');
  globalThis.__currencyFetch=async()=>({ok:true,json:async()=>({USD:{last:75000},BTC:{last:123}})});
  const rates=await service.fetchAllTickerRates();
  assert.equal(rates.BTC,1);assert.equal(rates.USD,75000);
  assert.equal(service.getCachedRates().BTC,1);
});
test('fiat display conversions retain their existing decimal precision',()=>{
  assert.equal(service.convertSatsToFiat(1000,'USD',{USD:75000}).formatted,'$0.75 USD');
  assert.equal(service.convertSatsToFiat(1000,'USD',{}).formatted,'••• USD');
});
