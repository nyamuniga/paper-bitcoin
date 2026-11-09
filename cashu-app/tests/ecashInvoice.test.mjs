import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePaymentRequest, getDecodedToken } from '@cashu/cashu-ts';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { wrapEvent } from 'nostr-tools/nip17';
import { createInvoice, invoicePayloadToken, decryptInvoicePayment } from '../src/services/ecashInvoice.ts';
const mint = 'https://mint.example';
const proof = { amount: 101, id: '009a1f293253e41e', secret: 'fixture', C: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' };
const invoice = createInvoice(100, mint, 'Coffee', getPublicKey(generateSecretKey()), ['wss://relay.example']);
const payload = () => ({ id: invoice.id, mint, unit: 'sat', proofs: [proof] });
test('creates a single-use QR request with an encrypted delivery transport', () => {
  const qr = decodePaymentRequest(invoice.qr);
  for (const request of [qr]) {
    assert.equal(request.id, invoice.id);
    assert.equal(request.amount.toString(), '100');
    assert.deepEqual(request.mints, [mint]);
    assert.equal(request.singleUse, true);
  }
  assert.equal(qr.transport[0].type, 'nostr');
  assert.deepEqual(nip19.decode(qr.transport[0].target).data.relays, ['wss://relay.example']);
  assert.throws(() => createInvoice(0, mint, '', getPublicKey(generateSecretKey()), []));
  assert.throws(() => createInvoice(1, 'http://untrusted.example', '', getPublicKey(generateSecretKey()), []));
});
test('binds QR delivery to invoice ID, mint, sats, and positive bounded proofs', () => {
  assert.equal(getDecodedToken(invoicePayloadToken(JSON.stringify(payload()), invoice), [proof.id]).proofs[0].amount.toString(), '101');
  for (const patch of [{ id: 'other' }, { mint: 'https://other.example' }, { unit: 'usd' }, { proofs: [] }, { proofs: [{ ...proof, amount: 1 }] }]) {
    assert.throws(() => invoicePayloadToken(JSON.stringify({ ...payload(), ...patch }), invoice));
  }
  assert.throws(() => invoicePayloadToken('x'.repeat(100001), invoice));
});
test('accepts authenticated NIP-17 delivery only for this recipient and invoice', () => {
  const secret = generateSecretKey(), pubkey = getPublicKey(secret);
  const event = wrapEvent(generateSecretKey(), { publicKey: pubkey }, JSON.stringify(payload()));
  assert.match(decryptInvoicePayment(event, secret, invoice), /^cashuB/);
  assert.throws(() => decryptInvoicePayment(event, generateSecretKey(), invoice));
  assert.throws(() => decryptInvoicePayment({ ...event, sig: '0'.repeat(128) }, secret, invoice));
});

test('accepts exact integer string amounts without coercing malformed or unsafe values', () => {
  const stringPayload = { ...payload(), proofs: [{ ...proof, amount: '101' }] };
  assert.match(invoicePayloadToken(JSON.stringify(stringPayload), invoice), /^cashuB/);
  for (const amount of ['1e2', '100.5', '-1', '9007199254740993', '', true]) {
    assert.throws(() => invoicePayloadToken(JSON.stringify({ ...payload(), proofs: [{ ...proof, amount }] }), invoice));
  }
});

test('advertises only confirmed inbox relays without changing invoice identity', async () => {
  const { invoiceQrWithRelays } = await import('../src/services/ecashInvoice.ts');
  const pubkey = getPublicKey(generateSecretKey());
  const updated = decodePaymentRequest(invoiceQrWithRelays(invoice, pubkey, ['wss://ready.example']));
  assert.equal(updated.id, invoice.id);
  assert.equal(updated.amount.toString(), '100');
  assert.deepEqual(nip19.decode(updated.transport[0].target).data.relays, ['wss://ready.example']);
});

test('emits URL-safe NUT-18 invoices accepted by Cashu.me native decoders', async () => {
  const { invoiceQrWithRelays } = await import('../src/services/ecashInvoice.ts');
  const pubkey = getPublicKey(generateSecretKey());
  // These valid UTF-8 descriptions exercise + and / in ordinary Base64.
  for (const description of ['Coffee ☕', '😀😀😀', 'Pay ~~~~', 'éÿ🫶']) {
    const created = createInvoice(100, mint, description, pubkey, ['wss://relay.example']);
    for (const qr of [created.qr, invoiceQrWithRelays(created, pubkey, ['wss://ready.example'])]) {
      assert.match(qr, /^creqA[A-Za-z0-9_-]+={0,2}$/);
      assert.equal(decodePaymentRequest(qr).description, description);
      assert.equal(decodePaymentRequest(qr).amount.toString(), '100');
    }
  }
});

test('Cashu.me native authenticated envelope reaches invoice validation without an inner recipient tag', async () => {
  const {readFile} = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/cashume-nostr-payment.json', import.meta.url), 'utf8'));
  // Upstream's interoperability vector intentionally has no payment proofs. Reject it at the
  // payload layer, rather than rejecting its correctly authenticated native envelope.
  assert.throws(() => decryptInvoicePayment(fixture.event, Uint8Array.from(Buffer.from(fixture.recipient_secret, 'hex')),
    {id:'request-fixture',amount:1,mint:'https://mint.example.com',qr:''}), error => error.message === 'Invalid payment proofs.');
});

test('accepts legacy native rumors without p tags while rejecting foreign recipient or impersonated author', async () => {
  const {finalizeEvent} = await import('nostr-tools');
  const {encrypt,getConversationKey} = await import('nostr-tools/nip44');
  const receiver=generateSecretKey(),sender=generateSecretKey();
  const recipient=getPublicKey(receiver),author=getPublicKey(sender);
  const wrap=(patch={},badSeal=false)=>{
    const rumor={kind:14,pubkey:author,created_at:1700000000,tags:[],content:JSON.stringify(payload()),...patch};
    const seal=finalizeEvent({kind:13,created_at:1700000000,tags:[],content:encrypt(JSON.stringify(rumor),getConversationKey(sender,recipient))},sender);
    if(badSeal)seal.sig='0'.repeat(128);
    const ephemeral=generateSecretKey();
    return finalizeEvent({kind:1059,created_at:1700000000,tags:[['p',recipient]],content:encrypt(JSON.stringify(seal),getConversationKey(ephemeral,recipient))},ephemeral);
  };
  assert.match(decryptInvoicePayment(wrap(),receiver,invoice),/^cashuB/);
  assert.throws(()=>decryptInvoicePayment(wrap({tags:[['p',getPublicKey(generateSecretKey())]]}),receiver,invoice));
  assert.throws(()=>decryptInvoicePayment(wrap({pubkey:getPublicKey(generateSecretKey())}),receiver,invoice));
  assert.throws(()=>decryptInvoicePayment(wrap({kind:4}),receiver,invoice));
  assert.throws(()=>decryptInvoicePayment(wrap({},true),receiver,invoice), /signature is invalid/);
});
