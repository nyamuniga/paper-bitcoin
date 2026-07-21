import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import crypto from 'crypto';

async function test() {
  const sk = generateSecretKey();
  
  // 1. Create User
  const createEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'https://npubx.cash/api/v1/user'],
      ['method', 'POST']
    ],
    content: '',
  };
  const createSigned = finalizeEvent(createEvent, sk);
  const createAuthHeader = "Nostr " + Buffer.from(JSON.stringify(createSigned)).toString('base64');
  
  const createRes = await fetch('https://npubx.cash/api/v1/user', {
    method: 'POST',
    headers: {
      'Authorization': createAuthHeader
    }
  });
  console.log("Create Status:", createRes.status);
  console.log("Create Response:", await createRes.text());

  // 2. Set Username
  const putEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'https://npubx.cash/api/v1/info/username'],
      ['method', 'PUT'],
      ['payload', crypto.createHash('sha256').update('{"username":"testuser12345"}').digest('hex')]
    ],
    content: '',
  };
  const putSigned = finalizeEvent(putEvent, sk);
  const putAuthHeader = "Nostr " + Buffer.from(JSON.stringify(putSigned)).toString('base64');
  
  const putRes = await fetch('https://npubx.cash/api/v1/info/username', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': putAuthHeader
    },
    body: '{"username":"testuser12345"}'
  });
  console.log("Put Status:", putRes.status);
  console.log("Put Response:", await putRes.text());
}
test();
