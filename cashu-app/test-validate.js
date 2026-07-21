import { validateEvent } from 'nostr-tools/nip98';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import crypto from 'crypto';

const sk = generateSecretKey();
const url = 'https://www.28waves.com/api/v1/info/username';
const method = 'PUT';

const event = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['u', url],
    ['method', method],
    ['payload', crypto.createHash('sha256').update('{"username":"test"}').digest('hex')]
  ],
  content: '',
};

const signed = finalizeEvent(event, sk);

try {
  console.log(validateEvent(signed, url, method));
} catch(e) {
  console.error("Failed:", e.message);
}
