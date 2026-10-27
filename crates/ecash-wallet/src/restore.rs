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
    let scan_limit = std::cmp::max(100_u64, state.derivation_index + 50);
    restore_from_mints_range(state, wallet_path, passphrase, mint_urls, 0, scan_limit, progress_tx).await
}

pub async fn restore_from_mints_range(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_urls: Vec<String>,
    start_idx: u64,
    end_idx: u64,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<u64> {
    let mut total_restored = 0;
    let mut max_used_index = -1_i64;

    for (mint_idx, raw_url) in mint_urls.into_iter().enumerate() {
        if mint_idx > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }

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

        // Filter denominations up to 1M sats (~$650 USD). Eliminates huge unused denominations (2M to 67M sats)
        // to dramatically reduce output count while covering all real-world ecash splits.
        let mut target_amounts: Vec<u64> = keyset
            .keys
            .keys()
            .filter(|&&amt| amt <= 1_048_576)
            .cloned()
            .collect();
        target_amounts.sort_unstable();

        let mut output_json = Vec::new();
        // Keep track of session info to unblind later.
        let mut session_map = std::collections::HashMap::new();

        // Generate secrets for indices start_idx..=end_idx
        for idx in start_idx..=end_idx {
            let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
            deriv.index = idx;
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            let b_hex = sess.b_prime_hex();

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

        // Process chunks sequentially with 150ms delay between chunks to avoid rate limiting
        let chunks: Vec<_> = output_json.chunks(100).map(|c| c.to_vec()).collect();
        for (chunk_idx, chunk) in chunks.into_iter().enumerate() {
            if chunk_idx > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }

            match client.restore_tokens(chunk).await {
                Ok((o, s)) => {
                    out_arr.extend(o);
                    sig_arr.extend(s);
                }
                Err(e) => {
                    let err_lower = e.to_string().to_lowercase();
                    if err_lower.contains("404") || err_lower.contains("not found") || err_lower.contains("unsupported") {
                        println!("Mint {} does not support /v1/restore (NUT-13)", mint_url);
                        break;
                    }
                    println!("Restore chunk failed on {}: {}", mint_url, e);
                }
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

        // Check if spent in chunks with 150ms delay
        let mut states = std::collections::HashMap::new();
        for (chunk_idx, chunk) in ys.chunks(100).enumerate() {
            if chunk_idx > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
            if let Ok(st) = client.check_state(chunk).await {
                states.extend(st);
            }
        }

        let existing_secrets: std::collections::HashSet<String> = state.proofs
            .get(&mint_url)
            .map(|ps| ps.iter().map(|p| p.secret.clone()).collect())
            .unwrap_or_default();

        let mut unspent = Vec::new();
        for proof in restored_proofs {
            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
            if states.get(&y).map(|s| s.as_str()) == Some("UNSPENT") {
                // Only keep and count proofs that do NOT already exist in the wallet
                if !existing_secrets.contains(&proof.secret) {
                    total_restored += proof.amount;
                    unspent.push(proof);
                }
            }
        }

        if !unspent.is_empty() {
            let restored_amt: u64 = unspent.iter().map(|p| p.amount).sum();
            if let Some(tx) = &progress_tx {
                tx.send(format!("Restored {} new unspent proofs ({} sats) from {}", unspent.len(), restored_amt, mint_url)).ok();
            }
            println!("Restored {} new unspent proofs ({} sats) from {}", unspent.len(), restored_amt, mint_url);
            state.proofs.entry(mint_url.clone()).or_default().extend(unspent);
            if !state.mints.contains(&mint_url) {
                state.mints.push(mint_url.clone());
            }
        } else {
            if let Some(tx) = &progress_tx {
                tx.send(format!("No new unspent proofs found on {}", mint_url)).ok();
            }
        }
    }

    // Global deduplication across all mints
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| seen.insert(p.secret.clone()));
    }

    if max_used_index >= 0 {
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

    // 0. Deduplicate proofs across all mints and auto-heal corrupt proofs
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| seen.insert(p.secret.clone()));
    }
    state.heal_corrupt_proofs();

    // 1. Iterate over all mints and their proofs to remove SPENT proofs
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

        // Check state in chunks with 150ms delay
        let mut states = std::collections::HashMap::new();
        for (chunk_idx, chunk) in ys.chunks(100).enumerate() {
            if chunk_idx > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
            if let Ok(st) = client.check_state(chunk).await {
                states.extend(st);
            }
        }

        // Find spent or stuck pending secrets
        let mut spent_secrets = std::collections::HashSet::new();
        for (y, s) in states {
            if s == "SPENT" || s == "PENDING" {
                if let Some(secret) = y_to_secret.get(&y) {
                    spent_secrets.insert(secret.clone());
                }
            }
        }

        // Remove spent/pending proofs from state
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
                tx.send(format!("Removed {} spent/pending proofs ({} sats) on {}", spent_secrets.len(), removed_for_mint, mint_url)).ok();
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

    // 4. Run scoped restore to recover any recently unspent proofs that might have dropped mid-flight
    let mint_urls = state.mints.clone();
    let total_restored = if !mint_urls.is_empty() {
        let start_idx = state.derivation_index.saturating_sub(40);
        let end_idx = state.derivation_index + 15;
        if let Some(tx) = &progress_tx {
            tx.send(format!("Scanning {} known mint(s) for dropped tokens (indices {}..{})...", mint_urls.len(), start_idx, end_idx)).ok();
        }
        restore_from_mints_range(state, wallet_path, passphrase, mint_urls, start_idx, end_idx, progress_tx.clone()).await.unwrap_or(0)
    } else {
        0
    };

    // 5. Advance or normalize derivation index safely
    let min_safe_idx = max_proof_idx + 1;
    if state.derivation_index < min_safe_idx || state.derivation_index > min_safe_idx + 25 {
        state.derivation_index = min_safe_idx + 10;
        if let Some(tx) = &progress_tx {
            tx.send(format!("Derivation index safely normalized to {}", state.derivation_index)).ok();
        }
    }

    // 6. Deduplicate proofs (since restore might have added ones we already had)
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
