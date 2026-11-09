import { decodePaymentRequest } from '@cashu/cashu-ts';
import { bech32m } from 'bech32';
import cbor from 'cbor-sync';
import { Buffer } from 'buffer';
import { Point } from '@noble/secp256k1';
import { nip19 } from 'nostr-tools';

export interface CashuPaymentRequest {
  encoded: string;
  id?: string;
  amount: number;
  description?: string;
  mints?: string[];
  pubkey?: string;
}

const MAX_PAYLOAD = 28671;

// The CBOR decoder trusts declared collection/string sizes. Validate its input
// before it can allocate from attacker-controlled lengths or recurse deeply.
function validateCbor(bytes: Uint8Array): void {
  let offset = 0;
  const visit = (depth: number): void => {
    if (depth > 32 || offset >= bytes.length) throw new Error('Invalid or excessively nested Cashu request.');
    const header = bytes[offset++];
    const type = header >> 5;
    const additional = header & 31;
    let length = additional;
    if (additional >= 24) {
      if (additional > 27) throw new Error('Unsupported CBOR length encoding.');
      const width = 2 ** (additional - 24);
      if (offset + width > bytes.length) throw new Error('Truncated Cashu request.');
      length = 0;
      for (let i = 0; i < width; i++) length = length * 256 + bytes[offset++];
      if (type !== 7 && !Number.isSafeInteger(length)) throw new Error('Cashu request value is too large.');
    }
    if (type === 2 || type === 3) {
      if (length > bytes.length - offset) throw new Error('Truncated Cashu request string.');
      offset += length;
    } else if (type === 4 || type === 5) {
      const count = length * (type === 5 ? 2 : 1);
      if (count > bytes.length - offset) throw new Error('Truncated Cashu request collection.');
      for (let i = 0; i < count; i++) visit(depth + 1);
    } else if (type === 6) visit(depth + 1);
  };
  visit(0);
  if (offset !== bytes.length) throw new Error('Trailing data in Cashu request.');
}
export function extractCashuToken(value: string): string {
  let token = value.trim();
  if (token.length > MAX_PAYLOAD) throw new Error('Cashu payload is too large.');
  if (/^https?:/i.test(token)) {
    const url = new URL(token);
    token = new URLSearchParams(url.hash.replace(/^#\/?/, '')).get('token') || url.searchParams.get('token') || '';
  }
  token = token.replace(/^cashu:(\/\/)?/i, '');
  if (!/^cashu[AB][A-Za-z0-9_-]+=*$/.test(token)) throw new Error('No valid Cashu token found.');
  return token;
}

export function parseCashuRequest(value: string): CashuPaymentRequest {
  let encoded = value.trim().replace(/^cashu:(\/\/)?/i, '');
  if (encoded.length > MAX_PAYLOAD) throw new Error('Cashu payload is too large.');
  if (/^bitcoin:/i.test(encoded)) {
    const requests = [...new URL(encoded).searchParams].filter(([key]) => key.toLowerCase() === 'creq');
    if (requests.length > 1) throw new Error('The reader supplied multiple Cashu payment requests.');
    encoded = requests[0]?.[1] || '';
  }
  // Older Numo builds use the same TLV format with the legacy "creq" HRP.
  if (/^creq1/i.test(encoded)) {
    const legacy = bech32m.decode(encoded, MAX_PAYLOAD);
    encoded = bech32m.encode('creqb', legacy.words, MAX_PAYLOAD);
  }
  if (!/^creq(A|b1)/i.test(encoded)) throw new Error('This reader did not provide a supported Cashu payment request.');
  if (/^creqa/i.test(encoded)) encoded = 'creqA' + encoded.slice(5);
  // Check fields not yet represented by this version of cashu-ts instead of silently dropping them.
  if (encoded.startsWith('creqA')) {
    if (!/^[A-Za-z0-9_+\/-]+=*$/.test(encoded.slice(5))) throw new Error('Invalid Cashu request encoding.');
    const bytes = Buffer.from(encoded.slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    validateCbor(bytes);
    const raw = cbor.decode(bytes) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || raw.sm !== undefined || raw.mp === true) {
      throw new Error('This payment request uses unsupported payment conditions.');
    }
  }
  const request = decodePaymentRequest(encoded);
  const amount = Number(request.amount?.toString());
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('The merchant must specify a positive whole-sat amount.');
  if (request.unit !== 'sat') throw new Error('Only sat payment requests are supported.');
  let pubkey: string | undefined;
  if (request.nut10) {
    const lock = request.nut10;
    if (lock.kind !== 'P2PK' || (lock.tags?.length ?? 0) > 0 || !/^(02|03)[a-fA-F0-9]{64}$/.test(lock.data || '')) {
      throw new Error('This payment request uses unsupported spending conditions.');
    }
    pubkey = lock.data;
    try { Point.fromHex(pubkey).assertValidity(); }
    catch { throw new Error('The merchant supplied an invalid spending condition public key.'); }
  }
  if (request.mints && (!request.mints.length || request.mints.some(m => {
    try { return new URL(m).protocol !== 'https:'; } catch { return true; }
  }))) throw new Error('The merchant supplied an invalid mint list.');
  return { encoded, id: request.id, amount, description: request.description, mints: request.mints, pubkey };
}

export function isCashuRequest(value: string): boolean {
  const raw = value.trim().replace(/^cashu:(\/\/)?/i, '');
  if (/^creq(?:a|b1|1)/i.test(raw)) return true;
  if (!/^bitcoin:/i.test(raw)) return false;
  try { return [...new URL(raw).searchParams.keys()].some(key => key.toLowerCase() === 'creq'); }
  catch { return false; }
}

/** Keep retries bound to one invoice even when switching across repeated QR scans. */
export function paymentRequestKey(request: CashuPaymentRequest): string {
  return request.id ? 'cashu-invoice:' + JSON.stringify([request.id, request.amount,
    request.mints?.map(m => m.replace(/\/+$/, '')).sort() ?? null, request.pubkey ?? null]) : request.encoded;
}

export function qrRequestTransport(request: CashuPaymentRequest): { pubkey: string; relays: string[] } {
  const transports = decodePaymentRequest(request.encoded).transport || [];
  for (const transport of transports) {
    if (transport.type !== 'nostr' || !transport.tags?.some(tag => tag[0] === 'n' && tag.slice(1).includes('17'))) continue;
    const decoded = nip19.decode(transport.target);
    if (decoded.type !== 'nprofile') throw new Error('Unsupported QR delivery address.');
    try { Point.fromHex('02' + decoded.data.pubkey).assertValidity(); }
    catch { throw new Error('Invalid QR payment recipient public key.'); }
    const relays = [...new Set(decoded.data.relays || [])];
    if (!relays.length || relays.length > 4 || relays.some(relay => {
      try {
        const url = new URL(relay);
        return relay.length > 256 || url.protocol !== 'wss:' || !!url.username || !!url.password ||
          /^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname) || url.hostname.endsWith('.local');
      } catch { return true; }
    })) throw new Error('The invoice supplied an unsupported delivery relay.');
    return { pubkey: decoded.data.pubkey, relays };
  }
  throw new Error('This QR invoice has no supported encrypted delivery transport. Ask for a Nostr payment request.');
}

export function selectRequestMint(request: CashuPaymentRequest, balances: Record<string, number>, preferred: string): string {
  const normalize = (url: string) => url.replace(/\/+$/, '');
  const available = Object.keys(balances).filter(mint => balances[mint] >= request.amount &&
    (!request.mints || request.mints.some(m => normalize(m) === normalize(mint))));
  const mint = available.find(m => normalize(m) === normalize(preferred)) || available[0];
  if (!mint) throw new Error('Insufficient balance at an accepted mint. Fund an accepted mint and try again.');
  return mint;
}
