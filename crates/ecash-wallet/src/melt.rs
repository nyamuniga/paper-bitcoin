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
        Vec::new()
    } else {
        ecash_core::types::split_into_powers_of_2(max_change)
    }
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
    let all_paid = results.iter().all(|r| matches!(r, Ok((true, _, _))));

    if !all_paid {
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Failed;
        }
        // Refund the note's proofs into the user's wallet so they don't lose the money
        for (mint, proofs, _) in &mint_data {
            state.proofs.entry(mint.clone()).or_default().extend(proofs.clone());
        }
        state.save_encrypted(wallet_path, passphrase).ok();
        return Err(anyhow!("MPP payment failed: one or more legs did not succeed. The note's funds have been deposited into your local wallet."));
    }

    // ── Step 7: Process change from all mints ──────────────────────────────
    let mut all_change_proofs = Vec::new();
    for (req, res) in melt_requests.into_iter().zip(results.into_iter()) {
        let (_paid, _preimage, change_sigs) = match res {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Mint {} melt leg error: {}", req.mint, e);
                continue;
            }
        };
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

    let (quote_id, fee_reserve, total_required) = hub_client.request_melt_quote(external_invoice).await?;
    let required_amt = total_required.saturating_sub(fee_reserve);
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
                let (paid, _preimage, change_sigs) = entry_client.melt_tokens(&entry_proofs, &inv_clone, None, Some(change_outputs)).await?;
                if !paid {
                    return Err::<_, anyhow::Error>(anyhow!("Failed to melt child mint to Hub"));
                }

                // Process change from child mint defensively
                let mut reclaimed_proofs = Vec::new();
                let mut change_sessions = change_sessions;
                for sig in change_sigs.iter() {
                    let amount = sig["amount"].as_u64().unwrap_or(0);
                    if amount == 0 { continue; }
                    let sig_id = sig["id"].as_str().unwrap_or(&entry_keyset_clone.id).to_string();
                    let keyset = match entry_client.fetch_keyset_by_id(&sig_id).await {
                        Ok(ks) => ks,
                        Err(e) => {
                            tracing::warn!("Failed to fetch keyset {} for child change sig: {}", sig_id, e);
                            continue;
                        }
                    };
                    let c_prime_str = match sig["C_"].as_str() {
                        Some(c) => c,
                        None => continue,
                    };
                    let c_prime = match point_from_hex(c_prime_str) {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    let mint_pk_str = match keyset.keys.get(&amount) {
                        Some(pk) => pk,
                        None => continue,
                    };
                    let mint_pk = match point_from_hex(mint_pk_str) {
                        Ok(pk) => pk,
                        Err(_) => continue,
                    };
                    let dleq = parse_dleq(sig);
                    let (_, sess, index) = match match_and_remove_session(&mut change_sessions, amount, &mint_pk, &c_prime, dleq.as_ref()) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                    proof.derivation_index = index;
                    reclaimed_proofs.push(proof);
                }

                // Now mint tokens on the Hub using the mint quote (retry with backoff if settlement is processing)
                let mut hub_sigs = None;
                for _ in 0..6 {
                    match hub_client.mint_tokens(&qid_clone, hub_change_outputs.clone()).await {
                        Ok(sigs) => {
                            hub_sigs = Some(sigs);
                            break;
                        }
                        Err(e) => {
                            let err_msg = e.to_string();
                            if err_msg.contains("not paid") || err_msg.contains("UNPAID") || err_msg.contains("pending") {
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            } else {
                                return Err(e);
                            }
                        }
                    }
                }
                let hub_sigs = hub_sigs.ok_or_else(|| anyhow!("Hub mint failed to issue proofs for quote {}", qid_clone))?;

                let mut new_hub_proofs = Vec::new();
                let mut hub_sessions = hub_change_sessions;
                for sig in hub_sigs.iter() {
                    let amount = sig["amount"].as_u64().unwrap_or(0);
                    if amount == 0 { continue; }
                    let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset_clone.id).to_string();
                    let keyset = match hub_client.fetch_keyset_by_id(&sig_id).await {
                        Ok(ks) => ks,
                        Err(e) => {
                            tracing::warn!("Failed to fetch keyset {} for hub minted proof: {}", sig_id, e);
                            continue;
                        }
                    };
                    let c_prime_str = match sig["C_"].as_str() {
                        Some(c) => c,
                        None => continue,
                    };
                    let c_prime = match point_from_hex(c_prime_str) {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    let mint_pk_str = match keyset.keys.get(&amount) {
                        Some(pk) => pk,
                        None => continue,
                    };
                    let mint_pk = match point_from_hex(mint_pk_str) {
                        Ok(pk) => pk,
                        Err(_) => continue,
                    };
                    let dleq = parse_dleq(sig);
                    let (_, sess, index) = match match_and_remove_session(&mut hub_sessions, amount, &mint_pk, &c_prime, dleq.as_ref()) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
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
        return Err(anyhow!("Insufficient funds on note: have {} sats, need {} sats ({} + {} fee reserve)", total_hub_sats, total_required, required_amt, fee_reserve));
    }

    // If hub_proofs total exceeds total_required, swap first so the excess change
    // is safely deposited directly into the user's wallet via NUT-03 swap!
    // That way, we only pass EXACTLY total_required to the melt endpoint.
    let melt_proofs = if total_hub_sats > total_required {
        let change_amount = total_hub_sats - total_required;
        let desired_amounts = ecash_core::types::split_into_powers_of_2(total_required);
        let change_amounts = ecash_core::types::split_into_powers_of_2(change_amount);

        crate::swap::swap_proofs(
            state,
            wallet_path,
            passphrase,
            hub_mint,
            hub_proofs,
            desired_amounts,
            change_amounts,
            None,
        ).await?
    } else {
        hub_proofs
    };

    // Prepare change outputs for the final melt to receive fee reserve returns (NUT-08)
    let change_denoms = if fee_reserve > 0 {
        ecash_core::types::split_into_powers_of_2(fee_reserve)
    } else {
        Vec::new()
    };
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
            quote_id: quote_id.clone(),
            proofs: melt_proofs.clone(),
        }),
        amount: required_amt,
        fee: fee_reserve,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: hub_mint.clone(),
    };
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase).ok();

    // Send the final melt
    let melt_result = hub_client.melt_tokens(&melt_proofs, external_invoice, Some(&quote_id), Some(outputs)).await;

    let (paid, _preimage, change_sigs) = match melt_result {
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
            // Re-insert melt_proofs on other errors so funds aren't lost
            state.proofs.entry(hub_mint.clone()).or_default().extend(melt_proofs);
            if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
                tx.status = TransactionStatus::Failed;
            }
            state.save_encrypted(wallet_path, passphrase).ok();
            return Err(anyhow!("Payment failed: {}", e));
        }
    };

    // Unblind final change defensively
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
            match hub_client.fetch_keyset_by_id(&sig_id).await {
                Ok(ks) => {
                    keyset_cache.insert(sig_id.clone(), ks.clone());
                    ks
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch keyset {} for change sig: {}", sig_id, e);
                    continue;
                }
            }
        };

        let c_prime_str = match sig["C_"].as_str() {
            Some(c) => c,
            None => continue,
        };
        let c_prime = match point_from_hex(c_prime_str) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let mint_pk_str = match keyset.keys.get(&amount) {
            Some(pk) => pk,
            None => continue,
        };
        let mint_pk = match point_from_hex(mint_pk_str) {
            Ok(pk) => pk,
            Err(_) => continue,
        };
        let dleq = parse_dleq(sig);
        let (_, sess, index) = match match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref()) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("Failed to match session for change signature: {}", e);
                continue;
            }
        };
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
        proof.derivation_index = index;
        new_proofs.push(proof);
    }

    // Update wallet state
    if paid {
        if !new_proofs.is_empty() {
            state.proofs.entry(hub_mint.clone()).or_default().extend(new_proofs);
        }
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
            tx.status = TransactionStatus::Success;
        }
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Success;
        }
    } else {
        // Refund proofs to wallet
        state.proofs.entry(hub_mint.clone()).or_default().extend(melt_proofs);
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
            tx.status = TransactionStatus::Failed;
        }
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Failed;
        }
    }

    state.save_encrypted(wallet_path, passphrase).ok();

    if !paid {
        return Err(anyhow!("Lightning Network payment failed. Your funds have been refunded to your wallet."));
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

    // Only consider NUT-15 MPP if there are MULTIPLE mints and all mints support it
    let mut all_support_nut15 = token.token.len() > 1;
    if all_support_nut15 {
        for entry in &token.token {
            let client = MintClient::new(&entry.mint);
            match client.supports_nut15().await {
                Ok(true) => continue,
                Ok(false) => {
                    tracing::warn!("Mint {} does NOT support NUT-15. Falling back to consolidation.", entry.mint);
                    all_support_nut15 = false;
                    break;
                }
                Err(e) => {
                    tracing::warn!("Failed to check NUT-15 support for {}: {}. Falling back to consolidation.", entry.mint, e);
                    all_support_nut15 = false;
                    break;
                }
            }
        }
    }

    let result = if all_support_nut15 {
        tracing::info!("All mints support NUT-15. Using Multi-Path Payment (MPP).");
        redeem_note_mpp(state, wallet_path, passphrase, &token, external_invoice, &redeem_tx_id).await
    } else {
        tracing::info!("Using direct / legacy consolidation flow.");
        redeem_note_legacy(state, wallet_path, passphrase, &token, external_invoice, &redeem_tx_id).await
    };

    // If result is Err, mark the transaction as Failed if not already done.
    if result.is_err() {
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            if tx.status != TransactionStatus::Failed {
                tx.status = TransactionStatus::Failed;
            }
        }
        state.save_encrypted(wallet_path, passphrase).ok();
    } else {
        if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == redeem_tx_id) {
            tx.status = TransactionStatus::Success;
        }
        state.save_encrypted(wallet_path, passphrase).ok();
    }

    result
}

// ─── Pay Invoice ────────────────────────────────────────────────────────────────

pub async fn pay_invoice(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, invoice: &str, target_mint: Option<String>) -> Result<(u64, String)> {
    let mut selected_mint = None;
    let mut required_amt = 0;
    let mut fee_reserve = 0;
    let mut quote_id = String::new();
    let mut mint_errors = Vec::new();

    let mints_to_check: Vec<String> = if let Some(m) = target_mint {
        vec![m]
    } else {
        state.proofs.keys().cloned().collect()
    };

    for mint in &mints_to_check {
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

    let total_needed = required_amt + fee_reserve;

    // 1. Coin selection: Only select proofs needed to cover required_amt + fee_reserve
    let all_mint_proofs = state.proofs.get(&hub_mint)
        .ok_or_else(|| anyhow!("No proofs for mint {}", hub_mint))?
        .clone();

    if all_mint_proofs.is_empty() {
        return Err(anyhow!("No proofs found for mint {}", hub_mint));
    }

    let mut sorted_proofs = all_mint_proofs.clone();
    sorted_proofs.sort_by_key(|p| p.amount);

    let mut selected_for_melt = Vec::new();
    let mut selected_total = 0;
    for p in &sorted_proofs {
        selected_for_melt.push(p.clone());
        selected_total += p.amount;
        if selected_total >= total_needed {
            break;
        }
    }

    if selected_total < total_needed {
        return Err(anyhow!("Insufficient balance on {}. Need {} sats, have {} sats", hub_mint, total_needed, selected_total));
    }

    // 2. If selected proofs exceed total_needed, swap first to exact amounts and change.
    // This keeps the user's change safely in state.proofs, completely avoiding reliance
    // on NUT-08 melt change for the entire surplus (as many mints do not support NUT-08).
    let melt_proofs = if selected_total > total_needed {
        let change_amount = selected_total - total_needed;
        let desired_amounts = ecash_core::types::split_into_powers_of_2(total_needed);
        let change_amounts = ecash_core::types::split_into_powers_of_2(change_amount);

        crate::swap::swap_proofs(
            state,
            wallet_path,
            passphrase,
            &hub_mint,
            selected_for_melt,
            desired_amounts,
            change_amounts,
            None,
        ).await?
    } else {
        // Exact match: only remove selected_for_melt from wallet state
        let selected_secrets: std::collections::HashSet<String> =
            selected_for_melt.iter().map(|p| p.secret.clone()).collect();
        if let Some(mint_proofs) = state.proofs.get_mut(&hub_mint) {
            mint_proofs.retain(|p| !selected_secrets.contains(&p.secret));
        }
        state.save_encrypted(wallet_path, passphrase)?;
        selected_for_melt
    };

    let max_proof_idx = state
        .proofs
        .values()
        .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
        .max()
        .unwrap_or(0);
    if max_proof_idx > 0 && state.derivation_index <= max_proof_idx {
        state.derivation_index = max_proof_idx + 1;
    }

    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    // 3. Prepare change outputs strictly for unused fee_reserve (if any)
    let max_change = fee_reserve;
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

    let tx_id = format!("tx_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::Melt(MeltTransactionData {
            quote_id: quote_id.clone(),
            proofs: melt_proofs.clone(),
        }),
        amount: required_amt,
        fee: fee_reserve,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: hub_mint.clone(),
    };
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase).ok();

    let melt_result = hub_client.melt_tokens(
        &melt_proofs,
        invoice,
        Some(&quote_id),
        if outputs.is_empty() { None } else { Some(outputs) },
    ).await;

    let (paid, preimage, change_sigs) = match melt_result {
        Ok(res) => res,
        Err(e) => {
            let err_lower = e.to_string().to_lowercase();
            if err_lower.contains("already signed")
                || err_lower.contains("already been signed")
                || err_lower.contains("outputs already")
            {
                tracing::warn!("Melt change collision detected. Advancing derivation index.");
                state.derivation_index += 25;
            }

            let ys: Vec<String> = melt_proofs.iter().map(|p| {
                ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()))
            }).collect();
            
            let mut valid_proofs = melt_proofs.clone();
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

            if !valid_proofs.is_empty() {
                state.proofs.entry(hub_mint.clone()).or_default().extend(valid_proofs);
            }
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
        if let (Some(amount), Some(c_prime_str)) = (sig["amount"].as_u64(), sig["C_"].as_str()) {
            let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id).to_string();

            let keyset = if let Some(ks) = keyset_cache.get(&sig_id) {
                ks.clone()
            } else if let Ok(ks) = hub_client.fetch_keyset_by_id(&sig_id).await {
                keyset_cache.insert(sig_id.clone(), ks.clone());
                ks
            } else {
                continue;
            };

            if let (Ok(c_prime), Some(mint_pk_str)) = (point_from_hex(c_prime_str), keyset.keys.get(&amount)) {
                if let Ok(mint_pk) = point_from_hex(mint_pk_str) {
                    let dleq = parse_dleq(sig);
                    if let Ok((_, sess, index)) = match_and_remove_session(&mut sessions, amount, &mint_pk, &c_prime, dleq.as_ref()) {
                        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, &sig_id, dleq);
                        proof.derivation_index = index;
                        new_proofs.push(proof);
                    }
                }
            }
        }
    }

    if paid {
        if !new_proofs.is_empty() {
            state.proofs.entry(hub_mint.clone()).or_default().extend(new_proofs);
        }
    } else {
        state.proofs.entry(hub_mint.clone()).or_default().extend(melt_proofs);
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

    Ok((required_amt, preimage.unwrap_or_default()))
}