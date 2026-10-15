use anyhow::Result;
use ecash_core::{
    dhke::{point_from_hex, BlindingSession},
    derivation::TokenDerivation,
};
use crate::{
    state::WalletState,
    client::MintClient,
};
use std::path::PathBuf;

pub async fn restore_from_mints(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_urls: Vec<String>,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<u64> {
    let mut total_restored = 0;
    let mut max_used_index = -1_i64;
    
    // We scan up to max(100, derivation_index + 50) derivation indices to ensure newly minted/swapped proofs are checked.
    let scan_limit = std::cmp::max(100_u64, state.derivation_index + 50);
    
    for raw_url in mint_urls {
        let mint_url = crate::state::normalize_mint_url(&raw_url);
        if mint_url.is_empty() { continue; }
        
        let client = MintClient::new(&mint_url);
        let keyset = match client.fetch_keyset().await {
            Ok(ks) => ks,
            Err(e) => {
                println!("Failed to fetch keyset for {}: {}", mint_url, e);
                continue;
            }
        };

        let mut target_amounts: Vec<u64> = keyset
            .keys
            .keys()
            .filter(|&&amt| amt <= 67_108_864)
            .cloned()
            .collect();
        target_amounts.sort_unstable();

        let mut output_json = Vec::new();
        // Keep track of session info to unblind later.
        // We key by the hex of B_ and the amount, since the mint will return C_ for that B_
        let mut session_map = std::collections::HashMap::new();

        // Generate secrets for indices 0..scan_limit
        for idx in 0..scan_limit {
            let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
            deriv.index = idx;
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            let b_hex = sess.b_prime_hex();

            // We don't know which amount this index was originally used for.
            // So we request a restore for standard amounts for this B_.
            for &amt in &target_amounts {
                output_json.push(serde_json::json!({
                    "amount": amt,
                    "id": keyset.id,
                    "B_": b_hex.clone()
                }));
                session_map.insert(
                    format!("{}_{}", b_hex, amt), 
                    (secret.clone(), idx)
                );
            }
        }

        if let Some(tx) = &progress_tx {
            tx.send(format!("Requesting restore of {} outputs from {}", output_json.len(), mint_url)).ok();
        }
        println!("Requesting restore of {} outputs from {}", output_json.len(), mint_url);

        let mut out_arr = Vec::new();
        let mut sig_arr = Vec::new();
        
        use futures::StreamExt;
        
        // Chunk size 200 is small enough for mobile proxy limits (~30KB),
        // and concurrency of 5 prevents dropping the network while speeding it up.
        let chunks: Vec<_> = output_json.chunks(200).map(|c| c.to_vec()).collect();
        let mut stream = futures::stream::iter(chunks)
            .map(|chunk| {
                let client = client.clone();
                let mint_url = mint_url.clone();
                async move {
                    let mut retries = 3;
                    loop {
                        match client.restore_tokens(chunk.clone()).await {
                            Ok((o, s)) => return Some((o, s)),
                            Err(e) => {
                                let err_lower = e.to_string().to_lowercase();
                                if err_lower.contains("404") || err_lower.contains("not found") || err_lower.contains("unsupported") {
                                    println!("Mint {} does not support /v1/restore (NUT-13)", mint_url);
                                    return None;
                                }
                                retries -= 1;
                                if retries == 0 {
                                    println!("Restore failed for chunk on {} after 3 retries: {}", mint_url, e);
                                    return None;
                                }
                                println!("Restore chunk failed on {}, retrying... ({})", mint_url, e);
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            }
                        }
                    }
                }
            })
            .buffer_unordered(5); // 5 concurrent requests

        while let Some(res) = stream.next().await {
            if let Some((o, s)) = res {
                out_arr.extend(o);
                sig_arr.extend(s);
            }
        }

        if sig_arr.is_empty() {
            if let Some(tx) = &progress_tx {
                tx.send(format!("No tokens found on {}", mint_url)).ok();
            }
            println!("No tokens found on {}", mint_url);
            continue;
        }
        
        let _ = std::fs::write("/tmp/cashu_restore_sigs.json", serde_json::to_string_pretty(&sig_arr).unwrap_or_default());
        
        let mut restored_proofs = Vec::new();
        let mut ys = Vec::new();

        for (out_val, sig_val) in out_arr.iter().zip(sig_arr.iter()) {
            if let (Some(amt), Some(sig_id), Some(b_hex), Some(c_hex)) = (
                sig_val.get("amount").and_then(|a| a.as_u64()),
                sig_val.get("id").and_then(|i| i.as_str()),
                out_val.get("B_").and_then(|b| b.as_str()),
                sig_val.get("C_").and_then(|c| c.as_str()),
            ) {
                if let Some((secret, idx)) = session_map.get(&format!("{}_{}", b_hex, amt)) {
                    if let Ok(mint_pk) = point_from_hex(keyset.keys.get(&amt).unwrap_or(&String::new())) {
                        if let Ok(c_prime) = point_from_hex(c_hex) {
                            let dleq = crate::melt::parse_dleq(&sig_val);
                            let sess = BlindingSession::new(secret);
                            let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                            proof.derivation_index = *idx;
                            max_used_index = std::cmp::max(max_used_index, *idx as i64);
                            
                            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
                            ys.push(y);
                            restored_proofs.push(proof);
                        }
                    }
                }
            } else {
                println!("Failed to parse signature or matching B_ missing.");
            }
        }

        if restored_proofs.is_empty() {
            if let Some(tx) = &progress_tx {
                tx.send(format!("No tokens found on {}", mint_url)).ok();
            }
            println!("Failed to parse signatures or no matching B_ found.");
            continue;
        }

        // Check if spent in chunks
        let mut states = std::collections::HashMap::new();
        for chunk in ys.chunks(100) {
            if let Ok(st) = client.check_state(chunk).await {
                states.extend(st);
            }
        }
        
        let mut unspent = Vec::new();
        for proof in restored_proofs {
            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
            if states.get(&y).map(|s| s.as_str()) == Some("UNSPENT") {
                total_restored += proof.amount;
                unspent.push(proof);
            }
        }
        
        if !unspent.is_empty() {
            if let Some(tx) = &progress_tx {
                tx.send(format!("Restored {} unspent proofs from {}", unspent.len(), mint_url)).ok();
            }
            println!("Restored {} unspent proofs from {}", unspent.len(), mint_url);
            state.proofs.entry(mint_url.clone()).or_default().extend(unspent);
            if !state.mints.contains(&mint_url) {
                state.mints.push(mint_url.clone());
            }
        } else {
            if let Some(tx) = &progress_tx {
                tx.send(format!("No unspent proofs found on {}", mint_url)).ok();
            }
        }
    }
    
    if max_used_index >= 0 {
        // Update the global derivation index to the max seen + 1 so we don't reuse
        state.derivation_index = std::cmp::max(state.derivation_index, (max_used_index as u64) + 1);
        state.save_encrypted(wallet_path, passphrase)?;
    }

    Ok(total_restored)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CleanWalletResult {
    pub removed_sats: u64,
    pub restored_sats: u64,
    pub derivation_index: u64,
    pub cleaned_txs: usize,
}

/// Scans all proofs currently in the wallet and asks the mint for their state.
/// Removes any proofs that the mint reports as "SPENT".
/// Synchronizes and advances the derivation index to eliminate any output collisions.
pub async fn clean_wallet_proofs(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<CleanWalletResult> {
    let mut total_removed = 0;
    
    // 1. We need to iterate over all mints and their proofs to remove SPENT proofs
    if let Some(tx) = &progress_tx {
        tx.send("Checking wallet proof states with mints...".to_string()).ok();
    }
    for (mint_url, proofs) in state.proofs.clone().into_iter() {
        if proofs.is_empty() { continue; }
        
        if let Some(tx) = &progress_tx {
            tx.send(format!("Checking {} local proof(s) on {}", proofs.len(), mint_url)).ok();
        }
        let client = MintClient::new(&mint_url);
        
        // Collect Ys
        let mut ys = Vec::new();
        let mut y_to_secret = std::collections::HashMap::new();
        for p in &proofs {
            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
            ys.push(y.clone());
            y_to_secret.insert(y, p.secret.clone());
        }
        
        // Check state in chunks
        let mut states = std::collections::HashMap::new();
        for chunk in ys.chunks(100) {
            if let Ok(st) = client.check_state(chunk).await {
                states.extend(st);
            }
        }
        
        // Find spent secrets
        let mut spent_secrets = std::collections::HashSet::new();
        for (y, s) in states {
            if s == "SPENT" {
                if let Some(secret) = y_to_secret.get(&y) {
                    spent_secrets.insert(secret.clone());
                }
            }
        }
        
        // Remove spent proofs from state
        if !spent_secrets.is_empty() {
            let mut removed_for_mint = 0;
            if let Some(mint_proofs) = state.proofs.get_mut(&mint_url) {
                mint_proofs.retain(|p| {
                    if spent_secrets.contains(&p.secret) {
                        total_removed += p.amount;
                        removed_for_mint += p.amount;
                        false
                    } else {
                        true
                    }
                });
            }
            if let Some(tx) = &progress_tx {
                tx.send(format!("Removed {} spent proofs ({} sats) on {}", spent_secrets.len(), removed_for_mint, mint_url)).ok();
            }
        }
    }

    // 2. Clean up stuck Pending Send transactions where swap failed or aborted
    let mut cleaned_txs = 0;
    for tx in state.transactions.iter_mut() {
        if tx.status == ecash_core::types::TransactionStatus::Pending {
            match &tx.tx_type {
                ecash_core::types::TransactionType::Send(send_data) => {
                    // If token_string is empty, the swap never completed
                    if send_data.token_string.is_empty() {
                        tx.status = ecash_core::types::TransactionStatus::Failed;
                        cleaned_txs += 1;
                    }
                }
                _ => {}
            }
        }
    }
    if cleaned_txs > 0 {
        if let Some(tx) = &progress_tx {
            tx.send(format!("Cleared {} stuck pending send transaction(s)", cleaned_txs)).ok();
        }
    }

    // 3. Find the maximum derivation_index across all existing proofs in the wallet
    let max_proof_idx = state
        .proofs
        .values()
        .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
        .max()
        .unwrap_or(0);
    
    if max_proof_idx > 0 && state.derivation_index <= max_proof_idx {
        state.derivation_index = max_proof_idx + 1;
    }
    
    // 4. Run restore_from_mints to patch derivation_index and recover any missing unspent proofs
    let mint_urls = state.mints.clone();
    if let Some(tx) = &progress_tx {
        tx.send(format!("Scanning {} known mint(s) to recover tokens...", mint_urls.len())).ok();
    }
    let total_restored = restore_from_mints(state, wallet_path, passphrase, mint_urls, progress_tx.clone()).await.unwrap_or(0);

    // 5. Advance derivation index with a safety buffer (+25)
    // This leaps past any previously signed outputs at or near the current counter,
    // ensuring subsequent transactions will NEVER collide with "outputs already signed".
    let base_idx = std::cmp::max(state.derivation_index, max_proof_idx + 1);
    state.derivation_index = base_idx + 25;
    if let Some(tx) = &progress_tx {
        tx.send(format!("Derivation index advanced to {} (+25 safety buffer)", state.derivation_index)).ok();
    }

    // 6. Deduplicate proofs (since restore_from_mints might have added ones we already had)
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| {
            if seen.contains(&p.secret) {
                false
            } else {
                seen.insert(p.secret.clone());
                true
            }
        });
    }
    
    // 7. Save to disk with the fixed derivation index and clean proofs
    state.save_encrypted(wallet_path, passphrase)?;
    
    if let Some(tx) = &progress_tx {
        tx.send(format!("Wallet cleaned successfully! (+{} sats restored, -{} sats spent purged)", total_restored, total_removed)).ok();
    }

    Ok(CleanWalletResult {
        removed_sats: total_removed,
        restored_sats: total_restored,
        derivation_index: state.derivation_index,
        cleaned_txs,
    })
}
