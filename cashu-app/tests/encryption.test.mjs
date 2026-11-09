import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createHmac, webcrypto } from 'node:crypto';
import { registerHooks } from 'node:module';
const source = new URL('../src/utils/encryption.ts', import.meta.url).href;
const key = Buffer.from(Array.from({length:32},(_,i)=>i)); // Public test key, never a deployment secret.
globalThis.window = {crypto:webcrypto};
globalThis.__encryptionFixtureKey = key.toString('base64');
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL === source && specifier === '../constants') return {
    url:'data:text/javascript,'+encodeURIComponent('export const ENCRYPTION_KEY=globalThis.__encryptionFixtureKey;'),shortCircuit:true,
  };
  return next(specifier,context);
}});
const {Encryption}=await import(source);

test('proxy envelope uses a 16-byte random IV and decrypts with independent AES-256-CBC',async()=>{
  const payload={transaction:{amount:'10'},security:{nonce:'fixture-nonce'}};
  const first=await Encryption.encrypt(payload),second=await Encryption.encrypt(payload);
  assert.equal(Buffer.from(first.iv,'hex').length,16);
  assert.notEqual(first.iv,second.iv);
  const decrypt=createDecipheriv('aes-256-cbc',key,Buffer.from(first.iv,'hex'));
  const plain=Buffer.concat([decrypt.update(Buffer.from(first.encrypted,'base64')),decrypt.final()]).toString('utf8');
  assert.deepEqual(JSON.parse(plain),payload);
  assert.equal(first.hmac,createHmac('sha256',key).update(plain).digest('hex'));
  assert.deepEqual(await Encryption.decrypt(first.encrypted,first.iv,first.hmac),payload);
});
test('generated AES keys contain 32 bytes rather than treating each random byte as a word',async()=>{
  const generated=await Encryption.generateKey();
  assert.equal(Buffer.from(generated,'base64').length,32);
});
