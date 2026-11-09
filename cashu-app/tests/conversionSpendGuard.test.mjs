import test from 'node:test';
import assert from 'node:assert/strict';
import {guardConversionPayments as check, withConversionSpendGuard as guard} from '../src/services/conversionSpendGuard.ts';
import {USDB_TOKEN_ID} from '../src/services/stableBalanceModel.ts';
const op={direction:'toUsd',protection_bps:300,funding_sats:1030,max_debit:'1100'};
const btc=(id,amount)=>({paymentId:id,amount,details:{type:'spark',payRequest:'provider'}});
const usd=(id,amount)=>({paymentId:id,amount,details:{type:'token',tokenId:USDB_TOKEN_ID,payRequest:'provider'}});
test('last-moment SDK repricing cannot exceed funded Bitcoin, including the fee reserve',async()=>{
 await guard(op,2n,async()=>{
  await check([btc('leg',1028n)]);
  await check([btc('leg',1028n)]); // SDK replay is not a second debit
  await assert.rejects(check([btc('next',1n)]),/approved maximum/);
  await assert.rejects(check([btc('leg',1029n)]),/changed/);
 });
});
test('Dollar limit uses microdollars, sums all source outputs, and excludes converted BTC destination',async()=>{
 await guard({...op,direction:'toSats',max_debit:'1100000'},100n,async()=>{
  await check([usd('provider',1000000n),usd('fee',99900n)]);
  await check([btc('mint-leg',500n)]);
  await assert.rejects(check([usd('extra',1n)]),/approved maximum/);
 });
});
test('a rejected or ambiguous send releases only the transient observer and never retries the payment',async()=>{
 let sends=0;
 await assert.rejects(guard(op,0n,async()=>{sends++;await check([btc('too-much',2000n)]);}),/approved maximum/);
 assert.equal(sends,1);
 await check([btc('ordinary-wallet-send',2000n)]);
 await guard(op,0n,async()=>check([btc('next-operation',1000n)]));
});

test('a later guard rejection after any approved source payment remains ambiguous',async()=>{
 const {UnsubmittedConversionError}=await import('../src/services/conversionSpendGuard.ts');
 await assert.rejects(guard(op,2n,async()=>{
  await check([btc('approved-leg',900n)]);
  await check([btc('blocked-leg',200n)]);
 }),error=>!(error instanceof UnsubmittedConversionError)&&/approved maximum/.test(error.message));
});
