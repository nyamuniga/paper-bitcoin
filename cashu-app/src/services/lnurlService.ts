import { fetch } from '@tauri-apps/plugin-http';
import { bech32 } from 'bech32';

export interface LnurlPayParams {
  callback: string;
  minSendable: number; // millisatoshis
  maxSendable: number; // millisatoshis
  metadata: string;
  tag: string;
  commentAllowed?: number;
}

export interface LnurlPayInvoice {
  pr: string; // BOLT11 payment request
  routes: any[];
}

/**
 * Check if a string is a Lightning Address (user@domain.tld)
 */
export const isLightningAddress = (input: string): boolean => {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(input.trim());
};

/**
 * Check if a string is an LNURL (bech32 encoded)
 */
export const isLnurl = (input: string): boolean => {
  const cleaned = input.trim().toLowerCase().replace(/^lightning:/, '');
  return cleaned.startsWith('lnurl1');
};

/**
 * Decode an LNURL bech32 string into a plain URL
 */
export const decodeLnurl = (lnurl: string): string => {
  const cleaned = lnurl.trim().toLowerCase().replace(/^lightning:/, '');
  const decoded = bech32.decode(cleaned, 2000);
  const bytes = bech32.fromWords(decoded.words);
  return new TextDecoder().decode(new Uint8Array(bytes));
};

/**
 * Convert a Lightning Address (user@domain) into an LNURL-pay endpoint URL
 */
export const lightningAddressToUrl = (address: string): string => {
  const [user, domain] = address.trim().split('@');
  return `https://${domain}/.well-known/lnurlp/${user}`;
};

/**
 * Resolve a Lightning Address or LNURL string to LNURL-pay parameters
 */
export const resolveLnurlPay = async (input: string): Promise<LnurlPayParams> => {
  let url: string;

  if (isLightningAddress(input)) {
    url = lightningAddressToUrl(input);
  } else if (isLnurl(input)) {
    url = decodeLnurl(input);
  } else {
    throw new Error('Invalid LNURL or Lightning Address');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`LNURL service error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'LNURL service returned an error');
  }

  if (data.tag !== 'payRequest') {
    throw new Error(`Unsupported LNURL tag: ${data.tag}. Only payRequest is supported.`);
  }

  return {
    callback: data.callback,
    minSendable: data.minSendable,
    maxSendable: data.maxSendable,
    metadata: data.metadata,
    tag: data.tag,
    commentAllowed: data.commentAllowed,
  };
};

/**
 * Fetch a BOLT11 invoice from an LNURL-pay callback
 * @param callback - The callback URL from the LNURL-pay params
 * @param amountMsat - Amount in millisatoshis
 * @param comment - Optional comment for the payment
 */
export const fetchLnurlPayInvoice = async (
  callback: string,
  amountMsat: number,
  comment?: string
): Promise<LnurlPayInvoice> => {
  const separator = callback.includes('?') ? '&' : '?';
  let url = `${callback}${separator}amount=${amountMsat}`;

  if (comment) {
    url += `&comment=${encodeURIComponent(comment)}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`LNURL callback error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'Failed to get invoice from LNURL service');
  }

  if (!data.pr) {
    throw new Error('LNURL service did not return a payment request');
  }

  return {
    pr: data.pr,
    routes: data.routes || [],
  };
};
