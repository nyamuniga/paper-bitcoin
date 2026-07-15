use crate::error::CommandResult;
use ecash_wallet::{WalletState, swap::swap_proofs};
use ecash_core::types::{Transaction, TransactionType, SendTransactionData, ReceiveEcashTransactionData, TransactionStatus, Proof, split_into_powers_of_2};

use tauri::State;
use crate::commands::auth::AppState;

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

#[tauri::command]
pub async fn send_ecash(mint_url: String, amount: u64, state: State<'_, AppState>) -> CommandResult<String> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    // Get proofs for this mint
    let proofs = w_state.proofs.get(&mint_url)
        .ok_or_else(|| anyhow::anyhow!("No proofs found for mint {}", mint_url))?
        .clone();

    if proofs.is_empty() {
        return Err(crate::error::CommandError("No proofs available for this mint".to_string()));
    }

    let final_send_proofs;

    // 1. Try to find exact proofs
    if let Some(exact_proofs) = select_exact_proofs(&proofs, amount) {
        final_send_proofs = exact_proofs;
        
        // Remove exactly these proofs from the wallet
        if let Some(mint_proofs) = w_state.proofs.get_mut(&mint_url) {
            let selected_secrets: std::collections::HashSet<String> = final_send_proofs.iter().map(|p| p.secret.clone()).collect();
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
                "Insufficient balance. Have {} sats, need {} sats", swap_total, amount
            )));
        }

        let change_amount = swap_total - amount;
        let desired_denoms = split_into_powers_of_2(amount);
        let change_denoms = split_into_powers_of_2(change_amount);

        // perform_swap handles updating the wallet state with the change
        final_send_proofs = swap_proofs(
            &mut w_state,
            &path,
            &passphrase,
            &mint_url,
            selected_for_swap,
            desired_denoms,
            change_denoms,
        ).await.map_err(|e| crate::error::CommandError(format!("Failed to split tokens: {}", e)))?;
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
    let encoded = format!("cashuA{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json_str.as_bytes()));

    // Record transaction
    let tx_id = format!("tx_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    let tx = Transaction {
        id: tx_id,
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

    // Save wallet state
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(encoded)
}

#[tauri::command]
pub async fn receive_ecash(token_string: String, state: State<'_, AppState>) -> CommandResult<u64> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mut input_proofs: Vec<Proof> = Vec::new();
    let mut total_amount: u64 = 0;
    let mint_url;

    if token_string.starts_with("cashuA") {
        let token_body = token_string.strip_prefix("cashuA").unwrap();
        use base64::Engine;
        let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;
        
        let token_json: serde_json::Value = serde_json::from_slice(&json_bytes)
            .map_err(|e| anyhow::anyhow!("JSON parse error: {}", e))?;

        let token_array = token_json.get("token").and_then(|t| t.as_array())
            .ok_or_else(|| anyhow::anyhow!("Invalid token format: missing 'token' array"))?;

        if token_array.is_empty() {
            return Err(crate::error::CommandError("Token contains no entries".to_string()));
        }

        let entry = &token_array[0];
        mint_url = entry.get("mint").and_then(|m| m.as_str())
            .ok_or_else(|| anyhow::anyhow!("Token missing mint URL"))?
            .to_string();

        let proofs_json = entry.get("proofs").and_then(|p| p.as_array())
            .ok_or_else(|| anyhow::anyhow!("Token missing proofs"))?;

        for pj in proofs_json {
            let amount = pj.get("amount").and_then(|a| a.as_u64())
                .ok_or_else(|| anyhow::anyhow!("Proof missing amount"))?;
            let id = pj.get("id").and_then(|i| i.as_str())
                .ok_or_else(|| anyhow::anyhow!("Proof missing id"))?
                .to_string();
            let secret = pj.get("secret").and_then(|s| s.as_str())
                .ok_or_else(|| anyhow::anyhow!("Proof missing secret"))?
                .to_string();
            let c = pj.get("C").and_then(|c| c.as_str())
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
        let cbor_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;
        
        let cbor_val: ciborium::Value = ciborium::from_reader(&cbor_bytes[..])
            .map_err(|e| anyhow::anyhow!("CBOR parse error: {}", e))?;
        
        let cbor_map = cbor_val.as_map().ok_or_else(|| anyhow::anyhow!("CBOR token is not a map"))?;
        
        fn get_val<'a>(map: &'a Vec<(ciborium::Value, ciborium::Value)>, key: &str) -> Option<&'a ciborium::Value> {
            map.iter().find(|(k, _)| k.as_text() == Some(key)).map(|(_, v)| v)
        }
        
        let bytes_to_hex = |v: &ciborium::Value| -> Option<String> {
            v.as_bytes().map(|b| hex::encode(b))
        };

        mint_url = get_val(cbor_map, "m").and_then(|v| v.as_text())
            .ok_or_else(|| anyhow::anyhow!("Token missing mint URL"))?
            .to_string();

        let tokens = get_val(cbor_map, "t").and_then(|v| v.as_array())
            .ok_or_else(|| anyhow::anyhow!("Token missing 't' array"))?;

        if tokens.is_empty() {
            return Err(crate::error::CommandError("Token contains no entries".to_string()));
        }

        for t in tokens {
            let t_map = t.as_map().ok_or_else(|| anyhow::anyhow!("Token entry is not a map"))?;
            let keyset_id = get_val(t_map, "i").and_then(bytes_to_hex)
                .ok_or_else(|| anyhow::anyhow!("Token missing keyset id"))?;
            
            let proofs = get_val(t_map, "p").and_then(|v| v.as_array())
                .ok_or_else(|| anyhow::anyhow!("Token missing proofs"))?;
            
            for p in proofs {
                let p_map = p.as_map().ok_or_else(|| anyhow::anyhow!("Proof is not a map"))?;
                
                let amount_int = get_val(p_map, "a").and_then(|v| v.as_integer())
                    .ok_or_else(|| anyhow::anyhow!("Proof missing amount"))?;
                let amount: u64 = amount_int.try_into().unwrap_or(0);

                let secret = get_val(p_map, "s")
                    .and_then(|v| bytes_to_hex(v).or_else(|| v.as_text().map(|s| s.to_string())))
                    .ok_or_else(|| anyhow::anyhow!("Proof missing secret"))?;
                
                let c = get_val(p_map, "c").and_then(bytes_to_hex)
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
        return Err(crate::error::CommandError("Invalid token: must start with cashuA or cashuB".to_string()));
    }

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);

    if total_amount == 0 {
        return Err(crate::error::CommandError("Token has zero value".to_string()));
    }

    // Swap proofs with the mint to re-blind them (prevents sender tracking)
    let desired_amounts = split_into_powers_of_2(total_amount);
    let new_proofs = swap_proofs(
        &mut w_state,
        &path,
        &passphrase,
        &mint_url,
        input_proofs,
        desired_amounts,
        vec![], // no change needed — we want all of it
    ).await.map_err(|e| crate::error::CommandError(format!("Failed to receive ecash: {}", e)))?;

    // Store the new proofs in the wallet
    w_state.proofs.entry(mint_url.clone()).or_default().extend(new_proofs);

    // Ensure mint is tracked
    if !w_state.mints.contains(&mint_url) {
        w_state.mints.push(mint_url.clone());
    }

    // Record transaction
    let tx_id = format!("tx_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    let tx = Transaction {
        id: tx_id,
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: token_string.clone(),
        }),
        amount: total_amount,
        fee: 0,
        status: TransactionStatus::Success,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        mint_url,
    };
    w_state.transactions.push(tx);
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(total_amount)
}
