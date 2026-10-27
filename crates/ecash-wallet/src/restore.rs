use anyhow::Result;
use ecash_core::{
    dhke::{point_from_hex, BlindingSession},
    derivation::TokenDerivation,
};
use crate::{
    state::WalletState,
    client::{MintClient, KeysetInfo},
};
use std::path::PathBuf;

pub async fn restore_from_mints(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_urls: Vec<String>,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<u64> {
    restore_from_mints_adaptive(state, wallet_path, passphrase, mint_urls, progress_tx).await
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
            Ok(ks) => {
                state.trusted_keys.insert(mint_url.clone(), ks.keys.clone());
                ks
            }
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

        // Process chunks sequentially with 750ms delay between chunks to avoid rate limiting
        let chunks: Vec<_> = output_json.chunks(200).map(|c| c.to_vec()).collect();
        for (chunk_idx, chunk) in chunks.into_iter().enumerate() {
            if chunk_idx > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(750)).await;
            }

            match client.restore_tokens(chunk).await {
                Ok((o, s)) => {
                    out_arr.extend(o);
                    sig_arr.extend(s);
                }
                Err(e) => {
                    let err_lower = e.to_string().to_lowercase();
                    if err_lower.contains("rate limit") || err_lower.contains("429") {
                        if let Some(tx) = &progress_tx {
                            tx.send(format!("Mint {} is rate limited (HTTP 429). Skipping further restore queries on this mint.", mint_url)).ok();
                        }
                        break;
                    }
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
        let mut keyset_cache: std::collections::HashMap<String, KeysetInfo> = std::collections::HashMap::new();
        keyset_cache.insert(keyset.id.clone(), keyset.clone());

        for (out_val, sig_val) in out_arr.iter().zip(sig_arr.iter()) {
            if let (Some(amt), Some(sig_id), Some(b_hex), Some(c_hex)) = (
                sig_val.get("amount").and_then(|a| a.as_u64()),
                sig_val.get("id").and_then(|i| i.as_str()),
                out_val.get("B_").and_then(|b| b.as_str()),
                sig_val.get("C_").and_then(|c| c.as_str()),
            ) {
                if let Some((secret, idx)) = session_map.get(&format!("{}_{}", b_hex, amt)) {
                    let sig_keyset = match keyset_cache.get(sig_id) {
                        Some(ks) => ks.clone(),
                        None => match client.fetch_keyset_by_id(sig_id).await {
                            Ok(ks) => {
                                keyset_cache.insert(sig_id.to_string(), ks.clone());
                                ks
                            }
                            Err(_) => keyset.clone(),
                        },
                    };
                    let mint_pk_str = sig_keyset.keys.get(&amt).or_else(|| keyset.keys.get(&amt));
                    if let Some(pk_str) = mint_pk_str {
                        if let Ok(mint_pk) = point_from_hex(pk_str) {
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

        let mut unspent = Vec::new();
        let mut replaced_count = 0;
        let existing_proofs = state.proofs.entry(mint_url.clone()).or_default();

        for proof in restored_proofs {
            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
            if states.get(&y).map(|s| s.as_str()) == Some("UNSPENT") {
                if let Some(existing_p) = existing_proofs.iter_mut().find(|p| p.secret == proof.secret) {
                    if existing_p.c != proof.c || existing_p.dleq.is_none() {
                        *existing_p = proof;
                        replaced_count += 1;
                    }
                } else {
                    total_restored += proof.amount;
                    unspent.push(proof);
                }
            }
        }

        if replaced_count > 0 {
            if let Some(tx) = &progress_tx {
                tx.send(format!("Healed {} broken proof(s) using verified mint signatures on {}", replaced_count, mint_url)).ok();
            }
        }

        if !unspent.is_empty() {
            let restored_amt: u64 = unspent.iter().map(|p| p.amount).sum();
            if let Some(tx) = &progress_tx {
                tx.send(format!("Restored {} new unspent proofs ({} sats) from {}", unspent.len(), restored_amt, mint_url)).ok();
            }
            println!("Restored {} new unspent proofs ({} sats) from {}", unspent.len(), restored_amt, mint_url);
            existing_proofs.extend(unspent);
            if !state.mints.contains(&mint_url) {
                state.mints.push(mint_url.clone());
            }
        } else if replaced_count == 0 {
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

/// Adaptively restores proofs from mints starting from index 0 across all denominations.
/// Uses a gap limit and batching (25 indices per batch) to scan however many outputs exist
/// without hitting mint rate limits. Replaces any broken proofs and adds missing unspent proofs.
pub async fn restore_from_mints_adaptive(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_urls: Vec<String>,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<u64> {
    let mut total_restored = 0;
    let mut max_used_index = -1_i64;

    for (mint_idx, raw_url) in mint_urls.into_iter().enumerate() {
        if mint_idx > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }

        let mint_url = crate::state::normalize_mint_url(&raw_url);
        if mint_url.is_empty() { continue; }

        let client = MintClient::new(&mint_url);
        let keyset = match client.fetch_keyset().await {
            Ok(ks) => {
                state.trusted_keys.insert(mint_url.clone(), ks.keys.clone());
                if !state.mints.contains(&mint_url) {
                    state.mints.push(mint_url.clone());
                }
                ks
            }
            Err(e) => {
                if let Some(tx) = &progress_tx {
                    tx.send(format!("Failed to connect to mint {}: {}", mint_url, e)).ok();
                }
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

        let max_known_proof_idx = state.proofs.get(&mint_url)
            .map(|ps| ps.iter().map(|p| p.derivation_index).max().unwrap_or(0))
            .unwrap_or(0);
        let mut scan_limit = std::cmp::max(
            std::cmp::max(state.derivation_index, max_known_proof_idx) + 30,
            75,
        );

        let mut batch_start = 0_u64;
        const BATCH_SIZE: u64 = 25;
        let mut mint_restored_sats = 0_u64;
        let mut mint_restored_count = 0_usize;
        let mut mint_healed_count = 0_usize;

        while batch_start <= scan_limit {
            let batch_end = batch_start + BATCH_SIZE - 1;

            let mut output_json = Vec::new();
            let mut session_map = std::collections::HashMap::new();

            for idx in batch_start..=batch_end {
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
                tx.send(format!(
                    "Scanning indices {}..{} ({} outputs) on {}...",
                    batch_start, batch_end, output_json.len(), mint_url
                )).ok();
            }

            let mut out_arr = Vec::new();
            let mut sig_arr = Vec::new();

            // Send in chunks of 200 with 750ms delay to protect mint from rate limiting
            let chunks: Vec<_> = output_json.chunks(200).map(|c| c.to_vec()).collect();
            let mut chunk_failed_or_unsupported = false;

            for (chunk_idx, chunk) in chunks.into_iter().enumerate() {
                if chunk_idx > 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(750)).await;
                }

                match client.restore_tokens(chunk).await {
                    Ok((o, s)) => {
                        out_arr.extend(o);
                        sig_arr.extend(s);
                    }
                    Err(e) => {
                        let err_lower = e.to_string().to_lowercase();
                        if err_lower.contains("rate limit") || err_lower.contains("429") {
                            if let Some(tx) = &progress_tx {
                                tx.send(format!("Mint {} is rate limited (HTTP 429). Skipping further restore queries on this mint.", mint_url)).ok();
                            }
                            chunk_failed_or_unsupported = true;
                            break;
                        }
                        if err_lower.contains("404") || err_lower.contains("not found") || err_lower.contains("unsupported") {
                            if let Some(tx) = &progress_tx {
                                tx.send(format!("Mint {} does not support /v1/restore (NUT-13)", mint_url)).ok();
                            }
                            chunk_failed_or_unsupported = true;
                            break;
                        }
                    }
                }
            }

            if chunk_failed_or_unsupported {
                break;
            }

            if !sig_arr.is_empty() {
                let mut batch_restored_proofs = Vec::new();
                let mut ys = Vec::new();
                let mut keyset_cache: std::collections::HashMap<String, KeysetInfo> = std::collections::HashMap::new();
                keyset_cache.insert(keyset.id.clone(), keyset.clone());

                for (out_val, sig_val) in out_arr.iter().zip(sig_arr.iter()) {
                    if let (Some(amt), Some(sig_id), Some(b_hex), Some(c_hex)) = (
                        sig_val.get("amount").and_then(|a| a.as_u64()),
                        sig_val.get("id").and_then(|i| i.as_str()),
                        out_val.get("B_").and_then(|b| b.as_str()),
                        sig_val.get("C_").and_then(|c| c.as_str()),
                    ) {
                        if let Some((secret, idx)) = session_map.get(&format!("{}_{}", b_hex, amt)) {
                            let sig_keyset = match keyset_cache.get(sig_id) {
                                Some(ks) => ks.clone(),
                                None => match client.fetch_keyset_by_id(sig_id).await {
                                    Ok(ks) => {
                                        keyset_cache.insert(sig_id.to_string(), ks.clone());
                                        ks
                                    }
                                    Err(_) => keyset.clone(),
                                },
                            };
                            let mint_pk_str = sig_keyset.keys.get(&amt).or_else(|| keyset.keys.get(&amt));
                            if let Some(pk_str) = mint_pk_str {
                                if let Ok(mint_pk) = point_from_hex(pk_str) {
                                    if let Ok(c_prime) = point_from_hex(c_hex) {
                                        let dleq = crate::melt::parse_dleq(&sig_val);
                                        let sess = BlindingSession::new(secret);
                                        let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                        proof.derivation_index = *idx;
                                        max_used_index = std::cmp::max(max_used_index, *idx as i64);

                                        // Extend scan limit past discovered index (gap limit)
                                        scan_limit = std::cmp::max(scan_limit, (*idx) + 35);

                                        let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
                                        ys.push(y);
                                        batch_restored_proofs.push(proof);
                                    }
                                }
                            }
                        }
                    }
                }

                if !batch_restored_proofs.is_empty() {
                    // Check spend state for restored proofs
                    let mut states = std::collections::HashMap::new();
                    for (chunk_idx, chunk) in ys.chunks(100).enumerate() {
                        if chunk_idx > 0 {
                            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                        }
                        if let Ok(st) = client.check_state(chunk).await {
                            states.extend(st);
                        }
                    }

                    let mut batch_unspent = Vec::new();
                    let existing_proofs = state.proofs.entry(mint_url.clone()).or_default();

                    for proof in batch_restored_proofs {
                        let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
                        if states.get(&y).map(|s| s.as_str()) == Some("UNSPENT") {
                            if let Some(existing_p) = existing_proofs.iter_mut().find(|p| p.secret == proof.secret) {
                                if existing_p.c != proof.c || existing_p.dleq.is_none() {
                                    *existing_p = proof;
                                    mint_healed_count += 1;
                                }
                            } else {
                                mint_restored_sats += proof.amount;
                                mint_restored_count += 1;
                                batch_unspent.push(proof);
                            }
                        }
                    }

                    if !batch_unspent.is_empty() {
                        let batch_sats: u64 = batch_unspent.iter().map(|p| p.amount).sum();
                        existing_proofs.extend(batch_unspent);
                        if let Some(tx) = &progress_tx {
                            tx.send(format!(
                                "Restored {} unspent proofs ({} sats) on {} (indices {}..{})",
                                mint_restored_count, batch_sats, mint_url, batch_start, batch_end
                            )).ok();
                        }
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            batch_start += BATCH_SIZE;

            // Safety limit to prevent unbounded execution
            if batch_start > 2000 {
                break;
            }
        }

        total_restored += mint_restored_sats;

        if mint_healed_count > 0 {
            if let Some(tx) = &progress_tx {
                tx.send(format!("Healed {} broken proof(s) on {}", mint_healed_count, mint_url)).ok();
            }
        }

        if mint_restored_count == 0 && mint_healed_count == 0 {
            if let Some(tx) = &progress_tx {
                tx.send(format!("No new unspent proofs found on {}", mint_url)).ok();
            }
        } else {
            if let Some(tx) = &progress_tx {
                tx.send(format!(
                    "Completed restore for {}: +{} sats unspent, {} broken proofs healed",
                    mint_url, mint_restored_sats, mint_healed_count
                )).ok();
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

    // 1. Gather all mints from known mints and proof maps
    let mut all_mints = state.mints.clone();
    for m in state.proofs.keys() {
        if !all_mints.contains(m) {
            all_mints.push(m.clone());
        }
    }

    if let Some(tx) = &progress_tx {
        tx.send(format!("Synchronizing with {} known mint(s)...", all_mints.len())).ok();
    }

    // 2. Fetch and cache keysets for ALL mints so healing and verification succeed
    for mint_url in &all_mints {
        let client = MintClient::new(mint_url);
        match client.fetch_keyset().await {
            Ok(keyset) => {
                state.trusted_keys.insert(mint_url.clone(), keyset.keys);
                if !state.mints.contains(mint_url) {
                    state.mints.push(mint_url.clone());
                }
            }
            Err(e) => {
                if let Some(tx) = &progress_tx {
                    tx.send(format!("Warning: Could not connect to {}: {}", mint_url, e)).ok();
                }
            }
        }
    }

    // 3. Deduplicate and auto-heal corrupt proofs across all mints using deterministic derivation
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| seen.insert(p.secret.clone()));
    }
    let healed_count = state.heal_corrupt_proofs();
    if healed_count > 0 {
        if let Some(tx) = &progress_tx {
            tx.send(format!("Auto-healed {} corrupted proof(s) using deterministic derivation", healed_count)).ok();
        }
    }

    // 4. Iterate over all mints and their proofs to verify state and remove SPENT / PENDING proofs
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

        // 4b. Remove any proofs with unknown keyset IDs on this mint
        if let Ok(all_keysets) = client.fetch_keysets().await {
            let active_keyset = client.fetch_keyset().await.ok();
            if let Some(mint_proofs) = state.proofs.get_mut(&mint_url) {
                let count_before = mint_proofs.len();
                mint_proofs.retain(|p| {
                    let known = all_keysets.iter().any(|ks| {
                        ks.id == p.id
                            || (p.id.starts_with("01") && ks.id.starts_with(&p.id))
                            || (ks.id.starts_with("01") && p.id.starts_with(&ks.id))
                    }) || active_keyset.as_ref().map(|k| k.id == p.id).unwrap_or(false);
                    if !known {
                        total_removed += p.amount;
                        false
                    } else {
                        true
                    }
                });
                let unknown_purged = count_before - mint_proofs.len();
                if unknown_purged > 0 {
                    if let Some(tx) = &progress_tx {
                        tx.send(format!("Purged {} fake/unknown keyset proof(s) on {}", unknown_purged, mint_url)).ok();
                    }
                }
            }
        }

        // 4c. Actively verify & consolidate proofs with the mint to purge unverified tokens
        let remaining_proofs = state.proofs.get(&mint_url).cloned().unwrap_or_default();
        if !remaining_proofs.is_empty() {
            let total_amt: u64 = remaining_proofs.iter().map(|p| p.amount).sum();
            let all_keysets = client.fetch_keysets().await.unwrap_or_default();
            let fee = crate::client::calculate_input_fee(&remaining_proofs, &all_keysets);
            if total_amt > fee {
                if let Some(tx) = &progress_tx {
                    tx.send(format!("Verifying and consolidating {} proof(s) on {}", remaining_proofs.len(), mint_url)).ok();
                }
                let desired = ecash_core::types::split_into_powers_of_2(total_amt - fee);
                match crate::swap::swap_proofs(
                    state,
                    wallet_path,
                    passphrase,
                    &mint_url,
                    remaining_proofs,
                    desired,
                    vec![],
                    None,
                ).await {
                    Ok(_) => {
                        println!("[clean_wallet] Successfully verified and consolidated proofs on {}", mint_url);
                    }
                    Err(e) => {
                        println!("[clean_wallet] Note on consolidating {}: {}", mint_url, e);
                    }
                }
            }
        }
    }

    // 5. Clean up stuck Pending Send transactions where swap failed or aborted
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

    // 6. Run adaptive full restore across all known mints
    // Starts from index 0 and uses gap limit to recover and heal however many outputs the mint holds
    let mint_urls = state.mints.clone();
    let total_restored = if !mint_urls.is_empty() {
        if let Some(tx) = &progress_tx {
            tx.send(format!("Scanning {} known mint(s) to recover unspent tokens and heal broken proofs...", mint_urls.len())).ok();
        }
        restore_from_mints_adaptive(state, wallet_path, passphrase, mint_urls, progress_tx.clone()).await.unwrap_or(0)
    } else {
        0
    };

    // 7. Find maximum derivation index across all proofs and advance safely past it
    let max_proof_idx = state
        .proofs
        .values()
        .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
        .max()
        .unwrap_or(0);

    let min_safe_idx = max_proof_idx + 1;
    if state.derivation_index < min_safe_idx || state.derivation_index > min_safe_idx + 35 {
        state.derivation_index = min_safe_idx + 15;
        if let Some(tx) = &progress_tx {
            tx.send(format!("Derivation index safely normalized to {}", state.derivation_index)).ok();
        }
    }

    // 8. Final deduplication and heal pass
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| seen.insert(p.secret.clone()));
    }
    state.heal_corrupt_proofs();

    // 9. Save encrypted wallet to disk
    state.save_encrypted(wallet_path, passphrase)?;

    if let Some(tx) = &progress_tx {
        tx.send(format!("Wallet clean complete! (+{} sats restored, -{} sats spent purged)", total_restored, total_removed)).ok();
    }

    Ok(CleanWalletResult {
        removed_sats: total_removed,
        restored_sats: total_restored,
        derivation_index: state.derivation_index,
        cleaned_txs,
    })
}
