use std::path::PathBuf;
use anyhow::{anyhow, Context, Result};
use ecash_core::types::*;
use ecash_core::dhke::*;
use ecash_core::derivation::*;
use crate::*;
use crate::client::{MintClient, estimate_routing_fee_from_info, estimate_melt_fee};
use crate::melt::parse_dleq;

// ─── Public API ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ReserveStrategy {
    Static,
    Dynamic,
}

pub async fn prepare_issue_multimint_note(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    allocations: &[(&str, u64)],
    strategy: ReserveStrategy,
) -> Result<(String, String, String, u64)> {
    let hub_mint = allocations[0].0;
    let mut total_face_value = 0;

    let mut fee_futures = Vec::new();
    for &(mint, face_val) in allocations {
        if face_val == 0 { continue; }
        total_face_value += face_val;
        
        let mint = mint.to_string();
        fee_futures.push(async move {
            let reserve = match strategy {
                ReserveStrategy::Static => std::cmp::max(10, face_val * 3 / 100),
                ReserveStrategy::Dynamic => {
                    let fee_est = estimate_routing_fee_from_info(&mint, face_val).await;
                    let buffer = std::cmp::max(5, fee_est / 2);
                    let min_reserve = 10;
                    let max_reserve = std::cmp::max(10, face_val * 5 / 100);
                    std::cmp::min(std::cmp::max(min_reserve, fee_est + buffer), max_reserve)
                }
            };
            (mint, face_val + reserve)
        });
    }

    let actual_allocations = futures::future::join_all(fee_futures).await;

    let mut quote_futures = Vec::new();
    let hub_mint_str = hub_mint.to_string();

    for (mint, amt) in actual_allocations.iter().skip(1) {
        let mint = mint.clone();
        let amt = *amt;
        let hub_mint_str = hub_mint_str.clone();
        
        quote_futures.push(async move {
            let client = MintClient::new(&mint);
            let (qid, inv) = client.request_mint_quote(amt).await?;
            let (fee, _) = estimate_melt_fee(&hub_mint_str, &inv).await?;
            Ok::<_, anyhow::Error>((mint, amt, qid, inv, fee))
        });
    }

    let mut other_quotes = Vec::new();
    let mut total_hub_needed = actual_allocations[0].1;

    let quote_results = futures::future::join_all(quote_futures).await;
    for res in quote_results {
        let (mint, amt, qid, inv, fee) = res?;
        other_quotes.push((mint, amt, qid, inv, fee));
        total_hub_needed += amt + fee;
    }

    let hub_client = MintClient::new(hub_mint);

    let (hub_qid, hub_inv) = hub_client.request_mint_quote(total_hub_needed).await?;

    let hub_keyset = hub_client.fetch_keyset().await?;
    state.trusted_keys.insert(hub_mint.to_string(), hub_keyset.keys.clone());
    let (mut note_deriv, note_seed_hex) = TokenDerivation::generate();

    let mut hub_denoms = ecash_core::types::split_into_powers_of_2(actual_allocations[0].1);
    for (_, amt, _, _, fee) in &other_quotes {
        hub_denoms.extend(ecash_core::types::split_into_powers_of_2(amt + fee));
    }

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &hub_denoms {
        let index = note_deriv.index;
        let secret = note_deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((sess, index));
    }

    let tx_id = format!("tx_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let pending_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::Issue(ecash_core::types::IssueTransactionData {
            note: None,
            allocations: actual_allocations.iter().map(|(m, a)| (m.to_string(), *a)).collect(),
            hub_mint: hub_mint.to_string(),
            quote_id: hub_qid.clone(),
            master_seed_hex: note_seed_hex,
            fee_strategy: match strategy {
                ReserveStrategy::Static => "static".to_string(),
                ReserveStrategy::Dynamic => "dynamic".to_string(),
            },
            hub_blinding_sessions_hex: sessions.iter().map(|(s, _)| s.secret.clone()).collect(),
            hub_outputs: outputs.clone(),
            child_quotes: other_quotes,
        }),
        amount: total_face_value,
        fee: total_hub_needed - total_face_value,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: "Local Wallet".to_string(),
    };
    state.transactions.push(pending_tx);
    state.save_encrypted(wallet_path, passphrase)?;

    Ok((tx_id, hub_mint.to_string(), hub_inv, total_hub_needed))
}

pub async fn resume_issue_note(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    tx_id: &str,
) -> Result<PhysicalNote> {
    let (issue_data, original_amount) = {
        let tx = state.transactions.iter().find(|t| t.id == tx_id).ok_or_else(|| anyhow!("Tx not found"))?;
        if tx.status == TransactionStatus::Success {
            if let TransactionType::Issue(data) = &tx.tx_type {
                if let Some(note) = &data.note {
                    return Ok(note.clone());
                }
            }
        }
        if let TransactionType::Issue(data) = &tx.tx_type {
            (data.clone(), tx.amount)
        } else {
            return Err(anyhow!("Not an issue tx"));
        }
    };

    let hub_client = MintClient::new(&issue_data.hub_mint);
    
    let check_url = format!("{}/v1/mint/quote/bolt11/{}", hub_client.url, issue_data.quote_id);
    let is_paid = match hub_client.http.get(&check_url).send().await {
        Ok(resp) => {
            if let Ok(check) = resp.json::<serde_json::Value>().await {
                check.get("state").and_then(|s| s.as_str()) == Some("PAID")
            } else { false }
        },
        Err(_) => false,
    };
    
    if !is_paid {
        return Err(anyhow!("Invoice is not paid yet."));
    }

    let hub_keyset = hub_client.fetch_keyset().await?;
    let sigs = match hub_client.mint_tokens(&issue_data.quote_id, issue_data.hub_outputs.clone()).await {
        Ok(s) => s,
        Err(e) => return Err(anyhow!("Mint error on Hub, but your payment is safe. Go to History to retry minting. Error: {}", e)),
    };

    let mut hub_all_proofs = Vec::new();
    let mut note_deriv = TokenDerivation::from_hex(&issue_data.master_seed_hex)?;
    for (secret_hex, sig) in issue_data.hub_blinding_sessions_hex.iter().zip(sigs.iter()) {
        let sess = BlindingSession::new(secret_hex);
        let index = note_deriv.index;
        note_deriv.next_secret(); // advance index just like we did originally
        let amount = sig["amount"].as_u64().ok_or_else(|| anyhow!("Missing amount in signature"))?;
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id);
        let c_prime_str = sig["C_"].as_str().ok_or_else(|| anyhow!("Missing C_ in signature"))?;
        let c_prime = point_from_hex(c_prime_str).context("Invalid C_")?;
        let mint_pk_str = hub_keyset.keys.get(&amount).ok_or_else(|| anyhow!("Unknown amount {} in keyset", amount))?;
        let mint_pk = point_from_hex(mint_pk_str).context("Invalid mint pk")?;
        let dleq = parse_dleq(sig);
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
        proof.derivation_index = index;
        hub_all_proofs.push(proof);
    }

    state.proofs.entry(issue_data.hub_mint.clone()).or_default().extend(hub_all_proofs.clone());
    if !state.mints.contains(&issue_data.hub_mint) { state.mints.push(issue_data.hub_mint.clone()); }
    state.save_encrypted(wallet_path, passphrase)?;

    let mut entries = Vec::new();
    let mut proofs_idx = 0;

    let hub_main_len = ecash_core::types::split_into_powers_of_2(issue_data.allocations[0].1).len();
    let hub_main_proofs = hub_all_proofs[0..hub_main_len].to_vec();
    entries.push(TokenEntry { mint: issue_data.hub_mint.clone(), proofs: hub_main_proofs });
    proofs_idx += hub_main_len;

    let mut child_futures = Vec::new();

    for (mint, amt, qid, inv, fee) in &issue_data.child_quotes {
        let subset_len = ecash_core::types::split_into_powers_of_2(amt + fee).len();
        let melt_proofs = hub_all_proofs[proofs_idx..proofs_idx + subset_len].to_vec();
        proofs_idx += subset_len;

        let tx_id_melt = format!("tx_melt_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
        let pending_melt_tx = Transaction {
            id: tx_id_melt.clone(),
            tx_type: TransactionType::Melt(MeltTransactionData {
                quote_id: inv.clone(),
                proofs: melt_proofs.clone(),
            }),
            amount: *amt,
            fee: *fee,
            status: TransactionStatus::Pending,
            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
            mint_url: issue_data.hub_mint.clone(),
        };
        state.transactions.push(pending_melt_tx);
        
        if let Some(hub_proofs) = state.proofs.get_mut(&issue_data.hub_mint) {
            hub_proofs.retain(|p| !melt_proofs.iter().any(|mp| mp.id == p.id && mp.secret == p.secret));
        }

        let denoms = ecash_core::types::split_into_powers_of_2(*amt);
        let mut b_sess = Vec::new();
        let mut b_out = Vec::new();
        for &d in &denoms {
            let index = note_deriv.index;
            let secret = note_deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            // We use a dummy keyset id for now, it will be overridden if we fetch keyset
            b_out.push(serde_json::json!({"amount": d, "id": "placeholder", "B_": sess.b_prime_hex()}));
            b_sess.push((sess, index));
        }

        let hub_mint_url = issue_data.hub_mint.clone();
        let inv_clone = inv.clone();
        let qid_clone = qid.clone();
        let mint_clone = mint.clone();

        child_futures.push(async move {
            let h_client = MintClient::new(&hub_mint_url);
            h_client.melt_tokens(&melt_proofs, &inv_clone, None, None).await.map_err(|e| (tx_id_melt.clone(), anyhow!("Melt error during issuance: {}", e)))?;

            let client = MintClient::new(&mint_clone);
            let keyset = client.fetch_keyset().await.map_err(|e| (tx_id_melt.clone(), e))?;
            
            // update keyset id in b_out
            let mut final_b_out = b_out.clone();
            for out in &mut final_b_out {
                if let Some(obj) = out.as_object_mut() {
                    obj.insert("id".to_string(), serde_json::json!(keyset.id));
                }
            }

            let b_sigs = client.mint_tokens(&qid_clone, final_b_out).await.map_err(|e| (tx_id_melt.clone(), anyhow!("Child mint error. Your funds are at the mint. Error: {}", e)))?;

            let mut b_proofs = Vec::new();
            for ((sess, index), sig) in b_sess.iter().zip(b_sigs.iter()) {
                let amount = sig["amount"].as_u64().ok_or_else(|| (tx_id_melt.clone(), anyhow!("Missing amount in signature")))?;
                let sig_id = sig["id"].as_str().unwrap_or(&keyset.id);
                let c_prime_str = sig["C_"].as_str().ok_or_else(|| (tx_id_melt.clone(), anyhow!("Missing C_ in signature")))?;
                let c_prime = point_from_hex(c_prime_str).map_err(|e| (tx_id_melt.clone(), e.into()))?;
                let mint_pk_str = keyset.keys.get(&amount).ok_or_else(|| (tx_id_melt.clone(), anyhow!("Unknown amount {} in keyset", amount)))?;
                let mint_pk = point_from_hex(mint_pk_str).map_err(|e| (tx_id_melt.clone(), e.into()))?;
                let dleq = parse_dleq(sig);
                let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
                proof.derivation_index = *index;
                b_proofs.push(proof);
            }
            Ok::<_, (String, anyhow::Error)>((tx_id_melt, mint_clone, keyset.keys, b_proofs))
        });
    }

    state.save_encrypted(wallet_path, passphrase)?;

    let child_results = futures::future::join_all(child_futures).await;
    for res in child_results {
        match res {
            Ok((tx_id_melt, mint, keys, b_proofs)) => {
                if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id_melt) {
                    tx.status = TransactionStatus::Success;
                }
                state.trusted_keys.insert(mint.clone(), keys);
                state.proofs.entry(mint.clone()).or_default().extend(b_proofs.clone());
                if !state.mints.contains(&mint) { state.mints.push(mint.clone()); }
                entries.push(TokenEntry { mint, proofs: b_proofs });
            }
            Err((_tx_id_melt, e)) => {
                return Err(anyhow!("Concurrent issuance failed: {}", e));
            }
        }
    }

    for entry in &entries {
        if let Some(state_proofs) = state.proofs.get_mut(&entry.mint) {
            state_proofs.retain(|p| !entry.proofs.iter().any(|ep| ep.id == p.id && ep.secret == p.secret));
        }
    }
    state.save_encrypted(wallet_path, passphrase)?;

    let public_entries: Vec<_> = entries.iter().map(|e| e.to_public()).collect();
    let validation_hash = compute_validation_hash(&public_entries);
    let serial = serial_from_hash(&validation_hash);

    let mut block_height = 0;

    if let Ok(client) = reqwest::Client::builder()
        .user_agent("PaperBitcoin/1.0")
        .timeout(std::time::Duration::from_secs(5))
        .build() 
    {
        match client.get("https://mempool.space/api/blocks/tip/height").send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.text().await {
                    Ok(text) => {
                        block_height = text.trim().parse::<u64>().unwrap_or(0);
                    }
                    Err(e) => tracing::warn!("Failed to read mempool response body: {}", e),
                }
            }
            Ok(resp) => {
                tracing::warn!("Mempool API returned HTTP {}: {}", resp.status(), resp.status().canonical_reason().unwrap_or("unknown"));
            }
            Err(e) => {
                tracing::warn!("Failed to reach mempool.space: {}", e);
                // Try fallback API
                if let Ok(fallback_resp) = client.get("https://blockstream.info/api/blocks/tip/height").send().await {
                    if fallback_resp.status().is_success() {
                        if let Ok(text) = fallback_resp.text().await {
                            block_height = text.trim().parse::<u64>().unwrap_or(0);
                        }
                    }
                }
            }
        }
    }

    let note = PhysicalNote {
        amount_sats: original_amount,
        mint_urls: issue_data.allocations.iter().map(|a| a.0.to_string()).collect(),
        serial,
        validation_hash: validation_hash.clone(),
        block_height,
        fee_strategy: issue_data.fee_strategy.clone(),
        public_data: PublicNoteData {
            entries: public_entries,
            validation_hash: validation_hash.clone(),
            face_value_sats: original_amount,
        },
        private_data: PrivateNoteData { master_seed_hex: issue_data.master_seed_hex.clone() },
    };

    if let Some(tx) = state.transactions.iter_mut().find(|t| t.id == tx_id) {
        tx.status = TransactionStatus::Success;
        if let TransactionType::Issue(data) = &mut tx.tx_type {
            data.note = Some(note.clone());
        }
    }
    state.save_encrypted(wallet_path, passphrase)?;

    Ok(note)
}

pub async fn issue_multimint_note<F, Fut>(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    allocations: &[(&str, u64)],
    strategy: ReserveStrategy,
    on_invoice: F,
) -> Result<PhysicalNote>
where
    F: FnOnce(String, String, u64) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let (tx_id, hub_mint, inv, total) = prepare_issue_multimint_note(state, wallet_path, passphrase, allocations, strategy).await?;
    on_invoice(hub_mint.clone(), inv, total).await;
    
    let hub_client = MintClient::new(&hub_mint);
    
    let quote_id = if let Some(tx) = state.transactions.iter().find(|t| t.id == tx_id) {
        if let TransactionType::Issue(data) = &tx.tx_type {
            data.quote_id.clone()
        } else {
            return Err(anyhow!("Invalid tx type"));
        }
    } else {
        return Err(anyhow!("Tx not found"));
    };

    hub_client.wait_for_quote_paid(&quote_id).await?;
    resume_issue_note(state, wallet_path, passphrase, &tx_id).await
}


