//! Pure receive-input checks and proof preparation, preserving staged native validation.

use crate::{client::KeysetSummary, token::decode_token_string};
use anyhow::{anyhow, Result};
use ecash_core::types::Proof;

/// Decoded token data; the caller retains the original text for receipt identity.
#[derive(Debug)]
pub struct DecodedReceiveToken {
    pub mint_url: String,
    pub input_proofs: Vec<Proof>,
    pub total_amount: u64,
}

/// Resolved inputs and amounts ready for the caller's existing claim workflow.
#[derive(Debug)]
pub struct PreparedReceiveInput {
    pub mint_url: String,
    pub input_proofs: Vec<Proof>,
    pub net_amount: u64,
    pub fee: u64,
}

/// Run before wallet access; ordinary receives remain undecoded at this stage.
pub fn validate_receive_constraints<'a>(
    token_string: &str,
    expected_mint: Option<&'a str>,
    expected_amount: Option<u64>,
    expected_invoice_id: Option<&str>,
) -> Result<Option<(&'a str, u64)>> {
    if expected_mint.is_some() != expected_amount.is_some()
        || expected_mint.is_some() != expected_invoice_id.is_some()
        || expected_invoice_id
            .as_ref()
            .is_some_and(|id| id.is_empty() || id.len() > 64)
    {
        return Err(anyhow!("Incomplete invoice payment constraints"));
    }
    if expected_amount.is_some() && token_string.len() > 100000 {
        return Err(anyhow!("Invoice payment is too large"));
    }
    let invoice = expected_mint.zip(expected_amount);
    if let Some((mint, amount)) = invoice {
        let (received_mint, _, total) = decode_token_string(token_string)?;
        crate::payment_request::validate_invoice_payment(&received_mint, total, 0, mint, amount)?;
    }
    Ok(invoice)
}

/// Decode after the caller's raw receipt lookup, retaining its parse-error context.
pub fn decode_receive_token(token_string: &str) -> Result<DecodedReceiveToken> {
    let (mint_url, input_proofs, total_amount) = decode_token_string(token_string)
        .map_err(|error| anyhow!("Failed to parse token: {}", error))?;
    Ok(DecodedReceiveToken {
        mint_url,
        input_proofs,
        total_amount,
    })
}

/// Apply existing keyset/fee policy after the caller fetches mint metadata.
pub fn prepare_receive_input(
    decoded: DecodedReceiveToken,
    all_keysets: &[KeysetSummary],
    invoice: Option<(&str, u64)>,
) -> Result<PreparedReceiveInput> {
    let DecodedReceiveToken {
        mint_url,
        mut input_proofs,
        total_amount,
    } = decoded;
    if invoice.is_some() {
        crate::payment_request::resolve_keysets(&mut input_proofs, all_keysets)?;
    }

    // Resolve short keyset IDs in input_proofs
    for p in &mut input_proofs {
        if p.id.starts_with("01") && p.id.len() < 66 {
            if let Some(matching) = all_keysets.iter().find(|ks| ks.id.starts_with(&p.id)) {
                p.id = matching.id.clone();
            }
        } else if p.id.len() < 16 {
            if let Some(matching) = all_keysets.iter().find(|ks| ks.id.starts_with(&p.id)) {
                p.id = matching.id.clone();
            }
        }
    }

    // Calculate mint input fees per NUT-02:
    // fee = ceil(sum(input_fee_ppk) / 1000) = (sum(input_fee_ppk) + 999) / 1000
    let mut total_fee_ppk: u64 = 0;
    for p in &input_proofs {
        let fee_ppk = all_keysets
            .iter()
            .find(|ks| ks.id == p.id)
            .map(|ks| ks.input_fee_ppk)
            .unwrap_or(0);
        total_fee_ppk = total_fee_ppk
            .checked_add(fee_ppk)
            .ok_or_else(|| anyhow!("Mint fee overflow"))?;
    }
    let fee = if total_fee_ppk > 0 {
        total_fee_ppk
            .checked_add(999)
            .ok_or_else(|| anyhow!("Mint fee overflow"))?
            / 1000
    } else {
        0
    };

    if fee >= total_amount {
        return Err(anyhow!(
            "Token amount ({} sat) cannot cover the mint input fee ({} sat)",
            total_amount,
            fee
        ));
    }

    let net_amount = total_amount - fee;
    if let Some((mint, amount)) = invoice {
        crate::payment_request::validate_invoice_payment(
            &mint_url,
            total_amount,
            fee,
            mint,
            amount,
        )?;
    }

    Ok(PreparedReceiveInput {
        mint_url,
        input_proofs,
        net_amount,
        fee,
    })
}
