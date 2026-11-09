import { fetch } from '@tauri-apps/plugin-http';

export class ProxyRequestError extends Error {
  submission: 'rejected' | 'unknown';
  constructor(message: string, submission: 'rejected' | 'unknown' = 'unknown') {
    super(message);
    this.submission = submission;
  }
}

// Bound the whole operation, including response-body reads. Abort alone does
// not guarantee that a native plugin promise will settle after suspension.
export async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ProxyRequestError('The request timed out. Check the transfer status before trying again.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestProxyJson(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<any> {
  try {
    return await withDeadline(async signal => {
      const response = await fetch(url, {...options, signal, connectTimeout:10000});
      if (!response.ok) {
        // Match the backend's pre-provider decryption rejection, not an
        // arbitrary upstream 401/403 that could follow submission.
        const errorBody = await response.json().catch(() => null);
        if (response.status === 401 && errorBody?.code === 'INVALID_ENCRYPTED_REQUEST') {
          throw new ProxyRequestError('The payment service no longer accepts this app’s credentials. Update BitNotes to the latest version. If it is already updated, contact support.', 'rejected');
        }
        throw new ProxyRequestError('The payment service could not confirm this request. Check the transfer status before trying again.');
      }
      return await response.json();
    }, timeoutMs);
  } catch (error) {
    if (error instanceof ProxyRequestError) throw error;
    throw new ProxyRequestError('Could not confirm a response from the payment service. Check your connection and the transfer status before trying again.');
  }
}
