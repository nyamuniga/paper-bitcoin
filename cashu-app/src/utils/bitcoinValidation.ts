export interface ParsedBitcoinInput {
  type: 'lightning' | 'onchain' | 'invalid';
  addressOrInvoice: string;
  amountSats: number | null; // Extracted amount if present (from BIP21 or lightning)
}

/**
 * Validates and parses a Bitcoin input string.
 * Supports:
 * 1. Lightning invoices (lnbc...)
 * 2. On-chain addresses (Legacy 1..., P2SH 3..., Segwit/Taproot bc1...)
 * 3. BIP21 URIs (bitcoin:...?amount=...)
 */
export const parseBitcoinInput = (input: string): ParsedBitcoinInput => {
  const cleanInput = input.trim();

  // 1. Check for Lightning Invoice
  const lnMatch = cleanInput.match(/^(?:lightning:)?(lnbc[a-z0-9]+)$/i);
  if (lnMatch) {
    const invoice = lnMatch[1].toLowerCase();
    return {
      type: 'lightning',
      addressOrInvoice: invoice,
      amountSats: getInvoiceAmountSats(invoice)
    };
  }

  // 2. Check for BIP21 URI
  const bip21Match = cleanInput.match(/^bitcoin:([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{8,87})/i);
  if (bip21Match) {
    const address = bip21Match[1];
    let amountSats = null;
    
    // Parse query params for amount (amount in BTC -> Sats)
    try {
      // Need to use URL parsing properly, but bitcoin: protocol might fail in JS URL parser in some environments,
      // so let's do a simple extraction just in case.
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

  // 3. Check for raw on-chain address
  // Legacy (P2PKH): Starts with 1, 26-35 characters
  // P2SH: Starts with 3, 26-35 characters
  // SegWit/Taproot (Bech32/Bech32m): Starts with bc1, up to 90 characters
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
