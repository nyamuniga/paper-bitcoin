use crate::error::CommandResult;
use ecash_wallet::{WalletState, swap::swap_proofs};
use ecash_core::types::{Transaction, TransactionType, SendTransactionData, TransactionStatus, Proof, split_into_powers_of_2};

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
