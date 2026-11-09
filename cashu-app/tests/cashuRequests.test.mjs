import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentRequest } from '@cashu/cashu-ts';
import { bech32m } from 'bech32';
import cbor from 'cbor-sync';
import { extractCashuToken, parseCashuRequest, selectRequestMint } from '../src/services/cashuRequests.ts';

const request = new PaymentRequest(undefined, 'order-1', 100, 'sat', ['https://mint.example'], 'Coffee');

test('extracts raw, prefixed and Cashu.me URL tokens without opening URLs', () => {
  for (const input of ['cashuBabc', 'cashu:cashuBabc', 'cashu://cashuBabc', 'https://cashu.me/#token=cashuBabc', 'https://cashu.me/?token=cashuBabc']) {
    assert.equal(extractCashuToken(input), 'cashuBabc');
  }
  assert.throws(() => extractCashuToken('https://example.com/'));
  assert.throws(() => extractCashuToken('cashuBabc other text'));
});

test('decodes NUT-18 and unified Numo requests', () => {
  for (const value of [request.toEncodedCreqA(), `bitcoin:?creq=${encodeURIComponent(request.toEncodedCreqB())}&lightning=lnbc1ignored`]) {
    const parsed = parseCashuRequest(value);
    assert.equal(parsed.amount, 100);
    assert.equal(parsed.id, 'order-1');
    assert.equal(parsed.description, 'Coffee');
    assert.equal(selectRequestMint(parsed, { 'https://mint.example/': 150 }, 'https://other.example'), 'https://mint.example/');
  }
});

test('decodes the uppercase CREQ parameter emitted by current Numo', () => {
  const raw = `BITCOIN:?LIGHTNING=LNBC1IGNORED&CREQ=${encodeURIComponent(request.toEncodedCreqB().toUpperCase())}`;
  const parsed = parseCashuRequest(raw);
  assert.equal(parsed.amount, 100);
  assert.equal(parsed.id, 'order-1');
});

test('rejects ambiguous unified requests instead of picking a payment silently', () => {
  assert.throws(() => parseCashuRequest(`bitcoin:?creq=${request.toEncodedCreqA()}&CREQ=${request.toEncodedCreqB()}`), /multiple/i);
});

test('accepts the Cashu.me request builder shape with null optional fields', () => {
  const raw = { i: 'native-wallet-order', a: 100, u: 'sat', s: null, d: null };
  const encoded = 'creqA' + cbor.encode(raw).toString('base64url');
  const parsed = parseCashuRequest(encoded);
  assert.equal(parsed.amount, 100);
  assert.equal(parsed.id, 'native-wallet-order');
  assert.equal(selectRequestMint(parsed, { 'https://mint.example': 150 }, 'https://mint.example'), 'https://mint.example');
});

test('accepts legacy creq1 TLV encoding used by merchant apps', () => {
  const decoded = bech32m.decode(request.toEncodedCreqB(), 10000);
  const legacy = bech32m.encode('creq', decoded.words, 10000);
  assert.equal(parseCashuRequest(legacy).amount, 100);
});

test('rejects unsupported unit, lock tags, Lightning-only and malformed requests', () => {
  assert.throws(() => parseCashuRequest('lnbc1invoice'), /Cashu/);
  assert.throws(() => parseCashuRequest(new PaymentRequest(undefined, undefined, 1, 'usd').toEncodedCreqA()), /sat/);
  assert.throws(() => parseCashuRequest(new PaymentRequest(undefined, undefined, 1, 'sat', undefined, undefined, false, { kind: 'P2PK', data: '02' + '11'.repeat(32), tags: [['locktime', '123']] }).toEncodedCreqA()), /condition/);
  assert.throws(() => parseCashuRequest('creqAbroken'));
  assert.throws(() => parseCashuRequest(new PaymentRequest(undefined, undefined, 0, 'sat').toEncodedCreqA()), /amount/);
});

test('does not silently select a mint outside a strict merchant list', () => {
  const parsed = parseCashuRequest(request.toEncodedCreqA());
  assert.throws(() => selectRequestMint(parsed, { 'https://other.example': 1000 }, 'https://other.example'), /accepted mint/);
});

test('rejects payment method conditions the installed SDK would silently drop', () => {
  const raw = { a: 100, u: 'sat', sm: [{ mn: 'onchain', mf: 50 }] };
  const encoded = 'creqA' + cbor.encode(raw).toString('base64url');
  assert.throws(() => parseCashuRequest(encoded), /unsupported payment conditions/);
});

test('accepts plain P2PK requests and rejects invalid curve points', () => {
  const key = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const encoded = new PaymentRequest(undefined, 'locked-order', 10, 'sat', undefined, undefined, true, {kind: 'P2PK', data: key}).toEncodedCreqA();
  assert.equal(parseCashuRequest(encoded).pubkey, key);
  const invalid = new PaymentRequest(undefined, 'bad-key', 10, 'sat', undefined, undefined, true, {kind: 'P2PK', data: '02' + 'ff'.repeat(32)}).toEncodedCreqA();
  assert.throws(() => parseCashuRequest(invalid), /public key/);
});

test('rejects hostile CBOR sizes and nesting before decoder allocation', () => {
  const encoded = bytes => 'creqA' + Buffer.from(bytes).toString('base64url');
  assert.throws(() => parseCashuRequest(encoded([0x5a, 255, 255, 255, 255])), /Truncated/);
  assert.throws(() => parseCashuRequest(encoded([0x9a, 255, 255, 255, 255])), /Truncated/);
  assert.throws(() => parseCashuRequest(encoded([...Array(40).fill(0x81), 0])), /nested/);
  assert.throws(() => parseCashuRequest(encoded([0xbf])), /encoding/);
  assert.throws(() => parseCashuRequest(encoded([0xa0, 0])), /Trailing/);
});

test('recognizes QR Cashu requests before Bitcoin routing and validates Nostr delivery', async () => {
  const { isCashuRequest, qrRequestTransport, paymentRequestKey } = await import('../src/services/cashuRequests.ts');
  const { nip19, generateSecretKey, getPublicKey } = await import('nostr-tools');
  const target = nip19.nprofileEncode({ pubkey: getPublicKey(generateSecretKey()), relays: ['wss://relay.example'] });
  const qr = new PaymentRequest([{ type: 'nostr', target, tags: [['n', '17']] }], 'order-1', 100, 'sat', ['https://mint.example'], 'Coffee').toEncodedCreqA();
  for (const raw of [qr, `cashu:${qr}`, `bitcoin:?CREQ=${encodeURIComponent(qr)}`]) assert.equal(isCashuRequest(raw), true);
  assert.equal(isCashuRequest('bitcoin:bc1example'), false);
  assert.equal(isCashuRequest('cashuBtoken'), false);
  assert.deepEqual(qrRequestTransport(parseCashuRequest(qr)).relays, ['wss://relay.example']);
  assert.equal(paymentRequestKey(parseCashuRequest(qr)), paymentRequestKey(parseCashuRequest(request.toEncodedCreqA())));
  assert.throws(() => qrRequestTransport(parseCashuRequest(request.toEncodedCreqA())), /delivery/i);
  const localTarget = nip19.nprofileEncode({ pubkey: getPublicKey(generateSecretKey()), relays: ['ws://localhost:8080'] });
  const bad = new PaymentRequest([{ type: 'nostr', target: localTarget, tags: [['n','17']] }], 'x', 1, 'sat').toEncodedCreqA();
  assert.throws(() => qrRequestTransport(parseCashuRequest(bad)), /relay/i);
});
