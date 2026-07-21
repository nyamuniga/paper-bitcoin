import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import crypto from 'crypto';

async function test() {
  const sk = generateSecretKey();
  
  const event = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'https://www.28waves.com/api/v1/info/username'],
      ['method', 'PUT'],
      ['payload', crypto.createHash('sha256').update('{"username":"wrong"}').digest('hex')]
    ],
    content: '',
  };
  const signed = finalizeEvent(event, sk);
  const authHeader = "Nostr " + Buffer.from(JSON.stringify(signed)).toString('base64');
  
  const res = await fetch('https://www.28waves.com/api/v1/info/username', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: '{"username":"testuser123"}'
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
test();
