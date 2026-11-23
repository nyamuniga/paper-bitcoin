//! Payment fee quoting shared by review and send execution.

use crate::{
    client::MintClient,
    send_error::{SendEcashError, SendEcashErrorCode},
};
use ecash_core::types::Proof;
use serde::Serialize;

#[derive(Serialize)]
pub struct EcashPaymentQuote {
    pub token_amount: u64,
    pub receiver_fee: u64,
    pub sender_fee: u64,
    pub total: u64,
}

pub async fn quote(
    mint_url: &str,
    net: u64,
    proofs: &[Proof],
) -> Result<EcashPaymentQuote, SendEcashError> {
    let client = MintClient::new(mint_url);
    let unavailable = |error: anyhow::Error| {
        SendEcashError::new(
            SendEcashErrorCode::ServiceUnavailable,
            error.to_string(),
            None,
        )
    };
    let keysets = client.fetch_keysets().await.map_err(unavailable)?;
    let active = client.fetch_keyset().await.map_err(unavailable)?;
    let output_keyset = keysets
        .iter()
        .find(|ks| ks.id == active.id && ks.active && ks.unit == "sat")
        .ok_or_else(|| {
            SendEcashError::new(
                SendEcashErrorCode::ServiceUnavailable,
                "No active sat keyset available",
                None,
            )
        })?;
    if proofs
        .iter()
        .any(|p| !keysets.iter().any(|ks| ks.id == p.id && ks.unit == "sat"))
    {
        return Err(SendEcashError::new(
            SendEcashErrorCode::ServiceUnavailable,
            "Could not resolve wallet proof fees. Refresh the mint before paying.",
            None,
        ));
    }
    let token_amount =
        crate::payment_request::recipient_token_amount(net, output_keyset.input_fee_ppk).map_err(
            |error| {
                SendEcashError::new(SendEcashErrorCode::InvalidRequest, error.to_string(), None)
            },
        )?;
    let mut sorted = proofs.to_vec();
    sorted.sort_by_key(|p| p.amount);
    let mut selected = Vec::new();
    let mut available = 0u64;
    let mut sender_fee = 0;
    for proof in sorted {
        available = available.checked_add(proof.amount).ok_or_else(|| {
            SendEcashError::new(SendEcashErrorCode::InternalError, "Balance overflow", None)
        })?;
        selected.push(proof);
        sender_fee = crate::client::calculate_input_fee(&selected, &keysets);
        if available >= token_amount.saturating_add(sender_fee) {
            break;
        }
    }
    let total = token_amount.checked_add(sender_fee).ok_or_else(|| {
        SendEcashError::new(SendEcashErrorCode::InvalidRequest, "Payment overflow", None)
    })?;
    if total > 9_007_199_254_740_991 {
        return Err(SendEcashError::new(
            SendEcashErrorCode::InvalidRequest,
            "Payment and fees exceed the supported amount range",
            None,
        ));
    }
    if available < total {
        return Err(SendEcashError::new(
            SendEcashErrorCode::InsufficientFunds,
            format!(
                "Insufficient balance including mint fees. Need {} sats.",
                total
            ),
            None,
        ));
    }
    Ok(EcashPaymentQuote {
        token_amount,
        receiver_fee: token_amount - net,
        sender_fee,
        total,
    })
}
