import { fetch } from '@tauri-apps/plugin-http';

export class ProxyRequestError extends Error {
  submission: 'rejected' | 'unknown';
  retryable: boolean;
  constructor(
    message: string,
    submission: 'rejected' | 'unknown' = 'unknown',
    retryable = false
  ) {
    super(message);
    this.submission = submission;
    this.retryable = retryable;
  }
}

// Generous defaults: MoMo on a bad 2G/3G link can take 20-30 s just to open
// a TLS connection, and another 20-30 s for the response body.
const DEFAULT_DEADLINE_MS = 60000;
const CONNECT_TIMEOUT_MS = 30000;

// Bound the whole operation, including response-body reads. Abort alone does
// not guarantee that a native plugin promise will settle after suspension.
export async function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_DEADLINE_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProxyRequestError(
              'The request timed out. Check the transfer status before trying again.',
              'unknown',
              true // timeouts are transient — safe to retry for reads
            )
          );
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestProxyJson(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_DEADLINE_MS
): Promise<any> {
  try {
    return await withDeadline(async signal => {
      const response = await fetch(url, {
        ...options,
        signal,
        connectTimeout: CONNECT_TIMEOUT_MS,
      });
      if (!response.ok) {
        // Match the backend's pre-provider decryption rejection, not an
        // arbitrary upstream 401/403 that could follow submission.
        const errorBody = await response.json().catch(() => null);
        if (
          response.status === 401 &&
          errorBody?.code === 'INVALID_ENCRYPTED_REQUEST'
        ) {
          throw new ProxyRequestError(
            'The payment service no longer accepts this app’s credentials. Update BitNotes to the latest version. If it is already updated, contact support.',
            'rejected',
            false // not transient — retrying won't help
          );
        }
        // 5xx / 408 / 429 are transient server-side problems.
        const retryable =
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429;
        throw new ProxyRequestError(
          'The payment service could not confirm this request. Check the transfer status before trying again.',
          'unknown',
          retryable
        );
      }
      return await response.json();
    }, timeoutMs);
  } catch (error) {
    if (error instanceof ProxyRequestError) throw error;
    // fetch() itself threw (DNS, TCP reset, TLS failure) → transient.
    throw new ProxyRequestError(
      'Could not confirm a response from the payment service. Check your connection and the transfer status before trying again.',
      'unknown',
      true
    );
  }
}

// Helper for idempotent reads (status checks). Do NOT use for submissions
// unless the backend deduplicates on the transaction id.
export async function withRetries<T>(
  operation: () => Promise<T>,
  {
    maxAttempts = 5,
    baseDelayMs = 1500,
    maxDelayMs = 15000,
    shouldRetry = (e: any) =>
      e instanceof ProxyRequestError ? e.retryable : true,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (e: any) => boolean;
  } = {}
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) break;
      if (!shouldRetry(error)) throw error;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}