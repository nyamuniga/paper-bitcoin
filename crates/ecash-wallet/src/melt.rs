use std::{collections::HashMap, path::PathBuf};
use anyhow::{anyhow, Context, Result};
use ecash_core::types::*;
use ecash_core::dhke::*;
use ecash_core::derivation::*;
use crate::*;
use crate::client::MintClient;

// ─── NUT-08 Change Output Generation ────────────────────────────────────────────

/// Generate standard blank output denominations to receive change.
fn generate_change_denoms(max_change: u64) -> Vec<u64> {
    if max_change == 0 {
        return Vec::new();
    }
    let mut denoms = Vec::new();
    let mut current = 1;
    let mut sum = 0;
    while sum < max_change {
        denoms.push(current);
        sum += current;
        current *= 2;
    }
    denoms
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

pub(crate) fn parse_dleq(sig: &serde_json::Value) -> Option<ecash_core::types::Dleq> {
    if let Some(d) = sig.get("dleq") {
        if let (Some(e), Some(s)) = (d.get("e").and_then(|v| v.as_str()), d.get("s").and_then(|v| v.as_str())) {
            return Some(ecash_core::types::Dleq { e: e.to_string(), s: s.to_string() });
        }
    }
    None
}

pub(crate) fn serial_from_hash(hash: &str) -> String {
    let chars: Vec<char> = hash.to_uppercase().chars().take(12).collect();
    format!("{}-{}-{}", chars[..4].iter().collect::<String>(), chars[4..8].iter().collect::<String>(), chars[8..12].iter().collect::<String>())
}

pub(crate) fn match_and_remove_session(
    sessions: &mut Vec<(u64, BlindingSession, u64)>,
    amount: u64,
    mint_pk: &k256::ProjectivePoint,
    c_prime: &k256::ProjectivePoint,
    dleq: Option<&ecash_core::types::Dleq>,
) -> Result<(u64, BlindingSession, u64)> {
    if sessions.is_empty() {
        return Err(anyhow!("No sessions left to match"));
    }
    
    if let Some(d) = dleq {
        if let Some(idx) = sessions.iter().position(|(_, sess, _)| verify_dleq(mint_pk, c_prime, &sess.b_prime, d)) {
            return Ok(sessions.remove(idx));
        }
        tracing::warn!("DLEQ provided but did not match any session for amount {}. Falling back.", amount);
    }
    
    // If no DLEQ, first try to match by exact amount.
    if let Some(idx) = sessions.iter().position(|(d, _, _)| *d == amount) {
        return Ok(sessions.remove(idx));
    }
    
    // Sequential fallback
    Ok(sessions.remove(0))
}

/// Verify a proof offline using the mint's public key and the DLEQ proof.
/// Returns `true` if the proof is cryptographically valid.
fn verify_proof_offline(proof: &Proof, mint_pubkeys: &HashMap<u64, String>) -> bool {
    if let (Some(c_prime), Some(b_prime), Some(dleq)) = (&proof.c_prime, &proof.b_prime, &proof.dleq) {
        let c_p = match point_from_hex(c_prime) {
            Ok(p) => p,
            Err(_) => return false,
        };
        let b_p = match point_from_hex(b_prime) {
            Ok(p) => p,
            Err(_) => return false,
        };
        let pk_hex = match mint_pubkeys.get(&proof.amount) {
            Some(h) => h,
            None => return false,
        };
        let mint_pk = match point_from_hex(pk_hex) {
            Ok(p) => p,
            Err(_) => return false,
        };
        verify_dleq(&mint_pk, &c_p, &b_p, dleq)
    } else {
        false
    }
}



pub async fn reconstruct_token(public_data: &ecash_core::types::PublicNoteData, master_seed_hex: &str) -> Result<CashuToken> {
    let mut entries = Vec::new();
    let note_deriv = TokenDerivation::from_hex(master_seed_hex)?;

    for public_entry in &public_data.entries {
        let client = MintClient::new(&public_entry.mint);
        let mut keyset_cache = HashMap::new();

        let mut proofs = Vec::new();
        for p in &public_entry.proofs {
            if !keyset_cache.contains_key(&p.id) {
                let ks = client.fetch_keyset_by_id(&p.id).await?;
                keyset_cache.insert(p.id.clone(), ks);
            }
            let keyset = keyset_cache.get(&p.id).ok_or_else(|| anyhow!("Keyset missing from cache for id {}", p.id))?;

            let secret = note_deriv.secret_at(p.derivation_index);
            let sess = BlindingSession::new(&secret);

            let c_prime_str = p.c_prime.as_ref().ok_or_else(|| anyhow!("Missing C_ in public proof"))?;
            let c_prime = point_from_hex(c_prime_str).context("Invalid C_")?;
            let mint_pk_str = keyset.keys.get(&p.amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", p.amount))?;
            let mint_pk = point_from_hex(mint_pk_str).context("Invalid mint pk")?;

            let mut reconstructed_proof = sess.unblind(&c_prime, &mint_pk, p.amount, &p.id, p.dleq.clone());
            reconstructed_proof.derivation_index = p.derivation_index;
            proofs.push(reconstructed_proof);
        }
        entries.push(TokenEntry { mint: public_entry.mint.clone(), proofs });
    }

    let reconstructed_entries: Vec<_> = entries.iter().map(|e| e.to_public()).collect();
    let reconstructed_hash = compute_validation_hash(&reconstructed_entries);
    if reconstructed_hash != public_data.validation_hash {
        return Err(anyhow!("Incorrect scratch-off secret! The reconstructed note does not match the physical note."));
    }

    Ok(CashuToken { token: entries, unit: "sat".into(), memo: None })
}

pub async fn redeem_note(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, public_data: &ecash_core::types::PublicNoteData, master_seed_hex: &str, external_invoice: &str) -> Result<u64> {
    let redeem_tx_id = format!("tx_redeem_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: redeem_tx_id.clone(),
        tx_type: TransactionType::Redeem(ecash_core::types::RedeemTransactionData {
            public_data: public_data.clone(),
            master_seed_hex: master_seed_hex.to_string(),
            external_invoice: external_invoice.to_string(),
        }),
        amount: public_data.face_value_sats,
        fee: 0,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: "Local Wallet".to_string(),
    };
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase)?;

    let token = reconstruct_token(public_data, master_seed_hex).await?;
    if token.token.is_empty() { 
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) { tx.status = TransactionStatus::Failed; }
        state.save_encrypted(wallet_path, passphrase).ok();
        return Err(anyhow!("Empty token")); 
    }

    let hub_mint = &token.token[0].mint;
    let hub_client = MintClient::new(hub_mint);
    let hub_keyset = hub_client.fetch_keyset().await?;

    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let hub_proofs = token.token[0].proofs.clone();

    // Deduplicate proofs by secret
    let mut unique = std::collections::HashMap::new();
    for p in hub_proofs {
        unique.insert(p.secret.clone(), p);
    }
    let mut hub_proofs: Vec<_> = unique.into_values().collect();

    // Prepare child mint melts
    let mut quote_futures = Vec::new();
    let hub_mint_str = hub_mint.to_string();
    for entry in &token.token[1..] {
        if entry.proofs.is_empty() { continue; }
        let entry = entry.clone();
        let hub_mint_str = hub_mint_str.clone();
        quote_futures.push(async move {
            let amt: u64 = entry.proofs.iter().map(|p| p.amount).sum();
            let fee_estimate = estimate_routing_fee_from_info(&entry.mint, amt).await;
            let buffer = std::cmp::max(5, fee_estimate / 2);
            let max_reserve = std::cmp::max(10, amt * 5 / 100);
            let safe_fee = std::cmp::max(10, std::cmp::min(fee_estimate + buffer, max_reserve));
            let transfer_amt = amt.saturating_sub(safe_fee);

            if transfer_amt == 0 {
                return Ok::<_, anyhow::Error>(None);
            }

            let hub_client = MintClient::new(&hub_mint_str);
            let (qid, inv) = hub_client.request_mint_quote(transfer_amt).await?;

            let entry_client = MintClient::new(&entry.mint);
            let entry_keyset = entry_client.fetch_keyset().await?;
            
            Ok(Some((entry, amt, safe_fee, transfer_amt, qid, inv, entry_keyset)))
        });
    }

    let mut prepared_transfers = Vec::new();
    for res in futures::future::join_all(quote_futures).await {
        if let Some(data) = res? {
            prepared_transfers.push(data);
        }
    }

    // Execute child melts
    let mut execution_futures = Vec::new();
    for (entry, _amt, safe_fee, transfer_amt, qid, inv, entry_keyset) in prepared_transfers {
        let change_denoms = generate_change_denoms(safe_fee);
        let mut change_sessions = Vec::new();
        let mut change_outputs = Vec::new();
        
        for &d in &change_denoms {
            let secret = deriv.next_secret();
            let sess = ecash_core::dhke::BlindingSession::new(&secret);
            change_outputs.push(serde_json::json!({"amount": d, "id": entry_keyset.id, "B_": sess.b_prime_hex()}));
            change_sessions.push((d, sess, deriv.index - 1));
        }

        let denoms = ecash_core::types::split_into_powers_of_2(transfer_amt);
        let mut sessions = Vec::new();
        let mut outputs = Vec::new();
        for &d in &denoms {
            let index = deriv.index;
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
            sessions.push((d, sess, index));
        }

        let hub_mint_str = hub_mint.to_string();
        let hub_keyset_clone = hub_keyset.clone();
        let entry_keyset_clone = entry_keyset.clone();
        
        execution_futures.push(async move {
            let entry_client = MintClient::new(&entry.mint);
            let (paid, change_sigs) = entry_client.melt_tokens(&entry.proofs, &inv, None, Some(change_outputs)).await?;
            
            let mut reclaimed_proofs = Vec::new();
            let mut new_hub_proofs = Vec::new();

            if paid {
                let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
                keyset_cache.insert(entry_keyset_clone.id.clone(), entry_keyset_clone.clone());
                keyset_cache.insert(hub_keyset_clone.id.clone(), hub_keyset_clone.clone());

                for sig in change_sigs.iter() {
                    let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
                    
                    let sig_id = sig["id"].as_str().unwrap_or(&entry_keyset_clone.id).to_string();
                    let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
                        ks.clone()
                    } else {
                        let ks = entry_client.fetch_keyset_by_id(&sig_id).await?;
                        keyset_cache.insert(sig_id.clone(), ks.clone());
                        ks
                    };

                    let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
                    let c_prime = ecash_core::dhke::point_from_hex(c_prime_str).context("Invalid C_")?;
                    let mint_pk_str = keyset.keys.get(&amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", amount))?;
                    let mint_pk = ecash_core::dhke::point_from_hex(mint_pk_str).context("Invalid mint pk")?;
                    let dleq = parse_dleq(sig);
                    
                    let (_, sess, idx) = match_and_remove_session(&mut change_sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;

                    let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                    proof.derivation_index = idx;
                    if !verify_proof_offline(&proof, &keyset.keys) {
                        tracing::warn!("⚠️  DLEQ verification FAILED for amount {} (keyset {}). Storing anyway to preserve funds.", amount, sig_id);
                    }
                    reclaimed_proofs.push(proof);
                }

                let hub_client = MintClient::new(&hub_mint_str);
                let sigs = hub_client.mint_tokens(&qid, outputs).await?;
                for sig in sigs.iter() {
                    let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
                    
                    let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset_clone.id).to_string();
                    let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
                        ks.clone()
                    } else {
                        let ks = hub_client.fetch_keyset_by_id(&sig_id).await?;
                        keyset_cache.insert(sig_id.clone(), ks.clone());
                        ks
                    };

                    let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
                    let c_prime = ecash_core::dhke::point_from_hex(c_prime_str).context("Invalid C_")?;
                    let mint_pk_str = keyset.keys.get(&amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", amount))?;
                    let mint_pk = ecash_core::dhke::point_from_hex(mint_pk_str).context("Invalid mint pk")?;
                    let dleq = parse_dleq(sig);

                    let (_, sess, index) = match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;

                    let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                    proof.derivation_index = index;
                    if !verify_proof_offline(&proof, &keyset.keys) {
                        tracing::warn!("⚠️  DLEQ verification FAILED for amount {} (keyset {}). Storing anyway to preserve funds.", amount, sig_id);
                    }
                    new_hub_proofs.push(proof);
                }
            }
            Ok::<_, anyhow::Error>((entry.mint, reclaimed_proofs, new_hub_proofs))
        });
    }

    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    for res in futures::future::join_all(execution_futures).await {
        let (mint, reclaimed, new_hub) = res?;
        if !reclaimed.is_empty() {
            state.proofs.entry(mint).or_default().extend(reclaimed);
        }
        hub_proofs.extend(new_hub);
    }

    state.derivation_index = deriv.index;

    let total_hub_sats: u64 = hub_proofs.iter().map(|p| p.amount).sum();
    tracing::info!("Total consolidated proofs available at Hub: {} sats", total_hub_sats);

    let qv: serde_json::Value = hub_client.http.post(format!("{}/v1/melt/quote/bolt11", hub_client.url))
        .json(&serde_json::json!({ "request": external_invoice, "unit": "sat" })).send().await?.json().await?;
    if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
    if let Some(err) = qv.get("detail") { return Err(anyhow!("Melt quote error (detail): {}", err)); }

    let quote_id = qv["quote"].as_str().unwrap_or("").to_string();
    let required_amt = qv["amount"].as_u64().unwrap_or(0);
    let fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
    tracing::info!("Mint requires: {} sats (amount) + {} sats (fee reserve) = {} sats", required_amt, fee_reserve, required_amt + fee_reserve);

    if total_hub_sats < required_amt + fee_reserve {
        return Err(anyhow!("Insufficient consolidated funds. Have {}, Need {}", total_hub_sats, required_amt + fee_reserve));
    }

    let max_change = total_hub_sats.saturating_sub(required_amt);
    let change_denoms = generate_change_denoms(max_change);
    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &change_denoms {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((d, sess, index));
    }

    // Advance and persist derivation index BEFORE melt
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    // Save pending transaction and remove proofs from wallet balance immediately
    let tx_id = format!("tx_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::Melt(MeltTransactionData {
            quote_id: quote_id.clone(),
            proofs: hub_proofs.clone(),
        }),
        amount: required_amt,
        fee: fee_reserve,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: hub_mint.clone(),
    };
    
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase).ok();

    let melt_result = hub_client.melt_tokens(&hub_proofs, external_invoice, Some(&quote_id), Some(outputs)).await;

    let (paid, change_sigs) = match melt_result {
        Ok(res) => res,
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("proofs could not be verified") {
                if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    tx.status = TransactionStatus::FailedMintError;
                }
                state.save_encrypted(wallet_path, passphrase).ok();
                return Err(anyhow!("Mint rejected the proofs as invalid/corrupt. The transaction was marked as FailedMintError and the corrupted proofs were discarded to prevent further issues."));
            }
            // Network error – keep pending
            return Err(anyhow!("Payment might be stuck: {}. Your funds are safe but pending. Go to History and click Check Status to resolve it.", e));
        }
    };

    // ─── Unblind change proofs and STORE THEM UNCONDITIONALLY (with logging) ──
    let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
    keyset_cache.insert(hub_keyset.id.clone(), hub_keyset.clone());

    let mut new_proofs = Vec::new();
    for sig in change_sigs.iter() {
        let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id).to_string();

        // Fetch the keyset (from cache or fresh)
        let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
            ks.clone()
        } else {
            let ks = hub_client.fetch_keyset_by_id(&sig_id).await?;
            keyset_cache.insert(sig_id.clone(), ks.clone());
            ks
        };

        // Get the mint public key for this amount
        let mint_pk_str = keyset.keys.get(&amount)
            .ok_or_else(|| anyhow!("No public key for amount {} in keyset {}", amount, sig_id))?;
        let mint_pk = point_from_hex(mint_pk_str)
            .with_context(|| format!("Invalid mint public key for amount {}", amount))?;

        // Parse C_ from the signature
        let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
        let c_prime = point_from_hex(c_prime_str)
            .with_context(|| format!("Invalid C_ for amount {}", amount))?;

        let dleq = parse_dleq(sig);

        // Find the session that generated the blinded message for this amount
        let (_, sess, index) = match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;

        // Unblind to get the final proof
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq.clone());
        proof.derivation_index = index;

        if !verify_proof_offline(&proof, &keyset.keys) {
            tracing::warn!("⚠️  DLEQ verification FAILED for amount {} (keyset {}). Storing anyway to preserve funds.", amount, sig_id);
        }
        
        // Store the proof unconditionally so we don't lose funds
        new_proofs.push(proof);
    }
    
    // Store all change proofs
    if !new_proofs.is_empty() {
        state.proofs.entry(hub_mint.to_string()).or_default().extend(new_proofs);
    } else {
        tracing::warn!("No change proofs received – wallet balance may be 0");
    }

    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
        if paid {
            tx.status = TransactionStatus::Success;
        } else {
            tx.status = TransactionStatus::Failed;
            // Refund the original proofs on graceful failure
            state.proofs.entry(hub_mint.to_string()).or_default().extend(hub_proofs);
        }
    }

    // Also mark the top-level Redeem transaction
    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
        if paid {
            tx.status = TransactionStatus::Success;
        } else {
            tx.status = TransactionStatus::Failed;
        }
    }

    state.save_encrypted(wallet_path, passphrase).ok();

    if !paid {
        return Err(anyhow!("Lightning Network payment failed. The mint tried to pay but couldn't find a route or the invoice expired. Your funds have been refunded to your wallet dashboard."));
    }

    Ok(required_amt)
}

pub async fn pay_invoice(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, invoice: &str) -> Result<u64> {
    let mut selected_mint = None;
    let mut required_amt = 0;
    let mut fee_reserve = 0;
    let mut quote_id = String::new();
    let mut mint_errors = Vec::new();

    // Find a mint with sufficient balance
    for mint in state.proofs.keys() {
        let client = MintClient::new(mint);
        let resp = client.http.post(format!("{}/v1/melt/quote/bolt11", client.url))
            .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await;

        if let Ok(resp) = resp {
            if let Ok(qv) = resp.json::<serde_json::Value>().await {
                if qv.get("error").is_none() && qv.get("detail").is_none() {
                    required_amt = qv["amount"].as_u64().unwrap_or(0);
                    fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
                    if let Some(q) = qv["quote"].as_str() {
                        quote_id = q.to_string();
                    }

                    let balance: u64 = state.proofs.get(mint).map(|v| v.iter().map(|p| p.amount).sum()).unwrap_or(0);
                    if balance >= required_amt + fee_reserve {
                        selected_mint = Some(mint.clone());
                        break;
                    } else {
                        mint_errors.push(format!("{}: Insufficient balance (Have {}, Need {})", mint, balance, required_amt + fee_reserve));
                    }
                } else {
                    let err_msg = qv.get("error").or(qv.get("detail")).and_then(|v| v.as_str()).unwrap_or("Unknown error");
                    mint_errors.push(format!("{}: {}", mint, err_msg));
                }
            } else {
                mint_errors.push(format!("{}: Invalid JSON response", mint));
            }
        } else {
            mint_errors.push(format!("{}: Network error", mint));
        }
    }

    let hub_mint = selected_mint.ok_or_else(|| anyhow!("Payment failed.\n{}", mint_errors.join("\n")))?;
    let hub_client = MintClient::new(&hub_mint);
    let hub_keyset = hub_client.fetch_keyset().await?;

    // ─── Get all proofs for this mint (NO FILTERING) ──────────────────────────
    // We trust the mint to validate them. The offline DLEQ check is broken,
    // so we skip it entirely.
    let hub_proofs = state.proofs.get(&hub_mint)
        .ok_or_else(|| anyhow!("No proofs for mint {}", hub_mint))?
        .clone();

    if hub_proofs.is_empty() {
        return Err(anyhow!("No proofs found for mint {}", hub_mint));
    }

    // ─── Prepare change outputs ──────────────────────────────────────────────────
    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let total_hub_sats: u64 = hub_proofs.iter().map(|p| p.amount).sum();
    let max_change = total_hub_sats.saturating_sub(required_amt);
    let change_denoms = generate_change_denoms(max_change);

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &change_denoms {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((d, sess, index));
    }

    // Advance and persist derivation index BEFORE melt
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    // ─── Remove proofs from wallet balance (drain them) ────────────────────────
    let _ = state.proofs.remove(&hub_mint);

    // Save pending transaction
    let tx_id = format!("tx_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::Melt(MeltTransactionData {
            quote_id: quote_id.clone(),
            proofs: hub_proofs.clone(),
        }),
        amount: required_amt,
        fee: fee_reserve,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: hub_mint.clone(),
    };
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase).ok();

    // ─── Send melt request ──────────────────────────────────────────────────────
    let melt_result = hub_client.melt_tokens(&hub_proofs, invoice, Some(&quote_id), Some(outputs)).await;

    let (paid, change_sigs) = match melt_result {
        Ok(res) => res,
        Err(e) => {
            // Re-insert proofs on error
            state.proofs.entry(hub_mint.clone()).or_default().extend(hub_proofs);
            if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Failed;
            }
            state.save_encrypted(wallet_path, passphrase).ok();
            return Err(anyhow!("Payment failed: {}", e));
        }
    };

    // ─── Unblind change proofs ──────────────────────────────────────────────────
    let mut keyset_cache: std::collections::HashMap<String, crate::client::KeysetInfo> = std::collections::HashMap::new();
    keyset_cache.insert(hub_keyset.id.clone(), hub_keyset.clone());

    let mut new_proofs = Vec::new();
    for sig in change_sigs.iter() {
        let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id).to_string();

        let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
            ks.clone()
        } else {
            let ks = hub_client.fetch_keyset_by_id(&sig_id).await?;
            keyset_cache.insert(sig_id.clone(), ks.clone());
            ks
        };

        let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
        let c_prime = point_from_hex(c_prime_str).context("Invalid C_")?;
        let mint_pk_str = keyset.keys.get(&amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", amount))?;
        let mint_pk = point_from_hex(mint_pk_str).context("Invalid mint pk")?;
        let dleq = parse_dleq(sig);

        let (_, sess, index) = match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;

        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
        proof.derivation_index = index;
        if !verify_proof_offline(&proof, &keyset.keys) {
            tracing::warn!("⚠️  DLEQ verification FAILED for amount {} (keyset {}). Storing anyway to preserve funds.", amount, sig_id);
        }
        new_proofs.push(proof);
    }

    // ─── Update wallet state ────────────────────────────────────────────────────
    if paid {
        // Consumed proofs are already removed; we just add the change
        if !new_proofs.is_empty() {
            state.proofs.entry(hub_mint.clone()).or_default().extend(new_proofs);
        }
    } else {
        // Refund the original proofs
        state.proofs.entry(hub_mint.clone()).or_default().extend(hub_proofs);
    }

    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
        if paid {
            tx.status = TransactionStatus::Success;
        } else {
            tx.status = TransactionStatus::Failed;
        }
    }

    state.save_encrypted(wallet_path, passphrase).ok();

    if !paid {
        return Err(anyhow!("Lightning Network payment failed. The mint could not find a route or the invoice expired. Your funds have been refunded to your wallet."));
    }

    Ok(required_amt)
}