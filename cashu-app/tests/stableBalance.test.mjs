import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits, formatUnits, conversionCost, encodeQuote, decodeQuote, USDB_TOKEN_ID } from '../src/services/stableBalanceModel.ts';

test('USD and sat inputs use exact integers, reject ambiguous or unsafe amounts', () => {
  assert.equal(parseUnits('12.345678', 6), 12345678n);
  assert.equal(parseUnits('001.20', 6), 1200000n);
  assert.equal(parseUnits('1000', 0), 1000n);
  for (const value of ['0', '-1', '1e3', '1,000', '1.0000001', 'NaN', 'Infinity', '.5']) {
    assert.throws(() => parseUnits(value, 6));
  }
  assert.throws(() => parseUnits('9007199254740992', 0));
  assert.equal(formatUnits(12345678n, 6), '12.345678');
  assert.equal(formatUnits(1n, 6), '0.000001');
});

test('quoted debit includes conversion fee in the source asset', () => {
  assert.equal(conversionCost({ amountIn: 1000n, fee: 2n }), 1002n);
  assert.throws(() => conversionCost({amountIn: 0n, fee: 1n}));
  assert.throws(() => conversionCost({amountIn: 1n, fee: -1n}));
});

test('SDK quotes survive encrypted journal serialization without bigint precision loss', () => {
  const quote = { amount: 1000000n, tokenIdentifier: USDB_TOKEN_ID, conversionEstimate: {amountIn: 1000n, amountOut: 1000000n, fee: 2n} };
  assert.deepEqual(decodeQuote(encodeQuote(quote)), quote);
  assert.throws(() => decodeQuote('{"x":{"$bigint":"oops"}}'));
});

test('Spark balance lock serializes sweeps and conversions, and releases after errors', async () => {
  const {withSparkBalanceLock} = await import('../src/services/sparkBalanceLock.ts');
  const events = [];
  let release;
  const pending = new Promise(resolve => {release = resolve;});
  const conversion = withSparkBalanceLock(async () => {events.push('fund'); await pending; events.push('convert'); throw Error('timeout');});
  const observed = assert.rejects(conversion, /timeout/);
  const sweep = withSparkBalanceLock(async () => events.push('sweep'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['fund']);
  release(); await observed; await sweep;
  assert.deepEqual(events, ['fund','convert','sweep']);
});
