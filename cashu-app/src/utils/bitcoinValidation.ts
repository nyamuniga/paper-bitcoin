export interface ParsedBitcoinInput {
  type: 'lightning' | 'onchain' | 'lnurl-pay' | 'lnurl' | 'invalid';
  addressOrInvoice: string;
  amountSats: number | null; // Extracted amount if present (from BIP21 or lightning)
}

/**
 * Validates and parses a Bitcoin input string.
 * Supports:
 * 1. Lightning Addresses (user@domain.tld)
 * 2. LNURL strings (LNURL1... or lightning:LNURL1...)
 * 3. Lightning invoices (lnbc...)
 * 4. On-chain addresses (Legacy 1..., P2SH 3..., Segwit/Taproot bc1...)
 * 5. BIP21 URIs (bitcoin:...?amount=...)
 */
export const parseBitcoinInput = (input: string): ParsedBitcoinInput => {
  const cleanInput = input.trim();

  // 1. Check for Lightning Address (user@domain.tld)
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanInput)) {
    return {
      type: 'lnurl-pay',
      addressOrInvoice: cleanInput.toLowerCase(),
      amountSats: null
    };
  }

  // 2. Check for LNURL (bech32 encoded, optionally with lightning: prefix)
  const lnurlInput = cleanInput.replace(/^lightning:/i, '');
  if (/^lnurl1[a-z0-9]+$/i.test(lnurlInput)) {
    return {
      type: 'lnurl',
      addressOrInvoice: lnurlInput.toLowerCase(),
      amountSats: null
    };
  }

  // 3. Check for Lightning Invoice
  const lnMatch = cleanInput.match(/^(?:lightning:)?(lnbc[a-z0-9]+)$/i);
  if (lnMatch) {
    const invoice = lnMatch[1].toLowerCase();
    return {
      type: 'lightning',
      addressOrInvoice: invoice,
      amountSats: getInvoiceAmountSats(invoice)
    };
  }

  // 4. Check for BIP21 URI
  const bip21Match = cleanInput.match(/^bitcoin:([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{8,87})/i);
  if (bip21Match) {
    const address = bip21Match[1];
    let amountSats = null;
    
    // Parse query params for amount (amount in BTC -> Sats)
    try {
      const url = new URL(cleanInput);
      const btcAmount = url.searchParams.get('amount');
      if (btcAmount) {
        amountSats = Math.floor(parseFloat(btcAmount) * 100_000_000);
      }
    } catch (e) {
      // Fallback manual parse
      const amountMatch = cleanInput.match(/[?&]amount=([0-9.]+)/i);
      if (amountMatch) {
        amountSats = Math.floor(parseFloat(amountMatch[1]) * 100_000_000);
      }
    }

    return {
      type: 'onchain',
      addressOrInvoice: address,
      amountSats
    };
  }

  // 5. Check for raw on-chain address
  const rawOnchainMatch = cleanInput.match(/^([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{8,87})$/i);
  if (rawOnchainMatch) {
    return {
      type: 'onchain',
      addressOrInvoice: rawOnchainMatch[1],
      amountSats: null
    };
  }

  return {
    type: 'invalid',
    addressOrInvoice: cleanInput,
    amountSats: null
  };
};

export const getInvoiceAmountSats = (inv: string): number | null => {
  try {
    const hrp = inv.toLowerCase().split('1')[0];
    if (!hrp) return null;
    const match = hrp.match(/^ln[a-z]+(\d+)([munp]?)$/);
    if (match) {
      let val = parseInt(match[1], 10);
      const mult = match[2];
      if (mult === 'm') val *= 100000;
      else if (mult === 'u') val *= 100;
      else if (mult === 'n') val *= 0.1;
      else if (mult === 'p') val *= 0.0001;
      else val *= 100000000;
      return Math.floor(val);
    }
  } catch (e) {
    return null;
  }
  return null;
};
