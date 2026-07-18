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
    pub tx_id: String,
}

#[tauri::command]
pub async fn send_ecash(
    mint_url: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<SendEcashResult> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

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

    // 1. Try to find exact proofs
    if let Some(exact_proofs) = select_exact_proofs(&proofs, amount) {
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

    // Build the CashuToken strictly (NUT-00 format), ignoring internal wallet proof fields
    // which cause other wallets to fail parsing the token.
    let token_json = serde_json::json!({
        "token": [{
            "mint": mint_url.clone(),
            "proofs": final_send_proofs.iter().map(|p| serde_json::json!({
                "id": p.id,
                "amount": p.amount,
                "secret": p.secret,
                "C": p.c,
            })).collect::<Vec<_>>()
        }],
        "unit": "sat"
    });

    use base64::Engine;
    let json_str = serde_json::to_string(&token_json).unwrap();
    let encoded = format!(
        "cashuA{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json_str.as_bytes())
    );

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
        tx_id: tx_id_for_success,
    })
}

#[tauri::command]
pub async fn receive_ecash(token_string: String, state: State<'_, AppState>) -> CommandResult<u64> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mut input_proofs: Vec<Proof> = Vec::new();
    let mut total_amount: u64 = 0;
    let mint_url;

    if token_string.starts_with("cashuA") {
        let token_body = token_string.strip_prefix("cashuA").unwrap();
        use base64::Engine;
        let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;

        let token_json: serde_json::Value = serde_json::from_slice(&json_bytes)
            .map_err(|e| anyhow::anyhow!("JSON parse error: {}", e))?;

        let token_array = token_json
            .get("token")
            .and_then(|t| t.as_array())
            .ok_or_else(|| anyhow::anyhow!("Invalid token format: missing 'token' array"))?;

        if token_array.is_empty() {
            return Err(crate::error::CommandError(
                "Token contains no entries".to_string(),
            ));
        }

        let entry = &token_array[0];
        mint_url = entry
            .get("mint")
            .and_then(|m| m.as_str())
            .ok_or_else(|| anyhow::anyhow!("Token missing mint URL"))?
            .to_string();

        let proofs_json = entry
            .get("proofs")
            .and_then(|p| p.as_array())
            .ok_or_else(|| anyhow::anyhow!("Token missing proofs"))?;

        for pj in proofs_json {
            let amount = pj
                .get("amount")
                .and_then(|a| a.as_u64())
                .ok_or_else(|| anyhow::anyhow!("Proof missing amount"))?;
            let id = pj
                .get("id")
                .and_then(|i| i.as_str())
                .ok_or_else(|| anyhow::anyhow!("Proof missing id"))?
                .to_string();
            let secret = pj
                .get("secret")
                .and_then(|s| s.as_str())
                .ok_or_else(|| anyhow::anyhow!("Proof missing secret"))?
                .to_string();
            let c = pj
                .get("C")
                .and_then(|c| c.as_str())
                .ok_or_else(|| anyhow::anyhow!("Proof missing C"))?
                .to_string();

            input_proofs.push(Proof {
                amount,
                id,
                secret,
                c,
                c_prime: None,
                b_prime: None,
                derivation_index: 0,
                dleq: None,
            });
            total_amount += amount;
        }
    } else if token_string.starts_with("cashuB") {
        let token_body = token_string.strip_prefix("cashuB").unwrap();
        use base64::Engine;
        let cbor_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;

        let cbor_val: ciborium::Value = ciborium::from_reader(&cbor_bytes[..])
            .map_err(|e| anyhow::anyhow!("CBOR parse error: {}", e))?;

        let cbor_map = cbor_val
            .as_map()
            .ok_or_else(|| anyhow::anyhow!("CBOR token is not a map"))?;

        fn get_val<'a>(
            map: &'a Vec<(ciborium::Value, ciborium::Value)>,
            key: &str,
        ) -> Option<&'a ciborium::Value> {
            map.iter()
                .find(|(k, _)| k.as_text() == Some(key))
                .map(|(_, v)| v)
        }

        let bytes_to_hex =
            |v: &ciborium::Value| -> Option<String> { v.as_bytes().map(|b| hex::encode(b)) };

        mint_url = get_val(cbor_map, "m")
            .and_then(|v| v.as_text())
            .ok_or_else(|| anyhow::anyhow!("Token missing mint URL"))?
            .to_string();

        let tokens = get_val(cbor_map, "t")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow::anyhow!("Token missing 't' array"))?;

        if tokens.is_empty() {
            return Err(crate::error::CommandError(
                "Token contains no entries".to_string(),
            ));
        }

        for t in tokens {
            let t_map = t
                .as_map()
                .ok_or_else(|| anyhow::anyhow!("Token entry is not a map"))?;
            let keyset_id = get_val(t_map, "i")
                .and_then(bytes_to_hex)
                .ok_or_else(|| anyhow::anyhow!("Token missing keyset id"))?;

            let proofs = get_val(t_map, "p")
                .and_then(|v| v.as_array())
                .ok_or_else(|| anyhow::anyhow!("Token missing proofs"))?;

            for p in proofs {
                let p_map = p
                    .as_map()
                    .ok_or_else(|| anyhow::anyhow!("Proof is not a map"))?;

                let amount_int = get_val(p_map, "a")
                    .and_then(|v| v.as_integer())
                    .ok_or_else(|| anyhow::anyhow!("Proof missing amount"))?;
                let amount: u64 = amount_int.try_into().unwrap_or(0);

                let secret = get_val(p_map, "s")
                    .and_then(|v| bytes_to_hex(v).or_else(|| v.as_text().map(|s| s.to_string())))
                    .ok_or_else(|| anyhow::anyhow!("Proof missing secret"))?;

                let c = get_val(p_map, "c")
                    .and_then(bytes_to_hex)
                    .ok_or_else(|| anyhow::anyhow!("Proof missing C"))?;

                input_proofs.push(Proof {
                    amount,
                    id: keyset_id.clone(),
                    secret,
                    c,
                    c_prime: None,
                    b_prime: None,
                    derivation_index: 0,
                    dleq: None,
                });
                total_amount += amount;
            }
        }
    } else {
        return Err(crate::error::CommandError(
            "Invalid token: must start with cashuA or cashuB".to_string(),
        ));
    }

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);

    if total_amount == 0 {
        return Err(crate::error::CommandError(
            "Token has zero value".to_string(),
        ));
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
    )
    .await;

    let new_proofs = match swap_result {
        Ok(proofs) => proofs,
        Err(e) => {
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
