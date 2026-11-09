import { Buffer } from 'buffer';
import { SimplePool, finalizeEvent, generateSecretKey } from 'nostr-tools';
import { wrapEvent } from 'nostr-tools/nip17';
import { publishInvoiceEvent } from './nostrInvoiceTransport';

/** Deliver an already-prepared token. Retrying never creates new proofs. */
export async function deliverQrPayment(rawV3Token: string, requestId: string | undefined, target: { pubkey: string; relays: string[] }): Promise<void> {
  if (!rawV3Token.startsWith('cashuA') || rawV3Token.length > 100000) throw new Error('The saved payment token cannot be delivered. Recover it in History.');
  const decoded = JSON.parse(Buffer.from(rawV3Token.slice(6).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  if (!Array.isArray(decoded.token) || decoded.token.length !== 1 || decoded.unit && decoded.unit !== 'sat') throw new Error('Unsupported payment token.');
  const entry = decoded.token[0];
  if (typeof entry.mint !== 'string' || !Array.isArray(entry.proofs) || !entry.proofs.length) throw new Error('Invalid saved payment token.');
  const payload = JSON.stringify({ id: requestId, mint: entry.mint, unit: 'sat', proofs: entry.proofs });
  const secret = generateSecretKey();
  const pool = new SimplePool();
  const signAuth = async (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, secret);
  const event = wrapEvent(secret, { publicKey: target.pubkey }, payload);
  try {
    const connections = await Promise.allSettled(target.relays.map(url => pool.ensureRelay(url, { connectionTimeout: 6000 })));
    const relays = connections.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!relays.length) throw new Error('Cannot connect to the receiver’s delivery relays. Retry the same payment token.');
    const results = await Promise.allSettled(relays.map(relay => publishInvoiceEvent(relay, event, signAuth)));
    if (!results.some(result => result.status === 'fulfilled')) throw new Error('The relays did not accept the payment. Retry the same token; it remains in History.');
  } finally { pool.destroy(); secret.fill(0); }
}
