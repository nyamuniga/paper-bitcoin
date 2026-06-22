use anyhow::{anyhow, Result};


// ─── Invoice Validation ───────────────────────────────────────────────────────

/// Parse a BOLT11 invoice and return its amount in satoshis.
/// Returns `None` if the invoice carries no amount (any-amount invoice).
/// Returns `Err` if the invoice string is not valid BOLT11 format.
pub fn parse_bolt11_sats(invoice: &str) -> Result<Option<u64>> {
    let lower = invoice.to_lowercase().trim().to_string();
    if !lower.starts_with("ln") {
        return Err(anyhow!("Not a valid Lightning invoice (must start with 'ln')"));
    }

    // In bech32 the separator '1' is the LAST '1' in the string.
    // Everything before it is the HRP: e.g. "lnbc1000u"
    let sep = lower.rfind('1').ok_or_else(|| anyhow!("Invalid BOLT11: no bech32 separator"))?;
    let hrp = &lower[..sep];

    // Strip network prefix to isolate the amount field
    let amount_part = if hrp.starts_with("lnbcrt") {
        &hrp["lnbcrt".len()..]
    } else if hrp.starts_with("lntbs") || hrp.starts_with("lntb") {
        &hrp["lntb".len()..]
    } else if hrp.starts_with("lnbc") {
        &hrp["lnbc".len()..]
    } else {
        return Err(anyhow!("Unknown Lightning network prefix in invoice"));
    };

    if amount_part.is_empty() {
        return Ok(None); // any-amount invoice
    }

    let last = amount_part.chars().last().unwrap();
    let (num_str, multiplier) = if last.is_alphabetic() {
        (&amount_part[..amount_part.len() - 1], Some(last))
    } else {
        (amount_part, None)
    };

    if num_str.is_empty() {
        return Err(anyhow!("Invalid amount in invoice"));
    }

    let amount: u64 = num_str.parse().map_err(|_| anyhow!("Invalid amount digits in invoice"))?;

    // Convert to millisatoshis, then to sats
    let msats: u64 = match multiplier {
        Some('m') => amount * 100_000_000,       // 1 mBTC = 100,000 sats = 100,000,000 msats
        Some('u') => amount * 100_000,            // 1 µBTC = 100 sats = 100,000 msats
        Some('n') => amount * 100,                // 1 nBTC = 0.1 sats = 100 msats
        Some('p') => amount / 10,                 // 10 pBTC = 1 msat (floored)
        None => amount.checked_mul(100_000_000_000)
            .ok_or_else(|| anyhow!("Invoice amount overflow"))?,  // whole BTC
        Some(c) => return Err(anyhow!("Unknown multiplier '{}' in invoice", c)),
    };

    Ok(Some(msats / 1000))
}



/// Validate a BOLT11 invoice. If `expected_sats` is provided, the invoice amount must match exactly.
/// Returns the invoice amount in sats (or 0 for any-amount invoices).
pub fn validate_invoice(invoice: &str, expected_sats: Option<u64>) -> Result<u64> {
    let inv = invoice.trim();
    if inv.is_empty() {
        return Err(anyhow!("Invoice is empty"));
    }
    if inv.len() < 20 {
        return Err(anyhow!("Invoice string is too short to be valid"));
    }

    let amount = parse_bolt11_sats(inv)?;

    if let Some(expected) = expected_sats {
        match amount {
            None => {
                // Any-amount invoice — accepted, the mint will enforce the amount
                return Ok(expected);
            }
            Some(got) if got != expected => {
                return Err(anyhow!(
                    "Invoice amount mismatch: invoice is for {} sats but note face value is {} sats.\n\
                     Please create a new invoice for exactly {} sats.",
                    got, expected, expected
                ));
            }
            Some(got) => return Ok(got),
        }
    }

    Ok(amount.unwrap_or(0))
}

