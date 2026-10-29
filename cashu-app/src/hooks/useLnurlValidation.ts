import { useEffect, useState } from 'react';
import {
  resolveLnurlPay,
  LnurlPayParams,
  isLightningAddress,
  lightningAddressToUrl,
  decodeLnurl,
} from '../services/lnurlService';

export type LnurlValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export interface LnurlValidationResult {
  status: LnurlValidationStatus;
  params: LnurlPayParams | null;
  domain: string | null;
  error: string | null;
}

interface CacheEntry {
  params: LnurlPayParams | null;
  domain: string | null;
  error: string | null;
  expiresAt: number;
}

const VALID_TTL_MS = 5 * 60_000;
const INVALID_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

// Module-level cache shared by every caller, so a typed-in address that was already
// checked is not re-fetched when the user presses "Next" or navigates between screens.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const IDLE: LnurlValidationResult = { status: 'idle', params: null, domain: null, error: null };

const normalize = (input: string) => input.trim().toLowerCase();

const getDomain = (input: string): string | null => {
  try {
    const url = isLightningAddress(input) ? lightningAddressToUrl(input) : decodeLnurl(input);
    return new URL(url).hostname;
  } catch {
    return isLightningAddress(input) ? input.split('@')[1] ?? null : null;
  }
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

/** Translate low-level LNURL/HTTP failures into a short, user-facing reason. */
export const describeLnurlError = (err: unknown, input: string, domain: string | null): string => {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const provider = domain ?? 'the provider';
  const isAddress = isLightningAddress(input);

  const httpMatch = msg.match(/LNURL service error: (\d+)/);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    if (code === 404) return isAddress ? `No Lightning wallet found for ${input}` : 'This LNURL does not exist';
    if (code >= 500) return `${provider} is having issues (HTTP ${code})`;
    return `${provider} rejected the request (HTTP ${code})`;
  }
  if (/Unsupported LNURL tag/i.test(msg)) return 'This LNURL is not a payment request';
  if (/checksum|bech32|invalid lnurl/i.test(msg)) return 'Malformed LNURL';
  if (/timed out/i.test(msg)) return `${provider} took too long to respond`;
  if (/json|unexpected token|unexpected end/i.test(msg)) {
    return isAddress ? `${provider} does not support Lightning Addresses` : 'Invalid LNURL response';
  }
  if (/fetch|network|dns|resolve|connect|error sending request|failed to/i.test(msg)) {
    return `Couldn't reach ${provider}`;
  }
  return msg || 'Invalid Lightning address';
};

/**
 * Resolve an LNURL-pay / Lightning Address and validate the returned parameters.
 * Results are cached (valid: 5 min, invalid: 30 s) and concurrent calls are de-duplicated.
 */
export const validateLnurlPay = (input: string): Promise<CacheEntry> => {
  const key = normalize(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const domain = getDomain(key);
  const request = (async (): Promise<CacheEntry> => {
    let entry: CacheEntry;
    try {
      const params = await withTimeout(resolveLnurlPay(key), REQUEST_TIMEOUT_MS);
      if (
        !params.callback ||
        typeof params.minSendable !== 'number' ||
        typeof params.maxSendable !== 'number' ||
        params.minSendable > params.maxSendable
      ) {
        throw new Error(`${domain ?? 'Provider'} returned invalid payment parameters`);
      }
      entry = { params, domain, error: null, expiresAt: Date.now() + VALID_TTL_MS };
    } catch (e) {
      entry = {
        params: null,
        domain,
        error: describeLnurlError(e, key, domain),
        expiresAt: Date.now() + INVALID_TTL_MS,
      };
    }
    cache.set(key, entry);
    return entry;
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
};

const toResult = (entry: CacheEntry): LnurlValidationResult => ({
  status: entry.error ? 'invalid' : 'valid',
  params: entry.params,
  domain: entry.domain,
  error: entry.error,
});

/**
 * Debounced live validation of a Lightning Address / LNURL.
 * Pass `null` when the current input is not an LNURL-type destination.
 */
export const useLnurlValidation = (input: string | null, debounceMs = 500): LnurlValidationResult => {
  const key = input ? normalize(input) : null;
  const [state, setState] = useState<{ key: string | null; result: LnurlValidationResult }>({
    key: null,
    result: IDLE,
  });

  useEffect(() => {
    if (!key) {
      setState({ key: null, result: IDLE });
      return;
    }

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setState({ key, result: toResult(cached) });
      return;
    }

    let cancelled = false;
    setState({ key, result: { status: 'checking', params: null, domain: getDomain(key), error: null } });
    const timer = setTimeout(() => {
      validateLnurlPay(key).then((entry) => {
        if (!cancelled) setState({ key, result: toResult(entry) });
      });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, debounceMs]);

  if (!key) return IDLE;
  // Never expose a stale result belonging to a previous input (prevents a one-render
  // window where a new, unchecked address would appear "valid").
  if (state.key !== key) return { status: 'checking', params: null, domain: getDomain(key), error: null };
  return state.result;
};
