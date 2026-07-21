import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import crypto from 'crypto';

async function test() {
  const sk = generateSecretKey();
  
  const event = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'https://npubx.cash/api/v2/user/mint'],
      ['method', 'PATCH'],
      ['payload', crypto.createHash('sha256').update('{"mint_url":"https://test.mint"}').digest('hex')]
    ],
    content: '',
  };
  const signed = finalizeEvent(event, sk);
  const authHeader = "Nostr " + Buffer.from(JSON.stringify(signed)).toString('base64');
  
  const res = await fetch('https://npubx.cash/api/v2/user/mint', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: '{"mint_url":"https://test.mint"}'
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
test();
