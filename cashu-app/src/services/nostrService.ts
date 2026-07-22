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
 * Fetch registered user account info (including username if claimed) from npub.cash.
 */
export const fetchNpubCashUser = async (
  privateKey: string
): Promise<{ username?: string | null } | null> => {
  const url = `${NPUB_CASH_BACKEND_URL}/api/v1/info`;
  try {
    let authHeader = await generateNip98AuthHeader(url, 'GET', privateKey);
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader.replace(/[\r\n]/g, '').trim(),
      },
    });

    if (!response.ok) return null;

    const text = await response.text();
    console.log('[fetchNpubCashUser] Raw response text:', text);

    try {
      const data = JSON.parse(text);
      const handle = data.username || data.name;
      if (handle) {
        return { username: handle };
      }
      return null;
    } catch (parseErr) {
      console.error('[fetchNpubCashUser] Failed to parse JSON:', parseErr);
      return null;
    }
    return null;
  } catch (e) {
    console.debug('[fetchNpubCashUser] Failed to fetch user info:', e);
    return null;
  }
};


/**
 * Register or update the user's preferred mint on npubx.cash.
 * Uses NIP-98 auth to prove ownership of the npub.
 */
export const registerWithNpubCash = async (
  mintUrl: string,
  privateKey: string
): Promise<void> => {
  const url = `${NPUB_CASH_BACKEND_URL}/api/v1/info/mint`;
  const bodyJson = JSON.stringify({ mint_url: mintUrl });
  const authHeader = await generateNip98AuthHeader(url, 'PUT', privateKey, bodyJson);

  const response = await fetch(url, {
    method: 'PUT',
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



/**
 * Fetch spendable token from npub.cash (v1 protocol).
 * Sends directly to the backend (Tauri fetch bypasses CORS) so the
 * NIP-98 audience URL always matches what the server sees.
 */
export const fetchV1ClaimToken = async (
  privateKey: string
): Promise<{ token: string; count: number; totalPending: number } | null> => {
  // Send directly to backend – Tauri's fetch has no CORS restriction,
  // so we avoid the Cloudflare proxy host-header mismatch entirely.
  const url = `${NPUB_CASH_BACKEND_URL}/api/v1/claim`;
  const authHeader = await generateNip98AuthHeader(url, 'GET', privateKey);

  console.log('[DEBUG fetchV1ClaimToken] Requesting:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader.replace(/[\r\n]/g, '').trim(),
      },
    });

    console.log('[DEBUG fetchV1ClaimToken] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[DEBUG fetchV1ClaimToken] Error response text:', text);
      return null;
    }

    const data = await response.json();
    console.log('[DEBUG fetchV1ClaimToken] Data:', data);
    
    if (data.error || !data.data || !data.data.token) {
      console.log('[DEBUG fetchV1ClaimToken] Error in data:', data.message || data.error);
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
  const url = `${NPUB_CASH_BACKEND_URL}/api/v1/info/username`;
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
