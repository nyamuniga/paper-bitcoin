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

    let (quote_id, outputs, blinding_sessions_hex) = match tx.tx_type {
        TransactionType::Mint(data) => (data.quote_id, data.outputs, data.blinding_sessions_hex),
        TransactionType::ReceiveLightning(data) => (data.quote_id, data.outputs, data.blinding_sessions_hex),
        _ => return Err(anyhow!("Not a mint transaction")),
    };

    let client = MintClient::new(&tx.mint_url);
    let keyset = client.fetch_keyset().await?;
    
    let sigs = client.mint_tokens(&quote_id, outputs.clone()).await?;

    let mut sessions = Vec::new();
    for (secret_hex, out) in blinding_sessions_hex.iter().zip(outputs.iter()) {
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

pub async fn check_transaction_status(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, tx_id: &str) -> Result<TransactionStatus> {
    let tx = state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| anyhow!("Transaction not found"))?.clone();

    if tx.status != TransactionStatus::Pending {
        return Ok(tx.status);
    }

    let client = MintClient::new(&tx.mint_url);

    match &tx.tx_type {
        TransactionType::Melt(melt_data) => {
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
                let qv_res = client.http.get(format!("{}/v1/melt/quote/bolt11/{}", client.url, melt_data.quote_id)).send().await;
                let mut actually_paid = false;
                if let Ok(resp) = qv_res {
                    if let Ok(qv) = resp.json::<serde_json::Value>().await {
                        if qv["state"].as_str() == Some("PAID") {
                            actually_paid = true;
                        }
                    }
                }
                if actually_paid { TransactionStatus::Success } else { TransactionStatus::FailedMintError }
            } else {
                TransactionStatus::Failed
            };

            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = new_status.clone();
                if new_status == TransactionStatus::Failed {
                    state.proofs.entry(t.mint_url.clone()).or_default().extend(melt_data.proofs.clone());
                }
            }
            state.save_encrypted(wallet_path, passphrase)?;
            Ok(new_status)
        },
        TransactionType::Send(send_data) => {
            // Check if inputs are spent
            let mut ys = Vec::new();
            for p in &send_data.proofs {
                let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
                ys.push(y);
            }
            let states = client.check_state(&ys).await.unwrap_or_default();
            let any_spent = states.values().any(|s| s == "SPENT" || s == "PENDING");
            
            let new_status = if any_spent {
                // Remove spent inputs from wallet
                let spent_secrets: std::collections::HashSet<String> = send_data.proofs.iter().map(|p| p.secret.clone()).collect();
                if let Some(mint_proofs) = state.proofs.get_mut(&tx.mint_url) {
                    mint_proofs.retain(|p| !spent_secrets.contains(&p.secret));
                }
                // Restore to recover the change and the tokens
                let _ = crate::restore::restore_from_mints(state, wallet_path, passphrase, vec![tx.mint_url.clone()], None).await;
                TransactionStatus::Failed // We failed to create the token string, but funds are restored safely
            } else {
                TransactionStatus::Failed
            };

            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = new_status.clone();
            }
            state.save_encrypted(wallet_path, passphrase)?;
            Ok(new_status)
        },
        TransactionType::ReceiveEcash(recv_data) => {
            let mut input_proofs = Vec::new();
            if recv_data.token_string.starts_with("cashuA") {
                let token_body = recv_data.token_string.strip_prefix("cashuA").unwrap();
                use base64::Engine;
                let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token_body)
                    .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
                    .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body));
                
                if let Ok(json_bytes) = decoded {
                    if let Ok(token_json) = serde_json::from_slice::<serde_json::Value>(&json_bytes) {
                        if let Some(token_array) = token_json.get("token").and_then(|t| t.as_array()) {
                            if !token_array.is_empty() {
                                if let Some(proofs_json) = token_array[0].get("proofs").and_then(|p| p.as_array()) {
                                    for pj in proofs_json {
                                        if let Some(secret) = pj.get("secret").and_then(|s| s.as_str()) {
                                            input_proofs.push(secret.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            let mut ys = Vec::new();
            for secret in input_proofs {
                let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(secret.as_bytes()));
                ys.push(y);
            }
            
            let states = client.check_state(&ys).await.unwrap_or_default();
            let all_spent = !ys.is_empty() && states.values().all(|s| s == "SPENT" || s == "PENDING");
            
            let new_status = if all_spent {
                let _ = crate::restore::restore_from_mints(state, wallet_path, passphrase, vec![tx.mint_url.clone()], None).await;
                TransactionStatus::Success
            } else {
                TransactionStatus::Failed
            };

            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = new_status.clone();
            }
            state.save_encrypted(wallet_path, passphrase)?;
            Ok(new_status)
        },
        TransactionType::Issue(issue_data) => {
            // Check if ANY of the inputs were spent
            let mut any_spent = false;
            let mut spent_secrets = std::collections::HashSet::new();
            
            for (mint_url, amt) in &issue_data.allocations {
                if let Some(proofs) = state.proofs.get(mint_url) {
                    let mut sorted = proofs.clone();
                    sorted.sort_by_key(|p| p.amount);
                    let mut selected = Vec::new();
                    let mut sum = 0;
                    for p in sorted {
                        if sum >= *amt { break; }
                        sum += p.amount;
                        selected.push(p);
                    }
                    
                    let mut ys = Vec::new();
                    for p in &selected {
                        ys.push(ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes())));
                    }
                    
                    let mc = MintClient::new(mint_url);
                    let states = mc.check_state(&ys).await.unwrap_or_default();
                    if states.values().any(|s| s == "SPENT" || s == "PENDING") {
                        any_spent = true;
                        for p in selected { spent_secrets.insert(p.secret.clone()); }
                    }
                }
            }

            if any_spent {
                // Remove spent inputs
                for (_, proofs) in state.proofs.iter_mut() {
                    proofs.retain(|p| !spent_secrets.contains(&p.secret));
                }
                
                // Restore change to wallet
                let mints: Vec<String> = issue_data.allocations.iter().map(|a| a.0.clone()).collect();
                let _ = crate::restore::restore_from_mints(state, wallet_path, passphrase, mints.clone(), None).await;
                
                // Sweep tokens from the note's seed back into the wallet
                let mut temp_state = state.clone();
                temp_state.seed_hex = issue_data.master_seed_hex.clone();
                temp_state.derivation_index = 0;
                let _ = crate::restore::restore_from_mints(&mut temp_state, wallet_path, passphrase, mints, None).await;
                
                // Merge recovered note proofs into main wallet state
                for (mint, proofs) in temp_state.proofs {
                    state.proofs.entry(mint).or_default().extend(proofs);
                }
            }

            let new_status = TransactionStatus::Failed; // Note issue failed, funds refunded
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = new_status.clone();
            }
            state.save_encrypted(wallet_path, passphrase)?;
            Ok(new_status)
        },
        TransactionType::ReceiveLightning(recv_data) => {
            let qv_res = client.http.get(format!("{}/v1/mint/quote/bolt11/{}", client.url, recv_data.quote_id)).send().await;
            let mut paid = false;
            if let Ok(resp) = qv_res {
                if let Ok(qv) = resp.json::<serde_json::Value>().await {
                    let state_str = qv["state"].as_str().unwrap_or("");
                    if state_str == "PAID" || state_str == "ISSUED" {
                        paid = true;
                    }
                }
            }
            if paid {
                if !recv_data.outputs.is_empty() {
                    if let Ok(sigs) = client.mint_tokens(&recv_data.quote_id, recv_data.outputs.clone()).await {
                        if let Ok(keyset) = client.fetch_keyset().await {
                            let mut new_proofs = Vec::new();
                            for (i, sig_val) in sigs.iter().enumerate() {
                                if let (Some(amt), Some(sig_id), Some(c_str)) = (
                                    sig_val["amount"].as_u64(),
                                    sig_val["id"].as_str(),
                                    sig_val["C_"].as_str()
                                ) {
                                    if let (Ok(c_prime), Ok(mint_pk)) = (
                                        ecash_core::dhke::point_from_hex(c_str),
                                        ecash_core::dhke::point_from_hex(keyset.keys.get(&amt).unwrap_or(&"".to_string()))
                                    ) {
                                        if let Some(sess_hex) = recv_data.blinding_sessions_hex.get(i) {
                                            let sess = ecash_core::dhke::BlindingSession::new(sess_hex);
                                            let proof = sess.unblind(&c_prime, &mint_pk, amt, &sig_id.to_string(), None);
                                            new_proofs.push(proof);
                                        }
                                    }
                                }
                            }
                            state.proofs.entry(tx.mint_url.clone()).or_default().extend(new_proofs);
                        }
                    } else {
                        return Ok(TransactionStatus::Pending);
                    }
                } else {
                    let _ = crate::restore::restore_from_mints(state, wallet_path, passphrase, vec![tx.mint_url.clone()], None).await;
                }
                
                let new_status = TransactionStatus::Success;
                if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    t.status = new_status.clone();
                }
                state.save_encrypted(wallet_path, passphrase)?;
                return Ok(new_status);
            }
            Ok(TransactionStatus::Pending)
        },
        _ => Err(anyhow!("Cannot check status for this transaction type")),
    }
}
