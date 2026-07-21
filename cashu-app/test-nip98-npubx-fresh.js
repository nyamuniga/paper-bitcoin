import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import crypto from 'crypto';
import { execSync } from 'child_process';

async function test() {
  const sk = generateSecretKey();
  
  const event = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'https://npubx.cash/api/v1/info/username'],
      ['method', 'PUT'],
      ['payload', crypto.createHash('sha256').update('{"username":"testuser123"}').digest('hex')]
    ],
    content: '',
  };
  const signed = finalizeEvent(event, sk);
  const authHeader = "Nostr " + Buffer.from(JSON.stringify(signed)).toString('base64');
  
  console.log("Testing with curl immediately...");
  const cmd = `curl -s -v -X PUT "https://npubx.cash/api/v1/info/username" -H "Content-Type: application/json" -H "Authorization: ${authHeader}" -d '{"username":"testuser123"}'`;
  const output = execSync(cmd, { encoding: 'utf8' });
  console.log(output);
}
test();
