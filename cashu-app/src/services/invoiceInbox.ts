import { SimplePool, finalizeEvent, getPublicKey } from 'nostr-tools';
import { decryptInvoicePayment, InvoiceMessageError } from './ecashInvoice';
import type { EcashInvoice } from './ecashInvoice';
import { InvoiceRelayConnectionError, publishInvoiceEvent, subscribeInvoiceRelay } from './nostrInvoiceTransport';

/** Reconnect a saved key, advertising only delivery routes with an accepted subscription. */
export function openInvoiceInbox(invoice: EcashInvoice, secret: Uint8Array, relays: string[], onPayment: (token: string) => void, onDisconnected: () => void, onRejected?: (message: string) => void, onRelaysChanged?: (relays: string[]) => void) {
  const pool = new SimplePool();
  const pubkey = getPublicKey(secret);
  const signAuth = async (event: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(event, secret);
  let closed = false, established = false;
  const subscriptions: ReturnType<typeof subscribeInvoiceRelay>[] = [];
  const active = new Map<string, Awaited<ReturnType<typeof pool.ensureRelay>>>();
  const failures: string[] = [];
  let resolveReady: (relays: string[]) => void = () => {};
  const refreshRoutes = () => {
    if (closed || !established) return;
    const routes = [...active.keys()];
    onRelaysChanged?.(routes);
    if (!routes.length) { onDisconnected(); return; }
    const announcement = finalizeEvent({kind:10050, created_at:Math.floor(Date.now()/1000), tags:routes.map(url => ['relay', url]), content:''}, secret);
    void Promise.allSettled([...active.values()].map(relay => publishInvoiceEvent(relay, announcement, signAuth)));
  };
  const ready = new Promise<string[]>((resolve, reject) => {
    resolveReady = resolve;
    let remaining = relays.length;
    if (!remaining) {reject(new InvoiceRelayConnectionError(['No delivery relays were saved for this request.']));return;}
    for (const url of relays) {
      // Start each subscription as soon as its own socket connects. One blocked relay
      // must not delay usable routes, and late arrivals keep the QR's route list current.
      void (async () => {
        const relay = await pool.ensureRelay(url, {connectionTimeout:15000});
        if (closed) return;
        const sub = subscribeInvoiceRelay(relay, {kinds:[1059], '#p':[pubkey], limit:200}, signAuth, event => {
          if (closed) return;
          let token: string;
          try {token = decryptInvoicePayment(event, secret, invoice);}
          catch (error) {
            onRejected?.(error instanceof InvoiceMessageError ? error.message : 'An encrypted message arrived but could not be decoded as an invoice payment.');
            return;
          }
          onPayment(token);
        }, () => {
          if (active.delete(url)) refreshRoutes();
        });
        subscriptions.push(sub);
        await sub.ready;
        if (closed || !sub.active) return;
        active.set(url, relay);
        established = true;
        refreshRoutes();
        resolve([...active.keys()]);
      })().catch(error => {
        if (closed) return;
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`${new URL(url).host}: ${reason.slice(0, 200)}`);
        if (--remaining === 0 && !established) reject(new InvoiceRelayConnectionError(failures));
      });
    }
  });
  return {ready, close: () => {
    if (closed) return;
    closed = true;
    resolveReady([]);
    subscriptions.forEach(sub => sub.close());
    pool.destroy(); secret.fill(0);
  }};
}
