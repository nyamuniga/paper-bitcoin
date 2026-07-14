use crate::error::CommandResult;
use ecash_wallet::WalletState;
use ecash_wallet::client::MintClient;
use ecash_core::types::{
    Transaction, TransactionType, ReceiveLightningTransactionData, 
    TransactionStatus, split_into_powers_of_2,
};
use ecash_core::dhke::BlindingSession;
use ecash_core::derivation::TokenDerivation;
use serde::{Deserialize, Serialize};

use tauri::State;
use crate::commands::auth::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiveLightningQuote {
    pub quote_id: String,
    pub invoice: String,
    pub amount: u64,
}

#[tauri::command]
pub async fn receive_lightning(
    mint_url: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<ReceiveLightningQuote> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    // Verify wallet can be loaded
    let _ = WalletState::load_encrypted(&path, &passphrase)?;

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let client = MintClient::new(&mint_url);
    
    let (quote_id, invoice) = client.request_mint_quote(amount).await
        .map_err(|e| crate::error::CommandError(format!("Failed to get mint quote: {}", e)))?;

    Ok(ReceiveLightningQuote {
        quote_id,
        invoice,
        amount,
    })
}

#[tauri::command]
pub async fn check_receive_lightning(
    mint_url: String,
    quote_id: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;
    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let client = MintClient::new(&mint_url);

    // Check if quote is paid
    let check_url = format!("{}/v1/mint/quote/bolt11/{}", client.url, quote_id);
    let resp = client.http.get(&check_url).send().await
        .map_err(|e| crate::error::CommandError(format!("Network error: {}", e)))?;
    
    let check: serde_json::Value = resp.json().await
        .map_err(|e| crate::error::CommandError(format!("Parse error: {}", e)))?;
    
    ecash_wallet::client::check_api_error(&check, "Mint")
        .map_err(|e| crate::error::CommandError(e.to_string()))?;

    let state_str = check.get("state").and_then(|s| s.as_str()).unwrap_or("");
    
    if state_str != "PAID" {
        // Not paid yet
        return Err(crate::error::CommandError("Invoice not paid yet".to_string()));
    }

    // Invoice is paid — mint the tokens
    let keyset = client.fetch_keyset().await
        .map_err(|e| crate::error::CommandError(format!("Failed to fetch keyset: {}", e)))?;

    let desired_amounts = split_into_powers_of_2(amount);
    
    let mut deriv = TokenDerivation::from_hex(&w_state.seed_hex)
        .map_err(|e| crate::error::CommandError(format!("Derivation error: {}", e)))?;
    deriv.index = w_state.derivation_index;

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();

    for &amt in &desired_amounts {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({
            "amount": amt,
            "id": keyset.id,
            "B_": sess.b_prime_hex()
        }));
        sessions.push((amt, sess, index));
    }

    // Save derivation index before network call
    w_state.derivation_index = deriv.index;
    w_state.save_encrypted(&path, &passphrase)?;

    // Mint the tokens
    let sigs = client.mint_tokens(&quote_id, outputs).await
        .map_err(|e| crate::error::CommandError(format!("Mint tokens failed: {}", e)))?;

    if sigs.len() != sessions.len() {
        return Err(crate::error::CommandError(format!(
            "Mint returned {} signatures, expected {}", sigs.len(), sessions.len()
        )));
    }

    // Unblind and store proofs
    let mut new_proofs = Vec::new();
    for (i, sig_val) in sigs.iter().enumerate() {
        let amt = sig_val["amount"].as_u64().unwrap();
        let sig_id = sig_val["id"].as_str().unwrap().to_string();
        let c_prime = ecash_core::dhke::point_from_hex(sig_val["C_"].as_str().unwrap()).unwrap();
        let mint_pk = ecash_core::dhke::point_from_hex(keyset.keys.get(&amt).unwrap()).unwrap();
        let (_, ref sess, idx) = sessions[i];

        let mut proof = sess.unblind(&c_prime, &mint_pk, amt, &sig_id, None);
        proof.derivation_index = idx;
        new_proofs.push(proof);
    }

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
        tx_type: TransactionType::ReceiveLightning(ReceiveLightningTransactionData {
            quote_id: quote_id.clone(),
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
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(true)
}
