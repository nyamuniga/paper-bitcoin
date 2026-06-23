use std::path::PathBuf;
use anyhow::{anyhow, Context, Result};
use ecash_core::{dhke::{point_from_hex, BlindingSession}, types::{TransactionType, TransactionStatus}};

use crate::*;
use crate::client::MintClient;
use crate::melt::parse_dleq;

// ─── Transaction History API ──────────────────────────────────────────────────

pub async fn retry_mint(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, tx_id: &str) -> Result<()> {
    let tx = state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| anyhow!("Transaction not found"))?.clone();

    if tx.status != TransactionStatus::Pending {
        return Err(anyhow!("Transaction is not pending"));
    }

    let mint_data = match tx.tx_type {
        TransactionType::Mint(data) => data,
        _ => return Err(anyhow!("Not a mint transaction")),
    };

    let client = MintClient::new(&tx.mint_url);
    let keyset = client.fetch_keyset().await?;
    
    let sigs = client.mint_tokens(&mint_data.quote_id, mint_data.outputs.clone()).await?;

    let mut sessions = Vec::new();
    for (secret_hex, out) in mint_data.blinding_sessions_hex.iter().zip(mint_data.outputs.iter()) {
        let amount = out["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in outputs"))?;
        sessions.push((amount, secret_hex.clone()));
    }

    let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
    keyset_cache.insert(keyset.id.clone(), keyset.clone());

    let mut new_proofs = Vec::new();
    for sig in sigs.iter() {
        let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
        
        let session_idx = sessions.iter().position(|(d, _)| *d == amount)
            .ok_or_else(|| anyhow!("Mint returned signature for unknown amount {}", amount))?;
        let (_, secret_hex) = sessions.remove(session_idx);

        let sig_id = sig["id"].as_str().unwrap_or(&keyset.id).to_string();
        let actual_keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
            ks.clone()
        } else {
            let ks = client.fetch_keyset_by_id(&sig_id).await?;
            keyset_cache.insert(sig_id.clone(), ks.clone());
            ks
        };

        let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
        let c_prime = point_from_hex(c_prime_str).context("Invalid C_")?;
        let mint_pk_str = actual_keyset.keys.get(&amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", amount))?;
        let mint_pk = point_from_hex(mint_pk_str).context("Invalid mint pk")?;
        let dleq = parse_dleq(sig);
        
        let sess = BlindingSession::new(&secret_hex);
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
        proof.derivation_index = 0; // Salvaged proofs go directly into wallet with index 0
        new_proofs.push(proof);
    }

    state.proofs.entry(tx.mint_url.clone()).or_default().extend(new_proofs);
    
    if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
        t.status = TransactionStatus::Success;
    }
    
    state.save_encrypted(wallet_path, passphrase)?;
    
    Ok(())
}

pub async fn check_melt_status(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, tx_id: &str) -> Result<TransactionStatus> {
    let tx = state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| anyhow!("Transaction not found"))?.clone();

    if tx.status != TransactionStatus::Pending {
        return Ok(tx.status);
    }

    let melt_data = match tx.tx_type {
        TransactionType::Melt(data) => data,
        _ => return Err(anyhow!("Not a melt transaction")),
    };

    let client = MintClient::new(&tx.mint_url);
    
    let mut ys = Vec::new();
    for p in &melt_data.proofs {
        let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
        ys.push(y);
    }

    let states = client.check_state(&ys).await?;
    
    let mut any_spent_or_pending = false;
    for state_str in states.values() {
        if state_str == "SPENT" || state_str == "PENDING" {
            any_spent_or_pending = true;
            break;
        }
    }

    let new_status = if any_spent_or_pending {
        // The proofs are spent! Now we check if the lightning invoice was actually paid.
        let qv_res = client.http.get(format!("{}/v1/melt/quote/bolt11/{}", client.url, melt_data.quote_id)).send().await;
        let mut actually_paid = false;
        
        if let Ok(resp) = qv_res {
            if let Ok(qv) = resp.json::<serde_json::Value>().await {
                if qv["state"].as_str() == Some("PAID") {
                    actually_paid = true;
                }
            }
        }
        
        if actually_paid {
            TransactionStatus::Success
        } else {
            TransactionStatus::FailedMintError // Mint took the proofs but failed to pay invoice!
        }
    } else {
        TransactionStatus::Failed // Unspent, safely failed
    };

    if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
        t.status = new_status.clone();
        
        if new_status == TransactionStatus::Failed {
            state.proofs.entry(t.mint_url.clone()).or_default().extend(melt_data.proofs.clone());
        }
    }

    state.save_encrypted(wallet_path, passphrase)?;
    
    Ok(new_status)
}
