import { fetch } from '@tauri-apps/plugin-http';
import { HDKey } from '@scure/bip32';
import { getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { NPUB_CASH_API_URL, NOSTR_DERIVATION_PATH, NPUB_DOMAIN, NPUB_CASH_BACKEND_URL } from '../constants.local';

// Utility for hex
const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};


export interface NostrKeypair {
  privateKey: string;   // hex
  publicKey: string;    // hex
  npub: string;         // bech32 npub1...
}

/**
 * Derive a Nostr keypair deterministically from the wallet's seed hex (NIP-06).
 * This reuses the existing mnemonic — no extra backup needed.
 */
export const deriveNostrKeypair = (seedHex: string): NostrKeypair => {
  const seed = hexToBytes(seedHex);
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive(NOSTR_DERIVATION_PATH);

  if (!child.privateKey) {
    throw new Error('Failed to derive Nostr private key');
  }

  const privateKey = bytesToHex(child.privateKey);
  const publicKey = getPublicKey(hexToBytes(privateKey));
  const npub = nip19.npubEncode(publicKey);

  return { privateKey, publicKey, npub };
};

/**
 * Derive a Nostr keypair from an existing private key hex.
 */
export const deriveKeypairFromPrivateKey = (privateKeyHex: string): NostrKeypair => {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKey = getPublicKey(privateKeyBytes);
  const npub = nip19.npubEncode(publicKey);

  return { privateKey: privateKeyHex, publicKey, npub };
};

/**
 * Generate a NIP-98 HTTP Auth event header for authenticated npub.cash requests.
 * Creates a signed Kind 27235 event and returns a base64-encoded Authorization header value.
 */
export const generateNip98AuthHeader = async (
  url: string,
  method: string,
  privateKey: string,
  body?: string
): Promise<string> => {
  // If we are calling our local Cloudflare Worker proxy at 28waves.com, we MUST 
  // sign the NIP-98 event for the actual backend (npubx.cash) that verifies the signature!
  const audienceUrl = url.replace(NPUB_CASH_API_URL, NPUB_CASH_BACKEND_URL);

  const tags: string[][] = [
    ['u', audienceUrl],
    ['method', method.toUpperCase()],
  ];

  if (body) {
    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    tags.push(['payload', hashHex]);
  }

  const event = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  }, hexToBytes(privateKey));

  const eventJson = JSON.stringify(event);
  const encoded = btoa(eventJson);
  const authHeader = `Nostr ${encoded}`.trim();
  console.log('[DEBUG NIP98] Generated Auth Header:', authHeader);
  return authHeader;
};


/**
 * Convert an npub to a Lightning Address on npubx.cash
 */
export const npubToLightningAddress = (npub: string): string => {
  return `${npub}@${NPUB_DOMAIN}`;
};

/**
 * Register or update the user's preferred mint on npubx.cash.
 * Uses NIP-98 auth to prove ownership of the npub.
 */
export const registerWithNpubCash = async (
  mintUrl: string,
  privateKey: string
): Promise<void> => {
  const url = `${NPUB_CASH_API_URL}/api/v2/user/mint`;
  const bodyJson = JSON.stringify({ mint_url: mintUrl });
  const authHeader = await generateNip98AuthHeader(url, 'PATCH', privateKey, bodyJson);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: bodyJson,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mint update failed: ${response.status} - ${text}`);
  }
};

export const fetchNpubxJwt = async (privateKey: string): Promise<string> => {
  const url = `${NPUB_CASH_API_URL}/api/v2/auth/nip98`;
  const authHeader = await generateNip98AuthHeader(url, 'GET', privateKey);

  const sanitizedAuth = authHeader.replace(/[\r\n]/g, '').trim();
  console.log(`[DEBUG fetchNpubxJwt] Sending request to ${url} with auth header length:`, sanitizedAuth.length);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': sanitizedAuth,
      },
    });
    console.log('[DEBUG fetchNpubxJwt] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[DEBUG fetchNpubxJwt] Response error text:', text);
      throw new Error(`Auth failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log('[DEBUG fetchNpubxJwt] Parsed JSON:', data);
    
    if (data.error || !data.data || !data.data.token) {
      throw new Error('Failed to get JWT token');
    }

    return data.data.token;
  } catch (e: any) {
    console.error('[DEBUG fetchNpubxJwt] Caught error during fetch:', e);
    throw e;
  }
};

export interface NpubCashQuote {
  quoteId: string;
  amount: number;
  unit: string;
  createdAt?: number;
  paidAt?: number;
  expiresAt?: number;
  mintUrl?: string;
  request?: string;
  state?: string;
  locked?: boolean;
}

/**
 * Fetch pending mint quotes from npubx.cash using the v2 protocol.
 */
export const fetchPendingQuotes = async (
  jwtToken: string
): Promise<NpubCashQuote[]> => {
  const url = `${NPUB_CASH_API_URL}/api/v2/wallet/quotes`;

  const sanitizedJwt = `Bearer ${jwtToken}`.replace(/[\r\n]/g, '').trim();
  console.log(`[DEBUG fetchPendingQuotes] Fetching quotes with JWT header length:`, sanitizedJwt.length);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': sanitizedJwt,
      },
    });
    console.log('[DEBUG fetchPendingQuotes] Response status:', response.status);

    if (!response.ok) {
      if (response.status === 404) return [];
      const text = await response.text();
      console.error('[DEBUG fetchPendingQuotes] Response error text:', text);
      throw new Error(`Fetch quotes failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log('[DEBUG fetchPendingQuotes] Parsed JSON data:', data);

    if (data.error) {
      return [];
    }

    if (data.data && Array.isArray(data.data.quotes)) {
      return data.data.quotes;
    }
    return [];
  } catch (e: any) {
    console.error('[DEBUG fetchPendingQuotes] Caught error during fetch:', e);
    throw e;
  }
};

/**
 * Fetch spendable token from npub.cash (v1 protocol)
 */
export const fetchV1ClaimToken = async (
  privateKey: string
): Promise<{ token: string; count: number; totalPending: number } | null> => {
  const url = `${NPUB_CASH_API_URL}/api/v1/claim`;
  const authHeader = await generateNip98AuthHeader(url, 'GET', privateKey);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader.replace(/[\r\n]/g, '').trim(),
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.error || !data.data || !data.data.token) {
      return null;
    }

    return {
      token: data.data.token,
      count: data.data.count,
      totalPending: data.data.totalPending
    };
  } catch (e) {
    console.debug('[DEBUG fetchV1ClaimToken] Caught error:', e);
    return null;
  }
};

/**
 * Claim/register a human-readable username on npub.cash.
 * May require a payment (configured server-side).
 */
export const claimUsername = async (
  username: string,
  privateKey: string
): Promise<{ success: boolean; address?: string; error?: string }> => {
  const url = `${NPUB_CASH_API_URL}/api/v1/info/username`;
  const bodyJson = JSON.stringify({ username });
  const authHeader = await generateNip98AuthHeader(url, 'PUT', privateKey, bodyJson);

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: bodyJson,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMessage = typeof data.error === 'string' ? data.error : data.message;
      return {
        success: false,
        error: errorMessage || `Failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      address: data.address || `${username}@${NPUB_DOMAIN}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message || (typeof e === 'string' ? e : 'Unknown error') };
  }
};
