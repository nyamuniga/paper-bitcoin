import type { Event, EventTemplate, VerifiedEvent, Filter } from 'nostr-tools';
import type { AbstractRelay } from 'nostr-tools/abstract-relay';

type SignAuth = (event: EventTemplate) => Promise<VerifiedEvent>;
const requiresAuth = (reason: string) => /^(?:ERROR:\s*)?auth-required:/i.test(reason.trim());

/** Wait for a real subscription response and retry NIP-42 once for either relay spelling. */
export function subscribeInvoiceRelay(
  relay: Pick<AbstractRelay, 'subscribe' | 'auth'>, filter: Filter, signAuth: SignAuth,
  onEvent: (event: Event) => void, onClosed: () => void,
) {
  let closed = false, ready = false, retriedAuth = false, attempt = 0;
  let subscription: { close: () => void } | undefined;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};
  const result = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const fail = () => {
    if (closed) return;
    closed = true; attempt++; clearTimeout(deadline);
    rejectReady(new Error('Invoice relay subscription was not accepted.'));
    subscription?.close();
    onClosed();
  };
  const deadline = setTimeout(fail, 8000);
  const confirm = (current: number) => {
    if (closed || current !== attempt) return;
    ready = true; clearTimeout(deadline); resolveReady();
  };
  const subscribe = () => {
    if (closed) return;
    const current = ++attempt;
    subscription = relay.subscribe([filter], {
      // Our deadline expires before the library's synthetic EOSE timeout.
      eoseTimeout: 30000,
      oneose: () => confirm(current),
      onevent: event => { if (!closed && current === attempt) { confirm(current); onEvent(event); } },
      onclose: reason => {
        if (closed || current !== attempt) return;
        attempt++;
        if (!retriedAuth && requiresAuth(reason)) {
          retriedAuth = true;
          relay.auth(signAuth).then(subscribe).catch(fail);
        } else fail();
      },
    });
  };
  subscribe();
  return {
    ready: result,
    get active() { return ready && !closed; },
    close: () => {
      if (closed) return;
      closed = true; attempt++; clearTimeout(deadline);
      if (!ready) rejectReady(new Error('Invoice subscription cancelled.'));
      subscription?.close();
    },
  };
}

/** Use the relay's actual acknowledgement; connection failures must reject. */
export async function publishInvoiceEvent(relay: Pick<AbstractRelay, 'publish' | 'auth'>, event: Event, signAuth: SignAuth): Promise<void> {
  try { await relay.publish(event); }
  catch (error) {
    if (!(error instanceof Error) || !requiresAuth(error.message)) throw error;
    await relay.auth(signAuth);
    await relay.publish(event);
  }
}

export class InvoiceRelayConnectionError extends Error {
  details: string[];
  constructor(details: string[]) {
    super('Couldn’t connect to invoice delivery. Your request is saved. Check status to try again.');
    this.details = details;
  }
}
