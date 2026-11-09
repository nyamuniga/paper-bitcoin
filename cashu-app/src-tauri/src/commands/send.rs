use crate::error::CommandResult;
use ecash_core::types::{
    split_into_powers_of_2, Proof, ReceiveEcashTransactionData, SendTransactionData, Transaction,
    TransactionStatus, TransactionType,
};
use ecash_wallet::swap::swap_proofs;

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
    payment_request: Option<String>,
    payment_max_total: Option<u64>,
    state: State<'_, AppState>,
) -> CommandResult<SendEcashResult> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    let mut proofs = w_state
        .proofs
        .get(&mint_url)
        .ok_or_else(|| anyhow::anyhow!("No proofs found for mint {}", mint_url))?
        .clone();

    if proofs.is_empty() {
        return Err(crate::error::CommandError(
            "No proofs available for this mint".to_string(),
        ));
    }

    if payment_request.is_some() != payment_max_total.is_some() {
        return Err(crate::error::CommandError("Ecash payments require a request and approved total".into()));
    }
    if let Some(ref request) = payment_request {
        if request.len() > 28671 {
            return Err(crate::error::CommandError("Ecash request too large".into()));
        }
        if w_state.transactions.iter().any(|tx| matches!(&tx.tx_type, TransactionType::Send(data) if data.payment_request.as_ref() == Some(request))) {
            return Err(crate::error::CommandError("A payment already exists for this request. Resume it instead of creating another.".into()));
        }
    }
    let force_swap = payment_request.is_some();
    let amount = if let Some(cap) = payment_max_total {
        let quote = super::payment_request::quote(&mint_url, amount, &proofs).await?;
        if quote.total > cap {
            return Err(crate::error::CommandError("Mint fees changed. Review the payment again.".into()));
        }
        quote.token_amount
    } else {
        amount
    };
    let client = ecash_wallet::client::MintClient::new(&mint_url);
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
        if let Ok(states) = client.check_state(&ys).await {
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
                w_state.save_encrypted(&path, &passphrase)?;
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
        // 2. We need to split proofs via swap
        let all_keysets = if force_swap {
            client.fetch_keysets().await?
        } else {
            client.fetch_keysets().await.unwrap_or_default()
        };

        // Select proofs summing to >= amount + swap_fee (prefer smallest to clean up dust)
        let mut sorted_proofs = proofs.clone();
        sorted_proofs.sort_by_key(|p| p.amount);

        let mut selected_for_swap = Vec::new();
        let mut swap_total = 0;

        for proof in &sorted_proofs {
            selected_for_swap.push(proof.clone());
            swap_total += proof.amount;
            let swap_fee = ecash_wallet::client::calculate_input_fee(&selected_for_swap, &all_keysets);
            if swap_total >= amount + swap_fee {
                break;
            }
        }

        let swap_fee = ecash_wallet::client::calculate_input_fee(&selected_for_swap, &all_keysets);
        if swap_total < amount + swap_fee {
            return Err(crate::error::CommandError(format!(
                "Insufficient balance. Have {} sats, need {} sats (including {} sats mint fee)",
                swap_total, amount + swap_fee, swap_fee
            )));
        }

        if let Some(cap) = payment_max_total {
            if amount.saturating_add(swap_fee) > cap {
                return Err(crate::error::CommandError("Mint fees changed. Review the payment again.".into()));
            }
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

        let pending_tx = Transaction {
            id: tx_id.clone(),
            tx_type: TransactionType::Send(SendTransactionData {
                payment_request: payment_request.clone(),
                token_string: "".to_string(), // Will populate after successful swap
                proofs: selected_for_swap.clone(),
            }),
            amount,
            fee: swap_fee,
            status: TransactionStatus::Pending,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url: mint_url.clone(),
        };
        w_state.transactions.push(pending_tx);
        w_state.save_encrypted(&path, &passphrase)?;

        let change_amount = swap_total.saturating_sub(amount).saturating_sub(swap_fee);
        let desired_denoms = split_into_powers_of_2(amount);
        let change_denoms = split_into_powers_of_2(change_amount);

        // perform_swap handles updating the wallet state with the change
        let swap_result = swap_proofs(
            w_state,
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
    let tx_id_for_success = if let Some(tx) = pending_tx_id
        .as_ref()
        .and_then(|id| w_state.transactions.iter_mut().find(|t| &t.id == id))
    {
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
                payment_request: payment_request.clone(),
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
    expected_mint: Option<String>,
    expected_amount: Option<u64>,
    expected_invoice_id: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    if expected_mint.is_some() != expected_amount.is_some()
        || expected_mint.is_some() != expected_invoice_id.is_some()
        || expected_invoice_id.as_ref().is_some_and(|id| id.is_empty() || id.len() > 64)
    {
        return Err(crate::error::CommandError("Incomplete invoice payment constraints".into()));
    }
    if expected_amount.is_some() && token_string.len() > 100000 {
        return Err(crate::error::CommandError("Invoice payment is too large".into()));
    }
    let invoice = expected_mint.as_deref().zip(expected_amount);
    if let Some((mint, amount)) = invoice {
        let (received_mint, _, total) = ecash_wallet::decode_token_string(&token_string)?;
        ecash_wallet::payment_request::validate_invoice_payment(&received_mint, total, 0, mint, amount)?;
    }
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    if let Some(ref key) = nostr_key {
        if w_state.default_nostr_key.as_ref() != Some(key) {
            w_state.default_nostr_key = Some(key.clone());
        }
    }

    // Idempotency check: if we already successfully received this exact token, return early
    for tx in &w_state.transactions {
        if tx.status == TransactionStatus::Success {
            if let TransactionType::ReceiveEcash(ref data) = tx.tx_type {
                if expected_invoice_id.is_some() && data.invoice_id == expected_invoice_id && data.token_string != token_string {
                    return Err(crate::error::CommandError("This invoice has already been paid by another token".into()));
                }
                if data.token_string == token_string {
                    if let Some(id) = expected_invoice_id.as_deref() {
                        ecash_wallet::payment_request::validate_invoice_receipt(data.invoice_id.as_deref(), id)?;
                    }
                    if let Some((mint, amount)) = invoice {
                        ecash_wallet::payment_request::validate_invoice_payment(&tx.mint_url, tx.amount, 0, mint, amount)?;
                    }
                    return Ok(tx.amount);
                }
            }
        }
    }

    let (mint_url, mut input_proofs, total_amount) = ecash_wallet::decode_token_string(&token_string)
        .map_err(|e| crate::error::CommandError(format!("Failed to parse token: {}", e)))?;

    // Query mint keysets to resolve any short keyset IDs and calculate input fees
    let client = ecash_wallet::client::MintClient::new(&mint_url);
    let all_keysets = if invoice.is_some() {
        let keysets = client.fetch_keysets().await?;
        ecash_wallet::payment_request::resolve_keysets(&mut input_proofs, &keysets)?;
        keysets
    } else {
        client.fetch_keysets().await.unwrap_or_default()
    };

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
        let fee_ppk = all_keysets.iter()
            .find(|ks| ks.id == p.id)
            .map(|ks| ks.input_fee_ppk)
            .unwrap_or(0);
        total_fee_ppk = total_fee_ppk.checked_add(fee_ppk)
            .ok_or_else(|| crate::error::CommandError("Mint fee overflow".into()))?;
    }
    let fee = if total_fee_ppk > 0 {
        total_fee_ppk.checked_add(999)
            .ok_or_else(|| crate::error::CommandError("Mint fee overflow".into()))? / 1000
    } else {
        0
    };

    if fee >= total_amount {
        return Err(crate::error::CommandError(format!(
            "Token amount ({} sat) cannot cover the mint input fee ({} sat)",
            total_amount, fee
        )));
    }

    let net_amount = total_amount - fee;
    if let Some((mint, amount)) = invoice {
        ecash_wallet::payment_request::validate_invoice_payment(&mint_url, total_amount, fee, mint, amount)?;
    }

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
            invoice_id: expected_invoice_id,
        }),
        amount: net_amount,
        fee,
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
    let desired_amounts = split_into_powers_of_2(net_amount);
    let swap_result = swap_proofs(
        w_state,
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

            if is_spent && invoice.is_none() {
                // The input proofs were already swapped (likely by a previous attempt whose
                // response was lost). Try to recover the output proofs via restore.
                println!("[receive_ecash] Input proofs already spent — attempting scoped restore for {}", mint_url);
                let start_idx = w_state.derivation_index.saturating_sub(30);
                let end_idx = w_state.derivation_index + 10;
                let restore_result = ecash_wallet::restore::restore_from_mints_range(
                    w_state, &path, &passphrase, vec![mint_url.clone()], start_idx, end_idx, None
                ).await;

                let total_restored = restore_result.unwrap_or(0);
                if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    if total_restored > 0 {
                        tx.status = TransactionStatus::Success;
                        tx.amount = total_restored;
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

    let actual_received: u64 = new_proofs.iter().map(|p| p.amount).sum();

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
        tx.amount = actual_received;
        tx.fee += net_amount.saturating_sub(actual_received);
        tx.status = TransactionStatus::Success;
    }
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(actual_received)
}
