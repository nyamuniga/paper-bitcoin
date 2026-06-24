use std::{collections::HashMap, path::PathBuf};
use anyhow::{anyhow, Context, Result};
use ecash_core::types::*;
use ecash_core::dhke::*;
use ecash_core::derivation::*;
use crate::*;
use crate::client::{MintClient, KeysetInfo};

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
    
    if let Some(idx) = sessions.iter().position(|(d, _, _)| *d == amount) {
        return Ok(sessions.remove(idx));
    }
    
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

// ─── NUT-15 MPP Implementation ──────────────────────────────────────────────────

/// Redeem a note using NUT-15 Multi-Path Payments (MPP).
/// All mints pay the SAME invoice, using the SAME quote ID.

async fn redeem_note_mpp(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    token: &CashuToken,
    external_invoice: &str,
    redeem_tx_id: &str,
) -> Result<u64> {
    // ── Step 1: Get required amount from the invoice (via the first mint) ──
    let first_mint = &token.token[0].mint;
    let first_client = MintClient::new(first_mint);
    let (_, _, total_required) = first_client.request_melt_quote(external_invoice).await?;
    tracing::info!("Invoice requires total: {} sats", total_required);

    // ── Step 2: Collect all proofs and calculate proportional shares ──────
    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let mut mint_data = Vec::new();
    let mut total_proofs = 0;
    for entry in &token.token {
        let unique_proofs: Vec<_> = {
            let mut unique = std::collections::HashMap::new();
            for p in &entry.proofs {
                unique.insert(p.secret.clone(), p.clone());
            }
            unique.into_values().collect()
        };
        let mint_total: u64 = unique_proofs.iter().map(|p| p.amount).sum();
        mint_data.push((entry.mint.clone(), unique_proofs, mint_total));
        total_proofs += mint_total;
    }

    if total_proofs < total_required {
        return Err(anyhow!("Insufficient total funds: have {}, need {}", total_proofs, total_required));
    }

    // ── Step 3: For each mint, get a quote for its proportional share ──────
    struct MeltRequest {
        mint: String,
        proofs: Vec<Proof>,
        quote_id: String,
        change_outputs: Vec<serde_json::Value>,
        change_sessions: Vec<(u64, BlindingSession, u64)>,
        keyset: KeysetInfo,
    }

    let mut melt_requests = Vec::new();

    for (mint, proofs, mint_total) in &mint_data {
        // Calculate this mint's share of the total required (proportional)
        let share = if total_proofs > 0 {
            (((*mint_total as f64 / total_proofs as f64) * total_required as f64).ceil() as u64)
                .min(*mint_total)
        } else {
            0
        };

        if share == 0 {
            state.proofs.entry(mint.clone()).or_default().extend(proofs.clone());
            continue;
        }

        // Get a melt quote for this mint's share (with the `amount` parameter)
        let client = MintClient::new(mint);
        let (quote_id, fee_reserve, _) = client.request_melt_quote_with_amount(external_invoice, share).await?;
        tracing::debug!("Mint {}: share={} sats, fee_reserve={} sats", mint, share, fee_reserve);

        // The total this mint must provide is share + fee_reserve
        let total_needed = share + fee_reserve;
        if *mint_total < total_needed {
            // Not enough funds even for its share; refund and skip
            state.proofs.entry(mint.clone()).or_default().extend(proofs.clone());
            continue;
        }

        // Generate change outputs for the surplus
        let max_change = mint_total.saturating_sub(total_needed);
        let change_denoms = generate_change_denoms(max_change);
        let mut change_sessions = Vec::new();
        let mut change_outputs = Vec::new();
        for &d in &change_denoms {
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            let index = deriv.index - 1;
            change_outputs.push(serde_json::json!({
                "amount": d,
                "id": "placeholder",
                "B_": sess.b_prime_hex()
            }));
            change_sessions.push((d, sess, index));
        }

        // Fetch keyset and fill the correct keyset ID
        let keyset = client.fetch_keyset().await?;
        for out in &mut change_outputs {
            if let Some(obj) = out.as_object_mut() {
                obj.insert("id".to_string(), serde_json::json!(keyset.id));
            }
        }

        melt_requests.push(MeltRequest {
            mint: mint.clone(),
            proofs: proofs.clone(),
            quote_id,
            change_outputs,
            change_sessions,
            keyset,
        });
    }

    if melt_requests.is_empty() {
        return Err(anyhow!("No mints have sufficient funds to contribute"));
    }

    // ── Step 4: Persist derivation index ────────────────────────────────────
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    // ── Step 5: Execute all melts in parallel with their OWN quote_id ──────
    let mut melt_futures = Vec::new();
    for req in &melt_requests {
        let client = MintClient::new(&req.mint);
        let proofs = req.proofs.clone();
        let invoice = external_invoice.to_string();
        let quote_id = req.quote_id.clone();
        let outputs = req.change_outputs.clone();
        melt_futures.push(async move {
            client.melt_tokens(&proofs, &invoice, Some(&quote_id), Some(outputs)).await
        });
    }

    let results = futures::future::join_all(melt_futures).await;

    // ── Step 6: Check if all succeeded ──────────────────────────────────────
    let all_paid = results.iter().all(|r| matches!(r, Ok((true, _))));

    if !all_paid {
        // Refund ALL proofs on any failure (atomic)
        for req in &melt_requests {
            state.proofs.entry(req.mint.clone()).or_default().extend(req.proofs.clone());
        }
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Failed;
        }
        state.save_encrypted(wallet_path, passphrase).ok();
        return Err(anyhow!("MPP payment failed: one or more legs did not succeed."));
    }

    // ── Step 7: Process change from all mints ──────────────────────────────
    let mut all_change_proofs = Vec::new();
    for (req, res) in melt_requests.into_iter().zip(results.into_iter()) {
        let (_paid, change_sigs) = res?;
        let client = MintClient::new(&req.mint);
        let mut keyset_cache = std::collections::HashMap::new();
        keyset_cache.insert(req.keyset.id.clone(), req.keyset.clone());
        let mut change_sessions = req.change_sessions;

        for sig in change_sigs.iter() {
            let amount = sig["amount"].as_u64().unwrap_or(0);
            if amount == 0 { continue; }
            let sig_id = sig["id"].as_str().unwrap_or(&req.keyset.id).to_string();

            let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
                ks.clone()
            } else {
                if let Ok(ks) = client.fetch_keyset_by_id(&sig_id).await {
                    keyset_cache.insert(sig_id.clone(), ks.clone());
                    ks
                } else { continue; }
            };

            let c_prime_str = match sig["C_"].as_str() { Some(c) => c, None => continue };
            let c_prime = match point_from_hex(c_prime_str) { Ok(c) => c, Err(_) => continue };
            let mint_pk_str = match keyset.keys.get(&amount) { Some(pk) => pk, None => continue };
            let mint_pk = match point_from_hex(mint_pk_str) { Ok(pk) => pk, Err(_) => continue };
            let dleq = parse_dleq(sig);

            let (_, sess, index) = match match_and_remove_session(&mut change_sessions, amount, &mint_pk, &c_prime, dleq.as_ref()) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq.clone());
            proof.derivation_index = index;
            if !verify_proof_offline(&proof, &keyset.keys) {
                tracing::warn!("DLEQ verification FAILED for amount {} (keyset {}). Storing anyway.", amount, sig_id);
            }
            all_change_proofs.push((req.mint.clone(), proof));
        }
    }

    for (mint, proof) in all_change_proofs {
        state.proofs.entry(mint).or_default().push(proof);
    }

    // ── Step 8: Mark transaction as success ──────────────────────────────────
    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
        tx.status = TransactionStatus::Success;
    }

    state.save_encrypted(wallet_path, passphrase)?;
    Ok(total_required)
}
// ─── Legacy Consolidation Implementation ──────────────────────────────────────

/// Redeem a note using the legacy consolidation flow:
/// 1. Melt all child mint proofs to the Hub.
/// 2. Melt the Hub proofs to the final invoice.
async fn redeem_note_legacy(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    token: &CashuToken,
    external_invoice: &str,
    redeem_tx_id: &str,
) -> Result<u64> {
    // Step 1: Get the required amount from the invoice (via the Hub mint)
    let hub_mint = &token.token[0].mint;
    let hub_client = MintClient::new(hub_mint);
    let hub_keyset = hub_client.fetch_keyset().await?;

    let qv: serde_json::Value = hub_client.http.post(format!("{}/v1/melt/quote/bolt11", hub_client.url))
        .json(&serde_json::json!({ "request": external_invoice, "unit": "sat" })).send().await?.json().await?;
    if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
    if let Some(err) = qv.get("detail") { return Err(anyhow!("Melt quote error (detail): {}", err)); }
    let required_amt = qv["amount"].as_u64().unwrap_or(0);
    let fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
    let total_required = required_amt + fee_reserve;
    tracing::info!("Legacy flow: invoice requires {} sats ({} + {} fee reserve)", total_required, required_amt, fee_reserve);

    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    // Step 2: Consolidate all child mints to the Hub
    let mut hub_proofs = token.token[0].proofs.clone();
    // Deduplicate hub_proofs
    let mut unique = std::collections::HashMap::new();
    for p in hub_proofs {
        unique.insert(p.secret.clone(), p);
    }
    hub_proofs = unique.into_values().collect();

    let child_entries = &token.token[1..];
    if child_entries.is_empty() {
        // No child mints, use hub proofs directly
    } else {
        let mut quote_futures = Vec::new();
        let hub_mint_str = hub_mint.to_string();
        
        for entry in child_entries {
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

        let prepared_transfers = futures::future::join_all(quote_futures)
            .await
            .into_iter()
            .filter_map(|res| res.transpose())
            .collect::<Result<Vec<_>>>()?;

        // Execute child melts in parallel
        let mut execution_futures = Vec::new();
        for (entry, _amt, safe_fee, transfer_amt, qid, inv, entry_keyset) in prepared_transfers {
            let change_denoms = generate_change_denoms(safe_fee);
            let mut change_sessions = Vec::new();
            let mut change_outputs = Vec::new();
            
            for &d in &change_denoms {
                let secret = deriv.next_secret();
                let sess = BlindingSession::new(&secret);
                let index = deriv.index - 1;
                change_outputs.push(serde_json::json!({
                    "amount": d,
                    "id": entry_keyset.id,
                    "B_": sess.b_prime_hex()
                }));
                change_sessions.push((d, sess, index));
            }

            // Generate outputs for the Hub mint to receive the transfer amount
            let denoms = split_into_powers_of_2(transfer_amt);
            let mut hub_change_sessions = Vec::new();
            let mut hub_change_outputs = Vec::new();
            for &d in &denoms {
                let secret = deriv.next_secret();
                let sess = BlindingSession::new(&secret);
                let index = deriv.index - 1;
                hub_change_outputs.push(serde_json::json!({
                    "amount": d,
                    "id": hub_keyset.id,
                    "B_": sess.b_prime_hex()
                }));
                hub_change_sessions.push((d, sess, index));
            }

            let entry_client = MintClient::new(&entry.mint);
            let hub_client = MintClient::new(&hub_mint_str);
            let entry_proofs = entry.proofs.clone();
            let inv_clone = inv.clone();
            let qid_clone = qid.clone();
            let entry_keyset_clone = entry_keyset.clone();
            let hub_keyset_clone = hub_keyset.clone();

            execution_futures.push(async move {
                // Melt child proofs to Hub invoice
                let (paid, change_sigs) = entry_client.melt_tokens(&entry_proofs, &inv_clone, None, Some(change_outputs)).await?;
                if !paid {
                    return Err::<_, anyhow::Error>(anyhow!("Failed to melt child mint to Hub"));
                }

                // Process change from child mint
                let mut reclaimed_proofs = Vec::new();
                let mut change_sessions = change_sessions;
                for sig in change_sigs.iter() {
                    let amount = sig["amount"].as_u64().unwrap_or(0);
                    if amount == 0 { continue; }
                    let sig_id = sig["id"].as_str().unwrap_or(&entry_keyset_clone.id).to_string();
                    let keyset = entry_client.fetch_keyset_by_id(&sig_id).await?;
                    let c_prime = point_from_hex(sig["C_"].as_str().unwrap())?;
                    let mint_pk = point_from_hex(keyset.keys.get(&amount).unwrap())?;
                    let dleq = parse_dleq(sig);
                    let (_, sess, index) = match_and_remove_session(&mut change_sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;
                    let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                    proof.derivation_index = index;
                    reclaimed_proofs.push(proof);
                }

                // Now mint tokens on the Hub using the mint quote
                let hub_sigs = hub_client.mint_tokens(&qid_clone, hub_change_outputs).await?;
                let mut new_hub_proofs = Vec::new();
                let mut hub_sessions = hub_change_sessions;
                for sig in hub_sigs.iter() {
                    let amount = sig["amount"].as_u64().unwrap_or(0);
                    if amount == 0 { continue; }
                    let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset_clone.id).to_string();
                    let keyset = hub_client.fetch_keyset_by_id(&sig_id).await?;
                    let c_prime = point_from_hex(sig["C_"].as_str().unwrap())?;
                    let mint_pk = point_from_hex(keyset.keys.get(&amount).unwrap())?;
                    let dleq = parse_dleq(sig);
                    let (_, sess, index) = match_and_remove_session(&mut hub_sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;
                    let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                    proof.derivation_index = index;
                    new_hub_proofs.push(proof);
                }

                Ok::<_, anyhow::Error>((entry.mint, reclaimed_proofs, new_hub_proofs))
            });
        }

        // Wait for all child melts to complete
        let results = futures::future::join_all(execution_futures).await;
        for res in results {
            let (mint, reclaimed, new_hub) = res?;
            if !reclaimed.is_empty() {
                state.proofs.entry(mint).or_default().extend(reclaimed);
            }
            hub_proofs.extend(new_hub);
        }

        // Advance derivation index after all sessions
        state.derivation_index = deriv.index;
        state.save_encrypted(wallet_path, passphrase)?;
    }

    // Step 3: Now melt the consolidated Hub proofs to the final invoice
    if hub_proofs.is_empty() {
        return Err(anyhow!("No Hub proofs available after consolidation"));
    }
   
    // Deduplicate hub_proofs
    let mut unique = std::collections::HashMap::new();
    for p in hub_proofs {
        unique.insert(p.secret.clone(), p);
    }
    let hub_proofs: Vec<_> = unique.into_values().collect();

    let total_hub_sats: u64 = hub_proofs.iter().map(|p| p.amount).sum();
    tracing::info!("Consolidated Hub proofs: {} sats", total_hub_sats);

    if total_hub_sats < total_required {
        return Err(anyhow!("Insufficient consolidated funds: have {}, need {}", total_hub_sats, total_required));
    }

    // Prepare change outputs for the final melt (ask for max possible change, assuming fee = 0)
    let max_change = total_hub_sats.saturating_sub(required_amt);
    let change_denoms = generate_change_denoms(max_change);
    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &change_denoms {
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        let index = deriv.index - 1;
        outputs.push(serde_json::json!({
            "amount": d,
            "id": hub_keyset.id,
            "B_": sess.b_prime_hex()
        }));
        sessions.push((d, sess, index));
    }

    // Advance derivation index before final melt
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    // Save pending transaction and remove proofs from wallet balance immediately
    let tx_id = format!("tx_melt_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::Melt(MeltTransactionData {
            quote_id: "".to_string(), // we'll get it from the melt call
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

    // Now get a melt quote for the final invoice
    let (final_quote_id, _final_fee_reserve, _) = hub_client.request_melt_quote(external_invoice).await?;
    
    // Send the final melt
    let melt_result = hub_client.melt_tokens(&hub_proofs, external_invoice, Some(&final_quote_id), Some(outputs)).await;

    let (paid, change_sigs) = match melt_result {
        Ok(res) => res,
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("proofs could not be verified") {
                if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    tx.status = TransactionStatus::FailedMintError;
                }
                state.save_encrypted(wallet_path, passphrase).ok();
                return Err(anyhow!("Mint rejected the proofs as invalid/corrupt. The transaction was marked as FailedMintError."));
            }
            // Re-insert proofs on other errors
            state.proofs.entry(hub_mint.clone()).or_default().extend(hub_proofs);
            if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Failed;
            }
            state.save_encrypted(wallet_path, passphrase).ok();
            return Err(anyhow!("Payment failed: {}", e));
        }
    };

    // Unblind final change
    let mut keyset_cache: std::collections::HashMap<String, KeysetInfo> = std::collections::HashMap::new();
    keyset_cache.insert(hub_keyset.id.clone(), hub_keyset.clone());

    let mut new_proofs = Vec::new();
    for sig in change_sigs.iter() {
        let amount = sig["amount"].as_u64().unwrap_or(0);
        if amount == 0 { continue; }
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id).to_string();

        let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
            ks.clone()
        } else {
            let ks = hub_client.fetch_keyset_by_id(&sig_id).await?;
            keyset_cache.insert(sig_id.clone(), ks.clone());
            ks
        };

        let c_prime = point_from_hex(sig["C_"].as_str().unwrap())?;
        let mint_pk = point_from_hex(keyset.keys.get(&amount).unwrap())?;
        let dleq = parse_dleq(sig);
        let (_, sess, index) = match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref())?;
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
        proof.derivation_index = index;
        new_proofs.push(proof);
    }

    // Update wallet state
    if paid {
        // Remove consumed proofs (they are already removed from the wallet)
        if !new_proofs.is_empty() {
            state.proofs.entry(hub_mint.clone()).or_default().extend(new_proofs);
        }
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
            tx.status = TransactionStatus::Success;
        }
    } else {
        // Refund proofs
        state.proofs.entry(hub_mint.clone()).or_default().extend(hub_proofs);
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
            tx.status = TransactionStatus::Failed;
        }
    }

    // Mark the redeem transaction as success/failure
    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
        if paid {
            tx.status = TransactionStatus::Success;
        } else {
            tx.status = TransactionStatus::Failed;
        }
    }

    state.save_encrypted(wallet_path, passphrase).ok();

    if !paid {
        return Err(anyhow!("Lightning Network payment failed. Your funds have been refunded."));
    }

    Ok(required_amt)
}

// ─── Public redeem_note entry point ────────────────────────────────────────────

/// Redeem a note – automatically chooses NUT-15 MPP or legacy consolidation.
pub async fn redeem_note(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    public_data: &ecash_core::types::PublicNoteData,
    master_seed_hex: &str,
    external_invoice: &str,
) -> Result<u64> {
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
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Failed;
        }
        state.save_encrypted(wallet_path, passphrase).ok();
        return Err(anyhow!("Empty token"));
    }

    // Check if ALL mints support NUT-15
    let mut all_support_nut15 = true;
    for entry in &token.token {
        let client = MintClient::new(&entry.mint);
        match client.supports_nut15().await {
            Ok(true) => continue,
            Ok(false) => {
                tracing::warn!("Mint {} does NOT support NUT-15. Falling back to legacy consolidation.", entry.mint);
                all_support_nut15 = false;
                break;
            }
            Err(e) => {
                tracing::warn!("Failed to check NUT-15 support for {}: {}. Falling back to legacy.", entry.mint, e);
                all_support_nut15 = false;
                break;
            }
        }
    }

    let result = if all_support_nut15 {
        tracing::info!("All mints support NUT-15. Using Multi-Path Payment (MPP).");
        redeem_note_mpp(state, wallet_path, passphrase, &token, external_invoice, &redeem_tx_id).await
    } else {
        tracing::info!("Using legacy consolidation flow (hub + child melts).");
        redeem_note_legacy(state, wallet_path, passphrase, &token, external_invoice, &redeem_tx_id).await
    };

    // If result is Err, we need to mark the transaction as Failed if not already done.
    if result.is_err() {
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            if tx.status != TransactionStatus::Failed {
                tx.status = TransactionStatus::Failed;
            }
        }
        state.save_encrypted(wallet_path, passphrase).ok();
    }

    result
}

// ─── Pay Invoice ────────────────────────────────────────────────────────────────

pub async fn pay_invoice(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, invoice: &str) -> Result<u64> {
    let mut selected_mint = None;
    let mut required_amt = 0;
    let mut fee_reserve = 0;
    let mut quote_id = String::new();
    let mut mint_errors = Vec::new();

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

    let hub_proofs = state.proofs.get(&hub_mint)
        .ok_or_else(|| anyhow!("No proofs for mint {}", hub_mint))?
        .clone();

    if hub_proofs.is_empty() {
        return Err(anyhow!("No proofs found for mint {}", hub_mint));
    }

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

    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    let _ = state.proofs.remove(&hub_mint);

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

    let melt_result = hub_client.melt_tokens(&hub_proofs, invoice, Some(&quote_id), Some(outputs)).await;

    let (paid, change_sigs) = match melt_result {
        Ok(res) => res,
        Err(e) => {
            let ys: Vec<String> = hub_proofs.iter().map(|p| {
                ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()))
            }).collect();
            
            let mut valid_proofs = hub_proofs.clone();
            if let Ok(states) = hub_client.check_state(&ys).await {
                valid_proofs.retain(|p| {
                    let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
                    match states.get(&y).map(|s| s.as_str()) {
                        Some("SPENT") => false,
                        Some("UNSPENT") | Some("PENDING") => true,
                        _ => false, // Invalid or unknown
                    }
                });
            }

            if valid_proofs.len() < hub_proofs.len() {
                let removed = hub_proofs.len() - valid_proofs.len();
                tracing::warn!("Removed {} spent or invalid proofs from wallet.", removed);
                if !valid_proofs.is_empty() {
                    state.proofs.entry(hub_mint.clone()).or_default().extend(valid_proofs);
                }
                if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                    tx.status = TransactionStatus::Failed;
                }
                state.save_encrypted(wallet_path, passphrase).ok();
                return Err(anyhow!("Payment failed: {} proofs were spent or invalid and have been removed. Your balance has been updated. Please try again.", removed));
            }

            state.proofs.entry(hub_mint.clone()).or_default().extend(hub_proofs);
            if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Failed;
            }
            state.save_encrypted(wallet_path, passphrase).ok();
            return Err(anyhow!("Payment failed: {}", e));
        }
    };

    let mut keyset_cache: std::collections::HashMap<String, KeysetInfo> = std::collections::HashMap::new();
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
            tracing::warn!("DLEQ verification FAILED for amount {} (keyset {}). Storing anyway.", amount, sig_id);
        }
        new_proofs.push(proof);
    }

    if paid {
        if !new_proofs.is_empty() {
            state.proofs.entry(hub_mint.clone()).or_default().extend(new_proofs);
        }
    } else {
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
        return Err(anyhow!("Lightning Network payment failed. The mint could not find a route or the invoice expired. Your funds have been refunded."));
    }

    Ok(required_amt)
}