import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTransferOutput, percentageAmount, resizeTransferOutput, dollarAmount } from '../src/services/transferAmount.ts';
test('transfer previews use source currency and exact base units', () => {
  assert.equal(estimateTransferOutput('toUsd', 1000n, 75000), 750000n);
  assert.equal(estimateTransferOutput('toSats', 750000n, 75000), 1000n);
  assert.equal(estimateTransferOutput('toUsd', 1000n, 0), null);
  assert.equal(estimateTransferOutput('toSats', 100n, NaN), null);
  assert.equal(percentageAmount(11772n, 25), 2943n);
  assert.equal(percentageAmount(1234567n, 100), 1234567n);
  assert.equal(resizeTransferOutput(1000000n, 1000n, 1005n), 995023n);
  assert.equal(dollarAmount(0n), '$0.00');
  assert.equal(dollarAmount(1n), '<$0.01');
  assert.equal(dollarAmount(1234567n), '$1.23');
});

test('Dollar equivalents use the selected currency and never fabricate missing rates', async () => {
  const { dollarFiatValue } = await import('../src/services/transferAmount.ts');
  assert.equal(dollarFiatValue(1750000n,'RWF',{USD:75000,RWF:112500000}),2625);
  assert.equal(dollarFiatValue(1750000n,'EUR',{USD:75000,EUR:67500}),1.575);
  assert.equal(dollarFiatValue(1750000n,'USD',{}),1.75);
  assert.equal(dollarFiatValue(0n,'RWF',{USD:75000,RWF:112500000}),0);
  assert.equal(dollarFiatValue(1750000n,'RWF',{USD:75000}),null);
  assert.equal(dollarFiatValue(1750000n,'RWF',{USD:0,RWF:112500000}),null);
});

test('Dollar holdings can display a BTC equivalent using the USD price alone', async()=>{
  const {dollarFiatValue}=await import('../src/services/transferAmount.ts');
  assert.equal(dollarFiatValue(750000n,'BTC',{USD:75000}),0.00001);
  assert.equal(dollarFiatValue(750000n,'BTC',{USD:75000,BTC:999}),0.00001);
  assert.equal(dollarFiatValue(0n,'BTC',{USD:75000}),0);
  assert.equal(dollarFiatValue(750000n,'BTC',{}),null);
});
