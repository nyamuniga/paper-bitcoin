//! Send orchestration independent of Tauri state; the caller owns exclusive wallet access.

use crate::{
    outgoing::{encode_outgoing_tokens, PendingSend, SendEcashResult},
    proof_selection::{select_exact_proofs, split_for_pocket_change},
    send_error::{SendEcashError, SendEcashErrorCode},
    storage::{EncryptedFileStorage, WalletStorage},
    swap::swap_proofs,
    WalletState,
};
use ecash_core::types::{
    split_into_powers_of_2, SendTransactionData, Transaction, TransactionStatus, TransactionType,
};
use std::{path::PathBuf, time::Duration};

/// The existing send inputs, shared by legacy and structured native commands.
pub struct SendEcashRequest {
    pub mint_url: String,
    pub amount: u64,
    pub pubkey: Option<String>,
    pub payment_request: Option<String>,
    pub payment_max_total: Option<u64>,
}

fn ensure_approved_total(total: u64, cap: u64) -> Result<(), SendEcashError> {
    if total > cap {
        return Err(SendEcashError::new(
            SendEcashErrorCode::ReviewRequired,
            "Mint fees changed. Review the payment again.",
            None,
        ));
    }
    Ok(())
}

fn persist_send_state<S: WalletStorage>(
    w_state: &mut WalletState,
    storage: &mut S,
) -> anyhow::Result<()> {
    w_state.normalize_proofs_for_persistence();
    storage.save(w_state)
}

/// Execute under the caller's exclusive wallet access, retained across mint awaits.
/// Persistence, fee caps, pending intent and unknown-outcome recovery keep their existing order.
pub async fn send_ecash(
    w_state: &mut WalletState,
    path: &PathBuf,
    passphrase: &str,
    request: SendEcashRequest,
) -> Result<SendEcashResult, SendEcashError> {
    let mut storage = EncryptedFileStorage::new(path, passphrase);
    send_ecash_with_storage(w_state, path, passphrase, request, &mut storage).await
}

/// Execute the send workflow with an injected persistence boundary for send-level saves.
/// Internal swap persistence in `swap_proofs` still uses the concrete path/passphrase.
pub async fn send_ecash_with_storage<S: WalletStorage>(
    w_state: &mut WalletState,
    path: &PathBuf,
    passphrase: &str,
    request: SendEcashRequest,
    storage: &mut S,
) -> Result<SendEcashResult, SendEcashError> {
    let SendEcashRequest {
        mint_url,
        amount,
        pubkey,
        payment_request,
        payment_max_total,
    } = request;

    let mut proofs = w_state
        .proofs
        .get(&mint_url)
        .ok_or_else(|| {
            SendEcashError::new(
                SendEcashErrorCode::InsufficientFunds,
                format!("No proofs found for mint {}", mint_url),
                None,
            )
        })?
        .clone();

    if proofs.is_empty() {
        return Err(SendEcashError::new(
            SendEcashErrorCode::InsufficientFunds,
            "No proofs available for this mint",
            None,
        ));
    }

    if payment_request.is_some() != payment_max_total.is_some() {
        return Err(SendEcashError::new(
            SendEcashErrorCode::InvalidRequest,
            "Ecash payments require a request and approved total",
            None,
        ));
    }
    if let Some(ref request) = payment_request {
        if request.len() > 28671 {
            return Err(SendEcashError::new(
                SendEcashErrorCode::InvalidRequest,
                "Ecash request too large",
                None,
            ));
        }
        if let Some(tx) = w_state.transactions.iter().find(|tx| match &tx.tx_type {
            TransactionType::Send(data) => data.payment_request.as_ref() == Some(request),
            _ => false,
        }) {
            return Err(SendEcashError::new(
                SendEcashErrorCode::InvalidRequest,
                "A payment already exists for this request. Resume it instead of creating another.",
                Some(tx.id.clone()),
            ));
        }
    }
    let force_swap = payment_request.is_some();
    let amount = if let Some(cap) = payment_max_total {
        let quote = crate::payment_quote::quote(&mint_url, amount, &proofs).await?;
        ensure_approved_total(quote.total, cap)?;
        quote.token_amount
    } else {
        amount
    };
    let client = crate::client::MintClient::new(&mint_url);
    let mut exact_match = if pubkey.is_none() && !force_swap {
        select_exact_proofs(&proofs, amount)
    } else {
        None
    };

    // If we found an exact denomination match, verify with the mint that none of those proofs are already spent.
    if let Some(ref candidate_proofs) = exact_match {
        let ys: Vec<String> = candidate_proofs
            .iter()
            .map(|p| {
                ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(
                    p.secret.as_bytes(),
                ))
            })
            .collect();
        if let Ok(Ok(states)) =
            tokio::time::timeout(Duration::from_secs(3), client.check_state(&ys)).await
        {
            let spent_secrets: std::collections::HashSet<String> = candidate_proofs
                .iter()
                .filter_map(|p| {
                    let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(
                        p.secret.as_bytes(),
                    ));
                    match states.get(&y).map(|s| s.as_str()) {
                        Some("SPENT") | Some("PENDING") => Some(p.secret.clone()),
                        _ => None,
                    }
                })
                .collect();

            if !spent_secrets.is_empty() {
                if let Some(mint_proofs) = w_state.proofs.get_mut(&mint_url) {
                    mint_proofs.retain(|p| !spent_secrets.contains(&p.secret));
                }
                persist_send_state(w_state, storage).map_err(|error| {
                    SendEcashError::new(SendEcashErrorCode::OutcomeUnknown, error.to_string(), None)
                })?;
                proofs.retain(|p| !spent_secrets.contains(&p.secret));
                exact_match = select_exact_proofs(&proofs, amount);
            }
        }
    }

    let final_send_proofs;
    let mut pending_tx_id: Option<String> = None;

    // 1. Try to find exact proofs (ONLY if we are not locking to a pubkey)
    // If a pubkey is provided, we must do a swap to generate new P2PK-locked proofs.
    if let Some(exact_proofs) = exact_match {
        final_send_proofs = exact_proofs;

        // Remove exactly these proofs from the wallet
        if let Some(mint_proofs) = w_state.proofs.get_mut(&mint_url) {
            let selected_secrets: std::collections::HashSet<String> =
                final_send_proofs.iter().map(|p| p.secret.clone()).collect();
            mint_proofs.retain(|p| !selected_secrets.contains(&p.secret));
        }
        // Persist proof removal together with the outgoing token below.
    } else {
        // 2. We need to split proofs via swap. Verify mint reachability before
        // persisting a pending send so offline attempts fail cleanly without
        // leaving stale pending history or an unknown-outcome lock.
        let all_keysets = client.fetch_keysets().await.map_err(|error| {
            SendEcashError::new(
                SendEcashErrorCode::ServiceUnavailable,
                error.to_string(),
                None,
            )
        })?;

        // Select proofs summing to >= amount + swap_fee (prefer smallest to clean up dust)
        let mut sorted_proofs = proofs.clone();
        sorted_proofs.sort_by_key(|p| p.amount);

        let mut selected_for_swap = Vec::new();
        let mut swap_total = 0;

        for proof in &sorted_proofs {
            selected_for_swap.push(proof.clone());
            swap_total += proof.amount;
            let swap_fee = crate::client::calculate_input_fee(&selected_for_swap, &all_keysets);
            if swap_total >= amount + swap_fee {
                break;
            }
        }

        let swap_fee = crate::client::calculate_input_fee(&selected_for_swap, &all_keysets);
        if swap_total < amount + swap_fee {
            return Err(SendEcashError::new(
                SendEcashErrorCode::InsufficientFunds,
                format!(
                    "Insufficient balance. Have {} sats, need {} sats (including {} sats mint fee)",
                    swap_total,
                    amount + swap_fee,
                    swap_fee
                ),
                None,
            ));
        }

        if let Some(cap) = payment_max_total {
            ensure_approved_total(amount.saturating_add(swap_fee), cap)?;
        }
        // Record pending transaction before swap
        let tx_id = format!(
            "tx_send_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );
        pending_tx_id = Some(tx_id.clone());

        let pending_tx = PendingSend {
            id: tx_id.clone(),
            payment_request: payment_request.clone(),
            proofs: selected_for_swap.clone(),
            amount,
            fee: swap_fee,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url: mint_url.clone(),
        }
        .into_transaction();
        w_state.transactions.push(pending_tx);
        persist_send_state(w_state, storage).map_err(|error| {
            SendEcashError::new(SendEcashErrorCode::InternalError, error.to_string(), None)
        })?;

        let change_amount = swap_total.saturating_sub(amount).saturating_sub(swap_fee);
        let desired_denoms = split_into_powers_of_2(amount);
        let selected_secrets: std::collections::HashSet<&str> = selected_for_swap
            .iter()
            .map(|proof| proof.secret.as_str())
            .collect();
        let remaining_proofs: Vec<_> = proofs
            .iter()
            .filter(|proof| !selected_secrets.contains(proof.secret.as_str()))
            .cloned()
            .collect();
        let change_denoms = split_for_pocket_change(change_amount, &remaining_proofs);

        // perform_swap handles updating the wallet state with the change
        let swap_result = swap_proofs(
            w_state,
            path,
            passphrase,
            &mint_url,
            selected_for_swap,
            desired_denoms,
            change_denoms,
            pubkey.clone(),
        )
        .await;

        final_send_proofs = match swap_result {
            Ok(proofs) => proofs,
            Err(e) => {
                // A swap error does not prove that the mint left the input proofs unspent.
                // Keep the recorded send pending so History can query their spend state
                // instead of treating the error as a confirmed failure.
                if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    tx.status = TransactionStatus::Pending;
                }
                let mut message = format!("Failed to split tokens: {}", e);
                if let Err(save_error) = persist_send_state(w_state, storage) {
                    message.push_str(&format!(
                        " Recovery state could not be saved: {save_error:#}. Outcome remains unknown; do not resend."
                    ));
                    eprintln!("[send_ecash] {tx_id}: {message}");
                }
                return Err(SendEcashError::new(
                    SendEcashErrorCode::OutcomeUnknown,
                    message,
                    Some(tx_id),
                ));
            }
        };
    }

    let outgoing_tokens =
        encode_outgoing_tokens(&mint_url, &final_send_proofs).map_err(|error| {
            SendEcashError::new(
                SendEcashErrorCode::OutcomeUnknown,
                error.to_string(),
                pending_tx_id.clone(),
            )
        })?;

    // Update transaction to Success
    let tx_id_for_success = if let Some(tx) = pending_tx_id
        .as_ref()
        .and_then(|id| w_state.transactions.iter_mut().find(|t| &t.id == id))
    {
        if let TransactionType::Send(data) = &mut tx.tx_type {
            data.token_string = outgoing_tokens.token_v3.clone();
            data.proofs = final_send_proofs.clone();
        }
        tx.status = TransactionStatus::Success;
        tx.id.clone()
    } else {
        let tx_id = format!(
            "tx_send_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );
        let tx = Transaction {
            id: tx_id.clone(),
            tx_type: TransactionType::Send(SendTransactionData {
                payment_request: payment_request.clone(),
                token_string: outgoing_tokens.token_v3.clone(),
                proofs: final_send_proofs,
            }),
            amount,
            fee: 0,
            status: TransactionStatus::Success,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url,
        };
        w_state.transactions.push(tx);
        tx_id
    };

    // Save wallet state
    persist_send_state(w_state, storage).map_err(|error| {
        SendEcashError::new(
            SendEcashErrorCode::OutcomeUnknown,
            error.to_string(),
            pending_tx_id.clone(),
        )
    })?;

    Ok(outgoing_tokens.into_send_result(tx_id_for_success))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increased_fees_require_review_while_the_approved_boundary_is_accepted() {
        assert!(ensure_approved_total(100, 100).is_ok());
        assert!(ensure_approved_total(99, 100).is_ok());
        let error = ensure_approved_total(101, 100).unwrap_err();
        assert_eq!(error.code, SendEcashErrorCode::ReviewRequired);
        assert_eq!(
            error.message,
            "Mint fees changed. Review the payment again."
        );
    }
}
