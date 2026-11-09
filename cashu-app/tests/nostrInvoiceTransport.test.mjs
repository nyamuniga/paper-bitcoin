import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeInvoiceRelay, publishInvoiceEvent } from '../src/services/nostrInvoiceTransport.ts';

test('authenticates and resubscribes after the ERROR-prefixed relay response', async () => {
  const attempts = [];
  let auths = 0;
  const relay = {
    subscribe(_filters, params) { attempts.push(params); return { close() {} }; },
    async auth() { auths++; },
  };
  const sub = subscribeInvoiceRelay(relay, { kinds: [1059] }, async () => ({}), () => {}, () => {});
  attempts[0].onclose('ERROR: auth-required: requested filter requires authentication');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auths, 1);
  assert.equal(attempts.length, 2);
  attempts[1].oneose();
  await sub.ready;
  sub.close();
});

test('does not report ready for a rejected subscription or reopen after cancellation', async () => {
  const attempts = [];
  let finishAuth;
  const relay = {
    subscribe(_filters, params) { attempts.push(params); return { close() {} }; },
    auth() { return new Promise(resolve => { finishAuth = resolve; }); },
  };
  const sub = subscribeInvoiceRelay(relay, {}, async () => ({}), () => {}, () => {});
  const rejected = assert.rejects(sub.ready);
  attempts[0].onclose('ERROR: auth-required: authentication required');
  sub.close();
  finishAuth();
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts.length, 1);
});

test('a relay publication rejection stays a failure, with one authentication retry', async () => {
  let sends = 0, auths = 0;
  const relay = {
    async publish() { sends++; throw new Error('ERROR: auth-required: rejected'); },
    async auth() { auths++; },
  };
  await assert.rejects(publishInvoiceEvent(relay, {}, async () => ({})));
  assert.equal(sends, 2);
  assert.equal(auths, 1);
});
