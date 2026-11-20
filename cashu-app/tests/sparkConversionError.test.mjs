import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSparkConversionMinimum } from '../src/services/sparkConversionError.ts';

// Synthetic examples of the currently recognized provider wording, not a
// guarantee that future SDK/provider versions will keep this message format.
const fixtures = JSON.parse(readFileSync(
  new URL('./fixtures/spark-conversion-errors.json', import.meta.url),
  'utf8',
));

for (const { name, message, expected } of fixtures) {
  test(`Spark conversion minimum: ${name}`, () => {
    const minimum = expected === null ? null : {
      attempted: BigInt(expected.attempted),
      minimum: BigInt(expected.minimum),
    };

    assert.deepEqual(parseSparkConversionMinimum(message), minimum);
    assert.deepEqual(parseSparkConversionMinimum(new Error(message)), minimum);
  });
}

test('Spark conversion minimum ignores unsupported error payloads', () => {
  for (const error of [undefined, null, false, 800, {}, { message: fixtures[0].message }]) {
    assert.equal(parseSparkConversionMinimum(error), null);
  }
});
