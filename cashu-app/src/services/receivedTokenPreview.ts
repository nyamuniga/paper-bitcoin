import { getTokenMetadata } from '@cashu/cashu-ts';
import { extractCashuToken } from './cashuRequests.ts';

export interface ReceivedTokenPreview {
  token: string;
  mint: string;
  amount: number;
}

/** Read the token's declared value locally; redemption remains a separate action. */
export function parseReceivedTokenPreview(input: string): ReceivedTokenPreview {
  const token = extractCashuToken(input);
  const metadata = getTokenMetadata(token);
  if (metadata.unit !== 'sat') throw new Error('Only sat-denominated tokens are supported.');
  const amount = metadata.amount.toNumber();
  if (amount <= 0 || !metadata.incompleteProofs.length) throw new Error('The token has no funds.');
  const mint = new URL(metadata.mint);
  if (!['https:', 'http:'].includes(mint.protocol) || mint.username || mint.password) {
    throw new Error('The token has an invalid mint URL.');
  }
  return { token, mint: metadata.mint.replace(/\/$/, ''), amount };
}
