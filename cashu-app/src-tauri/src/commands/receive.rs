use crate::error::CommandResult;
use ecash_core::derivation::TokenDerivation;
use ecash_core::dhke::BlindingSession;
use ecash_core::types::{
    split_into_powers_of_2, ReceiveLightningTransactionData, Transaction, TransactionStatus,
    TransactionType,
};
use ecash_wallet::client::MintClient;
use ecash_wallet::WalletState;
use serde::{Deserialize, Serialize};

use crate::commands::auth::AppState;
use tauri::State;

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
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    // Load wallet state
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let client = MintClient::new(&mint_url);

    let (quote_id, invoice) = client
        .request_mint_quote(amount)
        .await
        .map_err(|e| crate::error::CommandError(format!("Failed to get mint quote: {}", e)))?;

    let keyset = client
        .fetch_keyset()
        .await
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

    w_state.derivation_index = deriv.index;

    let pending_tx = Transaction {
        id: quote_id.clone(), // Use quote_id as the transaction ID for easy polling
        tx_type: TransactionType::ReceiveLightning(ReceiveLightningTransactionData {
            quote_id: quote_id.clone(),
            outputs: outputs.clone(),
            blinding_sessions_hex: sessions
                .iter()
                .map(|(_, sess, _)| sess.secret.clone())
                .collect(),
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
    w_state.transactions.insert(0, pending_tx);
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(ReceiveLightningQuote {
        quote_id,
        invoice,
        amount,
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalQuote {
    pub quote_id: String,
    pub amount: u64,
    pub mint_url: String,
}

#[tauri::command]
pub async fn batch_mint_external_quotes(
    quotes: Vec<ExternalQuote>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = {
        let _lock = state.wallet_lock.lock().await;
        WalletState::load_encrypted(&path, &passphrase)?
    };

    use std::collections::HashMap;
    let mut grouped_quotes: HashMap<String, Vec<ExternalQuote>> = HashMap::new();
    for q in quotes {
        grouped_quotes.entry(q.mint_url.clone()).or_default().push(q);
    }

    let mut claimed_count = 0;

    for (raw_mint_url, mint_quotes) in grouped_quotes {
        let mint_url = ecash_wallet::state::normalize_mint_url(&raw_mint_url);
        let client = MintClient::new(&mint_url);
        
        let keyset = match client.fetch_keyset().await {
            Ok(k) => k,
            Err(e) => {
                println!("Failed to fetch keyset for {}: {}", mint_url, e);
                continue;
            }
        };

        let mut keys_parsed = HashMap::new();
        for (amt, pk) in &keyset.keys {
            if let Ok(pk_parsed) = ecash_core::dhke::point_from_hex(pk) {
                keys_parsed.insert(*amt, pk_parsed);
            }
        }

        for quote in mint_quotes {
            let desired_amounts = split_into_powers_of_2(quote.amount);
            
            let mut deriv = match TokenDerivation::from_hex(&w_state.seed_hex) {
                Ok(d) => d,
                Err(_) => continue,
            };
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
            
            w_state.derivation_index = deriv.index;
            
            if let Ok(sig_res) = client.mint_tokens(&quote.quote_id, outputs.clone()).await {
                let mut new_proofs = Vec::new();
                let mut success = true;

                for (i, sig_obj) in sig_res.iter().enumerate() {
                    let sig_id = sig_obj.get("id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                    let amount = sig_obj.get("amount").and_then(|a| a.as_u64()).unwrap_or(0);
                    let c_prime_hex = sig_obj.get("C_").and_then(|c| c.as_str()).unwrap_or("");
                    
                    if let (Ok(c_prime), Some(mint_pk)) = (ecash_core::dhke::point_from_hex(c_prime_hex), keys_parsed.get(&amount)) {
                        let (amt, sess, index) = &sessions[i];
                        
                        let dleq = sig_obj.get("dleq").cloned().map(|d| {
                            serde_json::from_value::<ecash_core::types::Dleq>(d).ok()
                        }).flatten();

                        let mut proof = sess.unblind(&c_prime, mint_pk, *amt, &sig_id, dleq);
                        proof.derivation_index = *index;
                        new_proofs.push(proof);
                    } else {
                        success = false;
                    }
                }

                if success {
                    w_state.proofs.entry(mint_url.clone()).or_default().extend(new_proofs);
                    
                    let tx = Transaction {
                        id: quote.quote_id.clone(),
                        tx_type: TransactionType::ReceiveLightning(ReceiveLightningTransactionData {
                            quote_id: quote.quote_id.clone(),
                            outputs,
                            blinding_sessions_hex: sessions.iter().map(|(_, sess, _)| sess.secret.clone()).collect(),
                        }),
                        amount: quote.amount,
                        fee: 0,
                        status: TransactionStatus::Success,
                        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        mint_url: mint_url.clone(),
                    };
                    w_state.transactions.insert(0, tx);
                    claimed_count += 1;
                }
            }
        }
    }

    {
        let _lock = state.wallet_lock.lock().await;
        w_state.save_encrypted(&path, &passphrase)?;
    }

    Ok(claimed_count)
}
