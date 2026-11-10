import test from 'node:test';
import assert from 'node:assert/strict';
import cbor from 'cbor-sync';
import { parseReceivedTokenPreview } from '../src/services/receivedTokenPreview.ts';

const v3 = (amount = 8, unit = 'sat') => 'cashuA' + Buffer.from(JSON.stringify({
  token: [{ mint: 'https://mint.example', proofs: [{ id: '0011223344556677', amount, secret: 'fixture', C: '02' + '11'.repeat(32) }] }], unit,
})).toString('base64url');

test('previews token mint and value without claiming, including URI and URL wrappers', () => {
  const token = v3();
  for (const input of [token, 'cashu:' + token, 'cashu://' + token, 'https://cashu.me/#token=' + token]) {
    assert.deepEqual(parseReceivedTokenPreview(input), { token, mint: 'https://mint.example', amount: 8 });
  }
});

test('previews cashuB tokens without requiring full keyset IDs or mint access', () => {
  const token = 'cashuB' + Buffer.from(cbor.encode({ m: 'https://mint.example', u: 'sat', t: [{ i: Buffer.from('0011223344556677', 'hex'), p: [{ a: 4, s: 'fixture', c: Buffer.from('02' + '11'.repeat(32), 'hex') }] }] })).toString('base64url');
  assert.equal(parseReceivedTokenPreview(token).amount, 4);
});

test('rejects malformed, zero, unsafe, and non-sat tokens before offering claims', () => {
  for (const token of ['garbage', 'cashuBbroken', v3(0), v3(Number.MAX_SAFE_INTEGER + 1), v3(1, 'usd')]) {
    assert.throws(() => parseReceivedTokenPreview(token));
  }
});
