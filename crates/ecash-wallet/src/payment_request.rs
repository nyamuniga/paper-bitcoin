use crate::client::KeysetSummary;
use anyhow::{anyhow, Result};
use ecash_core::types::Proof;

/// An idempotent receive is a receipt only for the invoice that received it.
pub fn validate_invoice_receipt(previous_id: Option<&str>, invoice_id: &str) -> Result<()> {
    if previous_id != Some(invoice_id) {
        return Err(anyhow!("This token was already received and cannot pay a new invoice"));
    }
    Ok(())
}

/// An invoice amount is net of the receiver's mint input fees.
pub fn validate_invoice_payment(mint: &str, total: u64, fee: u64, expected_mint: &str, requested: u64) -> Result<()> {
    if requested == 0 || requested > 9_007_199_254_740_991 || total > 9_007_199_254_740_991
        || mint.trim_end_matches('/') != expected_mint.trim_end_matches('/')
        || total.checked_sub(fee).is_none_or(|net| net < requested)
    {
        return Err(anyhow!("Payment does not cover this invoice at the selected mint"));
    }
    Ok(())
}

/// cashuB truncates v2 keyset IDs. Resolve them uniquely before calculating fees.
pub fn resolve_keysets(proofs: &mut [Proof], keysets: &[KeysetSummary]) -> Result<()> {
    for proof in proofs {
        let matches: Vec<_> = keysets
            .iter()
            .filter(|ks| {
                ks.unit == "sat"
                    && (ks.id == proof.id
                        || (proof.id.len() == 16
                            && proof.id.starts_with("01")
                            && ks.id.starts_with(&proof.id)))
            })
            .collect();
        if matches.len() != 1 {
            return Err(anyhow!(
                "Unable to uniquely resolve the payment's mint keyset"
            ));
        }
        proof.id = matches[0].id.clone();
    }
    Ok(())
}

/// Cover the recipient's NUT-02 input fee for binary-denominated output proofs.
pub fn recipient_token_amount(net: u64, fee_ppk: u64) -> Result<u64> {
    if net == 0 || net > 9_007_199_254_740_991 {
        return Err(anyhow!("Invalid ecash payment amount"));
    }
    let max_fee = fee_ppk
        .checked_mul(64)
        .and_then(|v| v.checked_add(999))
        .ok_or_else(|| anyhow!("Mint fee is too large"))?
        / 1000;
    let upper = net
        .checked_add(max_fee)
        .ok_or_else(|| anyhow!("Payment overflow"))?;
    let mut gross = net;
    for _ in 0..128 {
        let fee = (gross.count_ones() as u64 * fee_ppk + 999) / 1000;
        if gross.saturating_sub(fee) >= net {
            return Ok(gross);
        }
        gross = net
            .checked_add(fee)
            .ok_or_else(|| anyhow!("Payment overflow"))?
            .max(gross + 1);
        if gross >= upper {
            return Ok(upper);
        }
    }
    Ok(upper)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_previous_token_cannot_pay_a_different_invoice() {
        assert!(validate_invoice_receipt(Some("invoice-1"), "invoice-1").is_ok());
        assert!(validate_invoice_receipt(Some("invoice-1"), "invoice-2").is_err());
        assert!(validate_invoice_receipt(None, "invoice-2").is_err());
    }
    #[test]
    fn invoice_acceptance_requires_the_selected_mint_and_net_amount() {
        assert!(validate_invoice_payment("https://mint/", 101, 1, "https://mint", 100).is_ok());
        assert!(validate_invoice_payment("https://other", 100, 0, "https://mint", 100).is_err());
        assert!(validate_invoice_payment("https://mint", 100, 1, "https://mint", 100).is_err());
        assert!(validate_invoice_payment("https://mint", 100, 101, "https://mint", 1).is_err());
        assert!(validate_invoice_payment("https://mint", 100, 0, "https://mint", 0).is_err());
    }
    #[test]
    fn recipient_gets_at_least_requested_amount_after_fees() {
        for net in [1, 2, 7, 100, 1023, 1024, 50_000] {
            for ppk in [0, 100, 999, 1000, 2500] {
                let gross = recipient_token_amount(net, ppk).unwrap();
                let fee = (gross.count_ones() as u64 * ppk + 999) / 1000;
                assert!(gross - fee >= net);
                if ppk == 0 {
                    assert_eq!(gross, net);
                }
            }
        }
    }
    #[test]
    fn rejects_invalid_or_overflowing_amounts() {
        assert!(recipient_token_amount(0, 0).is_err());
        assert!(recipient_token_amount(u64::MAX, 0).is_err());
        assert!(recipient_token_amount(10, u64::MAX).is_err());
    }

    #[test]
    fn resolves_truncated_v2_ids_without_guessing_ambiguous_ids() {
        let id = format!("01{}", "ab".repeat(32));
        let keys = vec![KeysetSummary {
            id: id.clone(),
            unit: "sat".into(),
            active: true,
            input_fee_ppk: 1000,
        }];
        let proof = Proof {
            id: id[..16].into(),
            amount: 100,
            secret: "fixture".into(),
            c: "fixture".into(),
            witness: None,
            dleq: None,
            b_prime: None,
            c_prime: None,
            derivation_index: 0,
        };
        let mut proofs = vec![proof.clone()];
        resolve_keysets(&mut proofs, &keys).unwrap();
        assert_eq!(proofs[0].id, id);
        assert_eq!(crate::client::calculate_input_fee(&proofs, &keys), 1);
        let mut ambiguous = keys.clone();
        ambiguous.push(KeysetSummary {
            id: format!("{}ff", &id[..64]),
            unit: "sat".into(),
            active: true,
            input_fee_ppk: 1000,
        });
        assert!(resolve_keysets(&mut [proof], &ambiguous).is_err());
    }
}
