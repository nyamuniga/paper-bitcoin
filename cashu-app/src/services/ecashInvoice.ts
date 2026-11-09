import { PaymentRequest, PaymentRequestTransportType, getEncodedToken, decodePaymentRequest } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import { getPublicKey, nip19, verifyEvent } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import { decrypt, getConversationKey } from 'nostr-tools/nip44';

export interface EcashInvoice {
  id: string;
  amount: number;
  mint: string;
  qr: string;
}
const normalize = (mint: string) => mint.replace(/\/+$/, '');
export class InvoiceMessageError extends Error {}

/** NUT-18 requires URL-safe Base64; cashu-ts 4.x currently emits the standard alphabet. */
function encodeInvoiceRequest(request: PaymentRequest): string {
  return request.toEncodedCreqA().replace(/\+/g, '-').replace(/\//g, '_');
}

/** Replace delivery addresses only after the recipient is listening on them. */
export function invoiceQrWithRelays(invoice: EcashInvoice, pubkey: string, relays: string[]): string {
  const request = decodePaymentRequest(invoice.qr);
  return encodeInvoiceRequest(new PaymentRequest([{ type: PaymentRequestTransportType.NOSTR,
    target: nip19.nprofileEncode({ pubkey, relays }), tags: [['n', '17']] }],
    invoice.id, invoice.amount, 'sat', [invoice.mint], request.description, true));
}

export function createInvoice(amount: number, mint: string, description: string, pubkey: string, relays: string[]): EcashInvoice {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a positive whole-sat amount.');
  if (new URL(mint).protocol !== 'https:') throw new Error('Select an HTTPS mint for this invoice.');
  if (description.length > 160) throw new Error('Keep the description under 160 characters.');
  if (!relays.length || relays.some(relay => new URL(relay).protocol !== 'wss:')) throw new Error('No secure delivery relay is available.');
  const id = crypto.randomUUID();
  const nprofile = nip19.nprofileEncode({ pubkey, relays });
  const qr = encodeInvoiceRequest(new PaymentRequest([{ type: PaymentRequestTransportType.NOSTR, target: nprofile, tags: [['n', '17']] }], id, amount, 'sat', [mint], description || undefined, true));
  return { id, amount, mint, qr };
}

export function invoicePayloadToken(content: string, invoice: EcashInvoice): string {
  if (content.length > 100000) throw new InvoiceMessageError('Payment message is too large.');
  const payload = JSON.parse(content);
  if (!payload || payload.id !== invoice.id || payload.unit !== 'sat' || typeof payload.mint !== 'string' || normalize(payload.mint) !== normalize(invoice.mint)) {
    throw new InvoiceMessageError('Payment does not match this invoice.');
  }
  if (!Array.isArray(payload.proofs) || !payload.proofs.length || payload.proofs.length > 256) throw new InvoiceMessageError('Invalid payment proofs.');
  let total = 0;
  const proofs = payload.proofs.map((proof: Proof & { amount: unknown }) => {
    const amount = typeof proof.amount === 'string' && /^[0-9]{1,16}$/.test(proof.amount) ? Number(proof.amount) : proof.amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || typeof proof.secret !== 'string' || proof.secret.length > 4096 || !/^[a-f0-9]{16,66}$/i.test(proof.id) || !/^(02|03)[a-f0-9]{64}$/i.test(proof.C)) {
      throw new InvoiceMessageError('Invalid payment proof.');
    }
    total += amount;
    return { ...proof, amount };
  });
  if (!Number.isSafeInteger(total) || total < invoice.amount) throw new InvoiceMessageError('Payment is below the requested amount.');
  return getEncodedToken({ mint: invoice.mint, unit: 'sat', proofs });
}

export function decryptInvoicePayment(event: Event, secret: Uint8Array, invoice: EcashInvoice): string {
  if (typeof event.content !== 'string' || event.content.length > 200000) throw new InvoiceMessageError('Payment message is too large.');
  // Verify a fresh object: do not trust a cached verification marker from a caller.
  const wrap = JSON.parse(JSON.stringify(event)) as Event;
  if (wrap.kind !== 1059 || !verifyEvent(wrap) || !wrap.tags.some(tag => tag[0] === 'p' && tag[1] === getPublicKey(secret))) {
    throw new InvoiceMessageError('The encrypted payment signature or recipient is invalid.');
  }
  let seal: Event;
  let message;
  try {
    seal = JSON.parse(decrypt(wrap.content, getConversationKey(secret, wrap.pubkey))) as Event;
    if (seal.kind !== 13 || !verifyEvent(seal)) throw new InvoiceMessageError('The payment sender signature is invalid.');
    message = JSON.parse(decrypt(seal.content, getConversationKey(secret, seal.pubkey)));
  } catch (error) {
    if (error instanceof InvoiceMessageError) throw error;
    throw new InvoiceMessageError('The encrypted payment could not be opened with this request’s receiving key. Reopen the original request in History to check again.');
  }
  // Some Cashu.me/CDK senders omit p tags inside the rumor. The signed, encrypted
  // wrapper already binds the recipient; the seal still must authenticate the rumor author.
  if (!message || typeof message !== 'object' || message.kind !== 14 || message.pubkey !== seal.pubkey || !Array.isArray(message.tags) || !message.tags.every((tag: unknown) => Array.isArray(tag) && tag.every(value => typeof value === 'string'))) {
    throw new InvoiceMessageError('The payment message has an invalid sender or format.');
  }
  const recipients = message.tags.filter((tag: string[]) => tag[0] === 'p');
  if (recipients.length && !recipients.some((tag: string[]) => tag[1] === getPublicKey(secret))) {
    throw new InvoiceMessageError('The payment message is addressed to another recipient.');
  }
  if (typeof message.content !== 'string') throw new InvoiceMessageError('The payment message has no invoice payload.');
  try { return invoicePayloadToken(message.content, invoice); }
  catch (error) {
    if (error instanceof InvoiceMessageError) throw error;
    throw new InvoiceMessageError('The payment message does not contain a readable Cashu invoice payload.');
  }
}
