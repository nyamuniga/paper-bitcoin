//! Receive orchestration independent of Tauri state; the caller owns exclusive wallet access.

use crate::{
    receive_input::{
        decode_receive_token, prepare_receive_input, validate_receive_constraints,
        PreparedReceiveInput,
    },
    swap::swap_proofs,
    WalletState,
};
use anyhow::{anyhow, Result};
use ecash_core::types::{split_into_powers_of_2, TransactionStatus, TransactionType};
use std::path::PathBuf;

/// The existing receive inputs, shared by the native command and standalone callers.
pub struct ReceiveEcashRequest {
    pub token_string: String,
    pub nostr_key: Option<String>,
    pub expected_mint: Option<String>,
    pub expected_amount: Option<u64>,
    pub expected_invoice_id: Option<String>,
}

/// Receive inputs whose pre-wallet invoice constraints have already been validated.
pub struct ValidatedReceiveRequest {
    request: ReceiveEcashRequest,
    has_invoice: bool,
}

impl ReceiveEcashRequest {
    /// Run pre-wallet invoice constraint checks before acquiring exclusive wallet access.
    pub fn validate(self) -> Result<ValidatedReceiveRequest> {
        let has_invoice = validate_receive_constraints(
            &self.token_string,
            self.expected_mint.as_deref(),
            self.expected_amount,
            self.expected_invoice_id.as_deref(),
        )?
        .is_some();
        Ok(ValidatedReceiveRequest {
            request: self,
            has_invoice,
        })
    }
}

/// Execute under the caller's exclusive wallet access, retained across mint awaits.
/// Runs pre-wallet invoice constraint checks before executing the receive workflow.
pub async fn receive_ecash(
    w_state: &mut WalletState,
    path: &PathBuf,
    passphrase: &str,
    request: ReceiveEcashRequest,
) -> Result<u64> {
    let validated = request.validate()?;
    receive_ecash_validated(w_state, path, passphrase, validated).await
}

/// Execute the wallet-locked receive workflow after pre-wallet constraint validation.
/// Preserves Nostr updates, receipt lookup order, mint fetch policy, pending claim durability,
/// scoped restore on spent ordinary receives and G2 recovery diagnostics.
pub async fn receive_ecash_validated(
    w_state: &mut WalletState,
    path: &PathBuf,
    passphrase: &str,
    validated: ValidatedReceiveRequest,
) -> Result<u64> {
    let ValidatedReceiveRequest {
        request:
            ReceiveEcashRequest {
                token_string,
                nostr_key,
                expected_mint,
                expected_amount,
                expected_invoice_id,
            },
        has_invoice,
    } = validated;
    let invoice = if has_invoice {
        expected_mint.as_deref().zip(expected_amount)
    } else {
        None
    };

    if let Some(ref key) = nostr_key {
        w_state.set_default_nostr_key(key);
    }

    // Idempotency check: if we already successfully received this exact token, return early
    for tx in &w_state.transactions {
        if tx.status == TransactionStatus::Success {
            if let TransactionType::ReceiveEcash(ref data) = tx.tx_type {
                if expected_invoice_id.is_some()
                    && data.invoice_id == expected_invoice_id
                    && data.token_string != token_string
                {
                    return Err(anyhow!(
                        "This invoice has already been paid by another token"
                    ));
                }
                if data.token_string == token_string {
                    if let Some(id) = expected_invoice_id.as_deref() {
                        crate::payment_request::validate_invoice_receipt(
                            data.invoice_id.as_deref(),
                            id,
                        )?;
                    }
                    if let Some((mint, amount)) = invoice {
                        crate::payment_request::validate_invoice_payment(
                            &tx.mint_url,
                            tx.amount,
                            0,
                            mint,
                            amount,
                        )?;
                    }
                    return Ok(tx.amount);
                }
            }
        }
    }

    let decoded = decode_receive_token(&token_string)?;

    // Fetch mint metadata at the same point, retaining strict invoice failures.
    let client = crate::client::MintClient::new(&decoded.mint_url);
    let all_keysets = if invoice.is_some() {
        client.fetch_keysets().await?
    } else {
        client.fetch_keysets().await.unwrap_or_default()
    };
    let PreparedReceiveInput {
        mint_url,
        input_proofs,
        net_amount,
        fee,
    } = prepare_receive_input(decoded, &all_keysets, invoice)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let tx_id = crate::deferred_ecash::record_claim_attempt(
        w_state,
        &token_string,
        &mint_url,
        net_amount,
        fee,
        expected_invoice_id,
        now,
    )?;
    w_state.normalize_proofs_for_persistence();
    w_state.save_encrypted(path, passphrase)?;

    // Swap proofs with the mint to re-blind them (prevents sender tracking)
    let desired_amounts = split_into_powers_of_2(net_amount);
    let swap_result = swap_proofs(
        w_state,
        path,
        passphrase,
        &mint_url,
        input_proofs,
        desired_amounts,
        vec![], // no change needed — we want all of it
        None,
    )
    .await;

    let new_proofs = match swap_result {
        Ok(proofs) => proofs,
        Err(e) => {
            let err_str = e.to_string().to_lowercase();
            let is_spent = err_str.contains("already spent")
                || err_str.contains("token already spent")
                || err_str.contains("already signed")
                || err_str.contains("already issued");

            if is_spent && invoice.is_none() {
                // The input proofs were already swapped (likely by a previous attempt whose
                // response was lost). Try to recover the output proofs via restore.
                println!(
                    "[receive_ecash] Input proofs already spent — attempting scoped restore for {}",
                    mint_url
                );
                let start_idx = w_state.derivation_index.saturating_sub(30);
                let end_idx = w_state.derivation_index + 10;
                let restore_result = crate::restore::restore_from_mints_range(
                    w_state,
                    path,
                    passphrase,
                    vec![mint_url.clone()],
                    start_idx,
                    end_idx,
                    None,
                )
                .await;

                let total_restored = restore_result.unwrap_or(0);
                if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    if total_restored > 0 {
                        tx.status = TransactionStatus::Success;
                        tx.amount = total_restored;
                        w_state.normalize_proofs_for_persistence();
                        if let Err(save_error) = w_state.save_encrypted(path, passphrase) {
                            let message = format!(
                                "Recovered {total_restored} sats from spent token, but failed to save wallet state: {save_error:#}. Check History before claiming again."
                            );
                            eprintln!("[receive_ecash] {tx_id}: {message}");
                            return Err(anyhow!(message));
                        }
                        return Ok(total_restored);
                    } else {
                        println!("[receive_ecash] Restore recovered 0 proofs");
                        tx.status = TransactionStatus::Failed;
                        w_state.normalize_proofs_for_persistence();
                        let mut message =
                            "Tokens are already spent and could not be recovered".to_string();
                        if let Err(save_error) = w_state.save_encrypted(path, passphrase) {
                            message.push_str(&format!(
                                " Failed status could not be saved: {save_error:#}."
                            ));
                            eprintln!("[receive_ecash] {tx_id}: {message}");
                        }
                        return Err(anyhow!(message));
                    }
                }
                w_state.normalize_proofs_for_persistence();
                let mut message = format!("Failed to receive ecash: {}", e);
                if let Err(save_error) = w_state.save_encrypted(path, passphrase) {
                    message.push_str(&format!(
                        " Recovery state could not be saved: {save_error:#}."
                    ));
                    eprintln!("[receive_ecash] {tx_id}: {message}");
                }
                return Err(anyhow!(message));
            }

            if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Pending;
            }
            let mut message = format!("Failed to receive ecash: {}", e);
            w_state.normalize_proofs_for_persistence();
            if let Err(save_error) = w_state.save_encrypted(path, passphrase) {
                message.push_str(&format!(
                    " Recovery state could not be saved: {save_error:#}. Outcome remains unknown; check History before claiming again."
                ));
                eprintln!("[receive_ecash] {tx_id}: {message}");
            }
            return Err(anyhow!(message));
        }
    };

    let actual_received: u64 = new_proofs.iter().map(|p| p.amount).sum();

    // Store the new proofs in the wallet and ensure mint is tracked
    w_state.credit_proofs(&mint_url, new_proofs);

    // Update transaction to Success
    if let Some(tx) = w_state.find_transaction_mut(&tx_id) {
        tx.amount = actual_received;
        tx.fee += net_amount.saturating_sub(actual_received);
        tx.status = TransactionStatus::Success;
    }
    w_state.normalize_proofs_for_persistence();
    w_state.save_encrypted(path, passphrase)?;

    Ok(actual_received)
}
