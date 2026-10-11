export interface ParsedBitcoinInput {
  type: 'lightning' | 'lnurl-pay' | 'lnurl' | 'onchain' | 'invalid';
  addressOrInvoice: string;
  amountSats: number | null; // Extracted amount if present (from lightning)
}

/**
 * Validates and parses a Bitcoin input string.
 * Supports:
 * 1. Lightning Addresses (user@domain.tld)
 * 2. LNURL strings (LNURL1... or lightning:LNURL1...)
 * 3. Lightning invoices (lnbc...)
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

  // 4. Check for On-Chain Bitcoin address
  const onChainMatch = cleanInput.match(/^(bitcoin:)?([13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1|tb1|bcrt1)[a-z0-9]{11,87})$/i);
  if (onChainMatch) {
    const addr = onChainMatch[2];
    return {
      type: 'onchain',
      addressOrInvoice: addr,
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
