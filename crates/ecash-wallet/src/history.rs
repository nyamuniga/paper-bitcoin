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
        TransactionType::ReceiveOnchain(data) => {
            if let Some(qid) = data.quote_id {
                (qid, data.outputs, data.blinding_sessions_hex)
            } else {
                return Err(anyhow!("Not a mint transaction"));
            }
        }
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

pub enum TransactionDiff {
    NoChange,
    StatusOnly(TransactionStatus),
    MeltFailed(Vec<ecash_core::types::Proof>),
    SendFailedRestore(Vec<String>, std::collections::HashSet<String>), // mint_urls, spent_secrets
    ReceiveEcashSuccessRestore(String), // mint_url
    ReceiveEcashRetrySwap(Vec<ecash_core::types::Proof>),
    IssueFailedSweepAndRestore {
        mints: Vec<String>,
        master_seed_hex: String,
        spent_secrets: std::collections::HashSet<String>,
    },
    ReceiveLightningSuccess(Vec<ecash_core::types::Proof>),
    ReceiveLightningRestore(String), // mint_url
    RedeemSuccessRestore(Vec<String>), // mint_urls
}

pub async fn check_bolt11_mint_quote(
    client: &MintClient,
    quote_id: &str,
    tx_timestamp: u64,
) -> (bool, bool) {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let qv_res = client.http.get(format!("{}/v1/mint/quote/bolt11/{}", client.url, quote_id)).send().await;
    match qv_res {
        Ok(resp) => {
            if resp.status() == reqwest::StatusCode::NOT_FOUND {
                // The mint purged this quote because it expired
                return (false, now_secs.saturating_sub(tx_timestamp) > 900);
            }
            if let Ok(qv) = resp.json::<serde_json::Value>().await {
                let state_str = qv["state"].as_str().unwrap_or("").to_uppercase();
                if state_str == "PAID" || state_str == "ISSUED" {
                    return (true, false);
                }
                if state_str == "EXPIRED" {
                    return (false, true);
                }
                let expiry_secs = qv.get("expiry")
                    .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0);
                if expiry_secs > 0 && now_secs > expiry_secs {
                    return (false, true);
                }
                if now_secs.saturating_sub(tx_timestamp) > 86400 {
                    return (false, true);
                }
                return (false, false);
            }
            (false, now_secs.saturating_sub(tx_timestamp) > 86400)
        }
        Err(e) => {
            tracing::warn!("Failed to query mint quote {}: {}", quote_id, e);
            (false, now_secs.saturating_sub(tx_timestamp) > 86400 * 7)
        }
    }
}

pub async fn check_transaction_network(
    tx: &ecash_core::types::Transaction,
    _trusted_keys: Option<&std::collections::HashMap<u64, String>>
) -> Result<TransactionDiff> {
    if tx.status != TransactionStatus::Pending {
        return Ok(TransactionDiff::NoChange);
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

            if any_spent_or_pending {
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
                    Ok(TransactionDiff::StatusOnly(TransactionStatus::Success))
                } else { 
                    Ok(TransactionDiff::StatusOnly(TransactionStatus::FailedMintError))
                }
            } else {
                Ok(TransactionDiff::MeltFailed(melt_data.proofs.clone()))
            }
        },
        TransactionType::Send(send_data) => {
            let mut ys = Vec::new();
            for p in &send_data.proofs {
                let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
                ys.push(y);
            }
            let states = client.check_state(&ys).await.unwrap_or_default();
            let all_spent = !ys.is_empty() && states.values().all(|s| s == "SPENT");
            
            if all_spent {
                // The recipient has redeemed all proofs: transaction is completed successfully!
                Ok(TransactionDiff::StatusOnly(TransactionStatus::Success))
            } else {
                // Proofs are still unspent or partially pending: keep as Pending
                Ok(TransactionDiff::NoChange)
            }
        },
        TransactionType::ReceiveEcash(recv_data) => {
            let (mint_url, input_proofs, _) = crate::token::decode_token_string(&recv_data.token_string)
                .map_err(|e| anyhow!("Failed to decode token: {}", e))?;
            
            let mut ys = Vec::new();
            for p in &input_proofs {
                let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
                ys.push(y);
            }
            
            let states = client.check_state(&ys).await.unwrap_or_default();
            let all_spent = !ys.is_empty() && states.values().all(|s| s == "SPENT" || s == "PENDING");
            
            if all_spent {
                Ok(TransactionDiff::ReceiveEcashSuccessRestore(mint_url))
            } else if !input_proofs.is_empty() {
                Ok(TransactionDiff::ReceiveEcashRetrySwap(input_proofs))
            } else {
                Ok(TransactionDiff::StatusOnly(TransactionStatus::Failed))
            }
        },
        TransactionType::Issue(_) => {
            return Err(anyhow!("Network check for Issue not supported lock-free yet"));
        },
        TransactionType::ReceiveLightning(recv_data) => {
            let (paid, expired) = check_bolt11_mint_quote(&client, &recv_data.quote_id, tx.timestamp).await;
            if paid {
                if !recv_data.outputs.is_empty() {
                    match client.mint_tokens(&recv_data.quote_id, recv_data.outputs.clone()).await {
                        Ok(sigs) => {
                            let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();

                            // Build sessions list with (amount, secret_hex)
                            let mut sessions: Vec<(u64, String)> = Vec::new();
                            for (out_idx, out_val) in recv_data.outputs.iter().enumerate() {
                                if let Some(amt) = out_val["amount"].as_u64() {
                                    if let Some(sess_hex) = recv_data.blinding_sessions_hex.get(out_idx) {
                                        sessions.push((amt, sess_hex.clone()));
                                    }
                                }
                            }

                            let mut new_proofs = Vec::new();
                            for sig_val in sigs.iter() {
                                if let (Some(amt), Some(sig_id), Some(c_str)) = (
                                    sig_val["amount"].as_u64(),
                                    sig_val["id"].as_str(),
                                    sig_val["C_"].as_str()
                                ) {
                                    let session_pos = sessions.iter().position(|(d, _)| *d == amt);
                                    let sess_hex = if let Some(idx) = session_pos {
                                        let (_, s) = sessions.remove(idx);
                                        s
                                    } else {
                                        continue;
                                    };

                                    let keyset = if let Some(ks) = keyset_cache.get(sig_id) {
                                        ks.clone()
                                    } else {
                                        match client.fetch_keyset_by_id(sig_id).await {
                                            Ok(ks) => {
                                                keyset_cache.insert(sig_id.to_string(), ks.clone());
                                                ks
                                            }
                                            Err(e) => {
                                                tracing::warn!("Failed to fetch keyset {}: {}", sig_id, e);
                                                continue;
                                            }
                                        }
                                    };

                                    if let Some(mint_pk_str) = keyset.keys.get(&amt) {
                                        if let (Ok(c_prime), Ok(mint_pk)) = (
                                            ecash_core::dhke::point_from_hex(c_str),
                                            ecash_core::dhke::point_from_hex(mint_pk_str)
                                        ) {
                                            let dleq = parse_dleq(sig_val);
                                            let sess = ecash_core::dhke::BlindingSession::new(&sess_hex);
                                            let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                            proof.derivation_index = 0;
                                            new_proofs.push(proof);
                                        }
                                    }
                                }
                            }
                            return Ok(TransactionDiff::ReceiveLightningSuccess(new_proofs));
                        }
                        Err(e) => {
                            let err_str = e.to_string();
                            if err_str.to_lowercase().contains("already signed") || err_str.to_lowercase().contains("already issued") {
                                if let Ok((out_arr, sig_arr)) = client.restore_tokens(recv_data.outputs.clone()).await {
                                    if !sig_arr.is_empty() {
                                        let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
                                        let mut sessions: Vec<(u64, String)> = Vec::new();
                                        for (out_idx, out_val) in recv_data.outputs.iter().enumerate() {
                                            if let Some(amt) = out_val["amount"].as_u64() {
                                                if let Some(sess_hex) = recv_data.blinding_sessions_hex.get(out_idx) {
                                                    sessions.push((amt, sess_hex.clone()));
                                                }
                                            }
                                        }

                                        let mut new_proofs = Vec::new();
                                        for (_out_val, sig_val) in out_arr.iter().zip(sig_arr.iter()) {
                                            if let (Some(amt), Some(sig_id), Some(c_str)) = (
                                                sig_val.get("amount").and_then(|a| a.as_u64()),
                                                sig_val.get("id").and_then(|i| i.as_str()),
                                                sig_val.get("C_").and_then(|c| c.as_str()),
                                            ) {
                                                let session_pos = sessions.iter().position(|(d, _)| *d == amt);
                                                let sess_hex = if let Some(idx) = session_pos {
                                                    let (_, s) = sessions.remove(idx);
                                                    s
                                                } else {
                                                    continue;
                                                };

                                                let keyset = if let Some(ks) = keyset_cache.get(sig_id) {
                                                    ks.clone()
                                                } else {
                                                    match client.fetch_keyset_by_id(sig_id).await {
                                                        Ok(ks) => {
                                                            keyset_cache.insert(sig_id.to_string(), ks.clone());
                                                            ks
                                                        }
                                                        Err(_) => continue,
                                                    }
                                                };

                                                if let Some(mint_pk_str) = keyset.keys.get(&amt) {
                                                    if let (Ok(c_prime), Ok(mint_pk)) = (
                                                        ecash_core::dhke::point_from_hex(c_str),
                                                        ecash_core::dhke::point_from_hex(mint_pk_str)
                                                    ) {
                                                        let dleq = parse_dleq(sig_val);
                                                        let sess = ecash_core::dhke::BlindingSession::new(&sess_hex);
                                                        let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                                        proof.derivation_index = 0;
                                                        new_proofs.push(proof);
                                                    }
                                                }
                                            }
                                        }

                                        if !new_proofs.is_empty() {
                                            return Ok(TransactionDiff::ReceiveLightningSuccess(new_proofs));
                                        }
                                    }
                                }
                                return Ok(TransactionDiff::ReceiveLightningRestore(tx.mint_url.clone()));
                            }
                            return Err(anyhow::anyhow!("Mint tokens failed: {}", err_str));
                        }
                    }
                } else {
                    return Ok(TransactionDiff::ReceiveLightningRestore(tx.mint_url.clone()));
                }
            }

            if expired {
                return Ok(TransactionDiff::StatusOnly(TransactionStatus::Failed));
            }

            Ok(TransactionDiff::NoChange)
        },
        TransactionType::SendOnchain(_) => {
            Ok(TransactionDiff::NoChange)
        },
        TransactionType::ReceiveOnchain(recv_data) => {
            if let Some(quote_id) = &recv_data.quote_id {
                let (paid, expired) = check_bolt11_mint_quote(&client, quote_id, tx.timestamp).await;
                if paid && !recv_data.outputs.is_empty() {
                    match client.mint_tokens(quote_id, recv_data.outputs.clone()).await {
                        Ok(sigs) => {
                            let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
                            let mut sessions: Vec<(u64, String)> = Vec::new();
                            for (out_idx, out_val) in recv_data.outputs.iter().enumerate() {
                                if let Some(amt) = out_val["amount"].as_u64() {
                                    if let Some(sess_hex) = recv_data.blinding_sessions_hex.get(out_idx) {
                                        sessions.push((amt, sess_hex.clone()));
                                    }
                                }
                            }

                            let mut new_proofs = Vec::new();
                            for sig_val in sigs.iter() {
                                if let (Some(amt), Some(sig_id), Some(c_str)) = (
                                    sig_val["amount"].as_u64(),
                                    sig_val["id"].as_str(),
                                    sig_val["C_"].as_str()
                                ) {
                                    let session_pos = sessions.iter().position(|(d, _)| *d == amt);
                                    let sess_hex = if let Some(idx) = session_pos {
                                        let (_, s) = sessions.remove(idx);
                                        s
                                    } else {
                                        continue;
                                    };

                                    let keyset = if let Some(ks) = keyset_cache.get(sig_id) {
                                        ks.clone()
                                    } else {
                                        match client.fetch_keyset_by_id(sig_id).await {
                                            Ok(ks) => {
                                                keyset_cache.insert(sig_id.to_string(), ks.clone());
                                                ks
                                            }
                                            Err(e) => {
                                                tracing::warn!("Failed to fetch keyset {}: {}", sig_id, e);
                                                continue;
                                            }
                                        }
                                    };

                                    if let Some(mint_pk_str) = keyset.keys.get(&amt) {
                                        if let (Ok(c_prime), Ok(mint_pk)) = (
                                            ecash_core::dhke::point_from_hex(c_str),
                                            ecash_core::dhke::point_from_hex(mint_pk_str)
                                        ) {
                                            let dleq = parse_dleq(sig_val);
                                            let sess = ecash_core::dhke::BlindingSession::new(&sess_hex);
                                            let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                            proof.derivation_index = 0;
                                            new_proofs.push(proof);
                                        }
                                    }
                                }
                            }
                            return Ok(TransactionDiff::ReceiveLightningSuccess(new_proofs));
                        }
                        Err(_) => {}
                    }
                }
                if expired {
                    return Ok(TransactionDiff::StatusOnly(TransactionStatus::Failed));
                }
            }
            Ok(TransactionDiff::NoChange)
        },
        TransactionType::Redeem(redeem_data) => {
            let mut mint_urls: Vec<String> = redeem_data
                .public_data
                .entries
                .iter()
                .map(|e| e.mint.clone())
                .collect();
            mint_urls.sort();
            mint_urls.dedup();

            match ecash_verifier::OfflineVerifier::check_spend_state(&redeem_data.public_data).await {
                Ok(ecash_verifier::SpentStatus::Spent) => {
                    let is_direct = redeem_data.external_invoice.is_empty() 
                        || redeem_data.external_invoice == "Direct Wallet Redeem";
                    if is_direct {
                        Ok(TransactionDiff::RedeemSuccessRestore(mint_urls))
                    } else {
                        Ok(TransactionDiff::StatusOnly(TransactionStatus::Success))
                    }
                }
                Ok(ecash_verifier::SpentStatus::PartiallySpent) => {
                    let is_direct = redeem_data.external_invoice.is_empty() 
                        || redeem_data.external_invoice == "Direct Wallet Redeem";
                    if is_direct {
                        Ok(TransactionDiff::RedeemSuccessRestore(mint_urls))
                    } else {
                        Ok(TransactionDiff::StatusOnly(TransactionStatus::Success))
                    }
                }
                Ok(ecash_verifier::SpentStatus::Unspent) => {
                    Ok(TransactionDiff::StatusOnly(TransactionStatus::Failed))
                }
                Err(e) => {
                    tracing::warn!("Could not check spend state of redeemed note: {}", e);
                    Ok(TransactionDiff::NoChange)
                }
            }
        },
        TransactionType::Mint(mint_data) => {
            let (paid, expired) = check_bolt11_mint_quote(&client, &mint_data.quote_id, tx.timestamp).await;
            if paid {
                return Ok(TransactionDiff::StatusOnly(TransactionStatus::Success));
            }
            if expired {
                return Ok(TransactionDiff::StatusOnly(TransactionStatus::Failed));
            }
            Ok(TransactionDiff::NoChange)
        },
    }
}

pub async fn apply_transaction_diff(
    state: &mut WalletState, 
    wallet_path: &PathBuf, 
    passphrase: &str, 
    tx_id: &str, 
    diff: TransactionDiff
) -> Result<TransactionStatus> {
    let (tx_mint, tx_amount) = {
        let t = state.transactions.iter().find(|t| t.id == tx_id).ok_or_else(|| anyhow!("Transaction not found"))?;
        (t.mint_url.clone(), t.amount)
    };

    let new_status = match diff {
        TransactionDiff::NoChange => {
            return Ok(TransactionStatus::Pending);
        },
        TransactionDiff::StatusOnly(s) => {
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = s.clone();
            }
            s
        },
        TransactionDiff::MeltFailed(proofs) => {
            state.proofs.entry(tx_mint.clone()).or_default().extend(proofs);
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = TransactionStatus::Failed;
            }
            TransactionStatus::Failed
        },
        TransactionDiff::SendFailedRestore(mints, spent_secrets) => {
            if let Some(mint_proofs) = state.proofs.get_mut(&tx_mint) {
                mint_proofs.retain(|p| !spent_secrets.contains(&p.secret));
            }
            let start_idx = state.derivation_index.saturating_sub(30);
            let end_idx = state.derivation_index + 10;
            let _ = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, mints, start_idx, end_idx, None).await;
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = TransactionStatus::Failed;
            }
            TransactionStatus::Failed
        },
        TransactionDiff::ReceiveEcashRetrySwap(input_proofs) => {
            let desired_amounts = ecash_core::types::split_into_powers_of_2(tx_amount);
            let swap_res = crate::swap::swap_proofs(
                state,
                wallet_path,
                passphrase,
                &tx_mint,
                input_proofs,
                desired_amounts,
                vec![],
                None,
            ).await;

            match swap_res {
                Ok(new_proofs) => {
                    state.proofs.entry(tx_mint.clone()).or_default().extend(new_proofs);
                    if !state.mints.contains(&tx_mint) {
                        state.mints.push(tx_mint.clone());
                    }
                    if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                        t.status = TransactionStatus::Success;
                    }
                    TransactionStatus::Success
                }
                Err(e) => {
                    tracing::error!("[check_status] ReceiveEcash retry swap failed: {}", e);
                    let err_str = e.to_string().to_lowercase();
                    if err_str.contains("already spent") || err_str.contains("token already spent") {
                        let start_idx = state.derivation_index.saturating_sub(30);
                        let end_idx = state.derivation_index + 10;
                        let total_restored = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, vec![tx_mint.clone()], start_idx, end_idx, None).await.unwrap_or(0);
                        if total_restored > 0 {
                            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                                t.status = TransactionStatus::Success;
                            }
                            TransactionStatus::Success
                        } else {
                            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                                t.status = TransactionStatus::Failed;
                            }
                            TransactionStatus::Failed
                        }
                    } else {
                        // Keep pending so user can retry again
                        TransactionStatus::Pending
                    }
                }
            }
        },
        TransactionDiff::ReceiveEcashSuccessRestore(mint_url) => {
            let start_idx = state.derivation_index.saturating_sub(30);
            let end_idx = state.derivation_index + 10;
            let total_restored = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, vec![mint_url], start_idx, end_idx, None).await.unwrap_or(0);
            if total_restored > 0 {
                if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    t.status = TransactionStatus::Success;
                }
                TransactionStatus::Success
            } else {
                if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    t.status = TransactionStatus::Failed;
                }
                TransactionStatus::Failed
            }
        },
        TransactionDiff::ReceiveLightningSuccess(new_proofs) => {
            state.proofs.entry(tx_mint.clone()).or_default().extend(new_proofs);
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = TransactionStatus::Success;
            }
            TransactionStatus::Success
        },
        TransactionDiff::ReceiveLightningRestore(mint_url) => {
            let start_idx = state.derivation_index.saturating_sub(30);
            let end_idx = state.derivation_index + 10;
            let _ = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, vec![mint_url], start_idx, end_idx, None).await;
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = TransactionStatus::Success;
            }
            TransactionStatus::Success
        },
        TransactionDiff::IssueFailedSweepAndRestore { .. } => {
            // Not implemented in diff path
            TransactionStatus::Failed
        },
        TransactionDiff::RedeemSuccessRestore(mints) => {
            let start_idx = state.derivation_index.saturating_sub(30);
            let end_idx = state.derivation_index + 10;
            let _ = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, mints, start_idx, end_idx, None).await;
            if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                t.status = TransactionStatus::Success;
            }
            TransactionStatus::Success
        }
    };

    state.save_encrypted(wallet_path, passphrase)?;
    Ok(new_status)
}

pub async fn check_transaction_status_legacy(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, tx_id: &str) -> Result<TransactionStatus> {
    // This is kept for Issue transactions which need full state access during network I/O
    let tx = state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| anyhow!("Transaction not found"))?.clone();

    if tx.status != TransactionStatus::Pending {
        return Ok(tx.status);
    }

    if let TransactionType::Issue(issue_data) = &tx.tx_type {
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
            for (_, proofs) in state.proofs.iter_mut() {
                proofs.retain(|p| !spent_secrets.contains(&p.secret));
            }
            
            let mints: Vec<String> = issue_data.allocations.iter().map(|a| a.0.clone()).collect();
            let start_idx = state.derivation_index.saturating_sub(30);
            let end_idx = state.derivation_index + 10;
            let _ = crate::restore::restore_from_mints_range(state, wallet_path, passphrase, mints.clone(), start_idx, end_idx, None).await;
            
            let mut temp_state = state.clone();
            temp_state.seed_hex = issue_data.master_seed_hex.clone();
            temp_state.derivation_index = 0;
            let _ = crate::restore::restore_from_mints_range(&mut temp_state, wallet_path, passphrase, mints, 0, 50, None).await;
            
            for (mint, proofs) in temp_state.proofs {
                state.proofs.entry(mint).or_default().extend(proofs);
            }
        }

        let new_status = TransactionStatus::Failed;
        if let Some(t) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
            t.status = new_status.clone();
        }
        state.save_encrypted(wallet_path, passphrase)?;
        return Ok(new_status);
    }

    let trusted_keys = state.trusted_keys.get(&tx.mint_url).cloned();
    let diff = check_transaction_network(&tx, trusted_keys.as_ref()).await?;
    apply_transaction_diff(state, wallet_path, passphrase, tx_id, diff).await
}

pub use check_transaction_status_legacy as check_transaction_status;

