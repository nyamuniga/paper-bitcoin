use crate::error::CommandResult;
use ecash_core::types::{
    split_into_powers_of_2, Proof, ReceiveEcashTransactionData, SendTransactionData, Transaction,
    TransactionStatus, TransactionType,
};
use ecash_wallet::{swap::swap_proofs, WalletState};

use crate::commands::auth::AppState;
use tauri::State;

fn select_exact_proofs(proofs: &[Proof], target_amount: u64) -> Option<Vec<Proof>> {
    let mut sorted = proofs.to_vec();
    sorted.sort_by_key(|p| std::cmp::Reverse(p.amount));

    let mut selected = Vec::new();
    let mut sum = 0;
    for p in sorted {
        if sum + p.amount <= target_amount {
            selected.push(p.clone());
            sum += p.amount;
        }
        if sum == target_amount {
            return Some(selected);
        }
    }
    None
}

#[derive(serde::Serialize)]
pub struct SendEcashResult {
    pub token: String,
    pub token_v3: String,
    pub token_v4: String,
    pub tx_id: String,
}

#[tauri::command]
pub async fn send_ecash(
    mint_url: String,
    amount: u64,
    pubkey: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<SendEcashResult> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let _lock = state.wallet_lock.lock().await;
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    // Get proofs for this mint
    let proofs = w_state
        .proofs
        .get(&mint_url)
        .ok_or_else(|| anyhow::anyhow!("No proofs found for mint {}", mint_url))?
        .clone();

    if proofs.is_empty() {
        return Err(crate::error::CommandError(
            "No proofs available for this mint".to_string(),
        ));
    }

    let final_send_proofs;

    // 1. Try to find exact proofs (ONLY if we are not locking to a pubkey)
    // If a pubkey is provided, we must do a swap to generate new P2PK-locked proofs.
    if pubkey.is_none() && select_exact_proofs(&proofs, amount).is_some() {
        let exact_proofs = select_exact_proofs(&proofs, amount).unwrap();
        final_send_proofs = exact_proofs;

        // Remove exactly these proofs from the wallet
        if let Some(mint_proofs) = w_state.proofs.get_mut(&mint_url) {
            let selected_secrets: std::collections::HashSet<String> =
                final_send_proofs.iter().map(|p| p.secret.clone()).collect();
            mint_proofs.retain(|p| !selected_secrets.contains(&p.secret));
        }
        // Save wallet state
        w_state.save_encrypted(&path, &passphrase)?;
    } else {
        // 2. We need to split proofs via swap
        // Select proofs summing to >= amount (prefer smallest to clean up dust)
        let mut sorted_proofs = proofs.clone();
        sorted_proofs.sort_by_key(|p| p.amount);

        let mut selected_for_swap = Vec::new();
        let mut swap_total = 0;

        for proof in &sorted_proofs {
            if swap_total >= amount {
                break;
            }
            selected_for_swap.push(proof.clone());
            swap_total += proof.amount;
        }

        if swap_total < amount {
            return Err(crate::error::CommandError(format!(
                "Insufficient balance. Have {} sats, need {} sats",
                swap_total, amount
            )));
        }

        // Record pending transaction before swap
        let tx_id = format!(
            "tx_send_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let pending_tx = Transaction {
            id: tx_id.clone(),
            tx_type: TransactionType::Send(SendTransactionData {
                token_string: "".to_string(), // Will populate after successful swap
                proofs: selected_for_swap.clone(),
            }),
            amount,
            fee: 0,
            status: TransactionStatus::Pending,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url: mint_url.clone(),
        };
        w_state.transactions.push(pending_tx);
        w_state.save_encrypted(&path, &passphrase)?;

        let change_amount = swap_total - amount;
        let desired_denoms = split_into_powers_of_2(amount);
        let change_denoms = split_into_powers_of_2(change_amount);

        // perform_swap handles updating the wallet state with the change
        let swap_result = swap_proofs(
            &mut w_state,
            &path,
            &passphrase,
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
                // Update to failed if the swap fails with a network error
                if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    // Keep it pending if we are unsure, but if we fail here it's safer to leave pending
                    // Actually, if we get here, the swap failed. But we leave it as Pending because
                    // the proofs might be SPENT on the mint. The user will use "Check Status" to verify.
                    tx.status = TransactionStatus::Pending;
                }
                w_state.save_encrypted(&path, &passphrase).ok();
                return Err(crate::error::CommandError(format!(
                    "Failed to split tokens: {}",
                    e
                )));
            }
        };
    }

    let token_v3 = ecash_wallet::encode_token_v3(&mint_url, &final_send_proofs, Some("sat"))
        .map_err(|e| crate::error::CommandError(format!("Failed to encode token v3: {}", e)))?;

    let token_v4 = ecash_wallet::encode_token_v4(&mint_url, &final_send_proofs, Some("sat"))
        .map_err(|e| crate::error::CommandError(format!("Failed to encode token v4: {}", e)))?;

    // Use token_v3 (cashuA) as the primary/default token string as it is supported universally
    let encoded = token_v3.clone();

    // Update transaction to Success
    let tx_id_for_success = if let Some(tx) = w_state.transactions.iter_mut().find(|t| {
        matches!(&t.tx_type, TransactionType::Send(_)) && t.status == TransactionStatus::Pending
    }) {
        if let TransactionType::Send(data) = &mut tx.tx_type {
            data.token_string = encoded.clone();
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
                token_string: encoded.clone(),
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
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(SendEcashResult {
        token: encoded,
        token_v3,
        token_v4,
        tx_id: tx_id_for_success,
    })
}

#[tauri::command]
pub async fn receive_ecash(
    token_string: String,
    nostr_key: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let _lock = state.wallet_lock.lock().await;
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    if let Some(ref key) = nostr_key {
        if w_state.default_nostr_key.as_ref() != Some(key) {
            w_state.default_nostr_key = Some(key.clone());
        }
    }

    // Idempotency check: if we already successfully received this exact token, return early
    for tx in &w_state.transactions {
        if tx.status == TransactionStatus::Success {
            if let TransactionType::ReceiveEcash(ref data) = tx.tx_type {
                if data.token_string == token_string {
                    return Ok(tx.amount);
                }
            }
        }
    }

    let (mint_url, input_proofs, total_amount) = ecash_wallet::decode_token_string(&token_string)
        .map_err(|e| crate::error::CommandError(format!("Failed to parse token: {}", e)))?;

    // Record pending transaction before swap
    let tx_id = format!(
        "tx_receive_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: token_string.clone(),
        }),
        amount: total_amount,
        fee: 0,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        mint_url: mint_url.clone(),
    };
    w_state.transactions.push(pending_tx);
    w_state.save_encrypted(&path, &passphrase)?;

    // Swap proofs with the mint to re-blind them (prevents sender tracking)
    let desired_amounts = split_into_powers_of_2(total_amount);
    let swap_result = swap_proofs(
        &mut w_state,
        &path,
        &passphrase,
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

            if is_spent {
                // The input proofs were already swapped (likely by a previous attempt whose
                // response was lost). Try to recover the output proofs via restore.
                println!("[receive_ecash] Input proofs already spent — attempting restore for {}", mint_url);
                let restore_result = ecash_wallet::restore::restore_from_mints(
                    &mut w_state, &path, &passphrase, vec![mint_url.clone()], None
                ).await;

                let total_restored = restore_result.unwrap_or(0);
                if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    if total_restored > 0 {
                        tx.status = TransactionStatus::Success;
                        w_state.save_encrypted(&path, &passphrase).ok();
                        return Ok(total_restored);
                    } else {
                        println!("[receive_ecash] Restore recovered 0 proofs");
                        tx.status = TransactionStatus::Failed;
                        w_state.save_encrypted(&path, &passphrase).ok();
                        return Err(crate::error::CommandError(
                            "Tokens are already spent and could not be recovered".to_string(),
                        ));
                    }
                }
                w_state.save_encrypted(&path, &passphrase).ok();
                return Err(crate::error::CommandError(format!(
                    "Failed to receive ecash: {}",
                    e
                )));
            }

            if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Pending;
            }
            w_state.save_encrypted(&path, &passphrase).ok();
            return Err(crate::error::CommandError(format!(
                "Failed to receive ecash: {}",
                e
            )));
        }
    };

    // Store the new proofs in the wallet
    w_state
        .proofs
        .entry(mint_url.clone())
        .or_default()
        .extend(new_proofs);

    // Ensure mint is tracked
    if !w_state.mints.contains(&mint_url) {
        w_state.mints.push(mint_url.clone());
    }

    // Update transaction to Success
    if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
        tx.status = TransactionStatus::Success;
    }
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(total_amount)
}
