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
            Ok(ks) => ks,
            Err(e) => {
                println!("Failed to fetch keyset for {}: {}", mint_url, e);
                continue;
            }
        };
        if let Ok(all) = client.fetch_all_keysets().await {
            state.cache_mint_keys(&mint_url, all);
        } else {
            // Best-effort fallback: cache only the active keyset.
            state.cache_mint_keys(
                &mint_url,
                std::collections::HashMap::from([(keyset.id.clone(), keyset.keys.clone())]),
            );
        }

        let mut output_json = Vec::new();
        // Keep track of session info to unblind later.
        let mut session_map = std::collections::HashMap::new();
        let deriv = TokenDerivation::from_hex(&state.seed_hex)?;

        // Generate secrets for indices start_idx..=end_idx (both seed-derived r and legacy fallback).
        // Send exactly ONE BlindedMessage per unique B_ so outputs and signatures stay 1-to-1.
        for idx in start_idx..=end_idx {
            for sess in [deriv.session_at(idx), deriv.session_at_legacy(idx)] {
                let b_hex = sess.b_prime_hex();
                let sess_hex = sess.to_session_hex();

                if session_map.contains_key(&b_hex) {
                    continue;
                }
                output_json.push(serde_json::json!({
                    "amount": 1,
                    "id": keyset.id,
                    "B_": b_hex.clone()
                }));
                session_map.insert(b_hex, (sess_hex, idx));
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

        let mut restored_proofs = Vec::new();
        let mut seen_restored_secrets = std::collections::HashSet::new();
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
                    if let (Ok(mint_pk), Ok(c_prime)) = (point_from_hex(pk_str), point_from_hex(c_hex)) {
                        let dleq = crate::melt::parse_dleq(&sig_val);

                        // Match by B_ first; if DLEQ is present and fails (e.g. mint reordered array), find matching session via DLEQ
                        let mut matched_session = session_map.get(b_hex).cloned();
                        if let (Some((ref sess_str, _)), Some(ref dleq_val)) = (&matched_session, &dleq) {
                            let cand = BlindingSession::new(sess_str);
                            if !ecash_core::dhke::verify_dleq(&mint_pk, &c_prime, &cand.b_prime, dleq_val) {
                                matched_session = None;
                            }
                        }
                        if matched_session.is_none() {
                            if let Some(ref dleq_val) = dleq {
                                for (cand_sess_str, cand_idx) in session_map.values() {
                                    let cand = BlindingSession::new(cand_sess_str);
                                    if ecash_core::dhke::verify_dleq(&mint_pk, &c_prime, &cand.b_prime, dleq_val) {
                                        matched_session = Some((cand_sess_str.clone(), *cand_idx));
                                        break;
                                    }
                                }
                            }
                        }

                        if let Some((secret, idx)) = matched_session {
                            let sess = BlindingSession::new(&secret);
                            let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                            proof.derivation_index = idx;
                            max_used_index = std::cmp::max(max_used_index, idx as i64);

                            if seen_restored_secrets.insert(proof.secret.clone()) {
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
        state.normalize_proofs_for_persistence();
        state.save_encrypted(wallet_path, passphrase)?;
    }

    Ok(total_restored)
}

/// Plan non-overlapping `(start, end)` inclusive index batches covering `0..=scan_limit`,
/// prioritizing the recent window around `recent_anchor` first so recently dropped proofs
/// are recovered in the very first request(s) before a mint's rate limit can trigger.
fn plan_initial_restore_batches(
    recent_anchor: u64,
    scan_limit: u64,
    batch_size: u64,
) -> Vec<(u64, u64)> {
    let step = batch_size.max(1);
    let mut batches = Vec::new();

    let push_range = |out: &mut Vec<(u64, u64)>, from: u64, to: u64| {
        if from > to {
            return;
        }
        let mut cursor = from;
        while cursor <= to {
            let end = std::cmp::min(cursor.saturating_add(step - 1), to);
            out.push((cursor, end));
            if end == u64::MAX {
                break;
            }
            cursor = end + 1;
        }
    };

    let recent_start = recent_anchor.saturating_sub(step);
    let recent_end = std::cmp::min(scan_limit, recent_anchor.saturating_add(step - 1));

    // 1. Scan around the current derivation index first (1-2 requests).
    push_range(&mut batches, recent_start, recent_end);
    // 2. Scan older history below the recent window.
    if recent_start > 0 {
        push_range(&mut batches, 0, recent_start - 1);
    }
    // 3. Scan any remaining range above the recent window up to scan_limit.
    if recent_end < scan_limit {
        push_range(&mut batches, recent_end + 1, scan_limit);
    }

    batches
}

/// Adaptively restores proofs from mints across all denominations.
/// Scans the recent window around `derivation_index` first using 100-index batches (200 outputs
/// per `/v1/restore` call) to minimize HTTP requests and avoid mint rate limits, persists
/// recovered proofs incrementally, and extends the scan window whenever signatures are found.
pub async fn restore_from_mints_adaptive(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_urls: Vec<String>,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<u64> {
    const BATCH_SIZE: u64 = 100;
    const GAP_EXTENSION: u64 = 100;
    const MAX_SCAN_INDEX: u64 = 5000;

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
                match client.fetch_all_keysets().await {
                    Ok(all) => state.cache_mint_keys(&mint_url, all),
                    Err(_) => state.cache_mint_keys(
                        &mint_url,
                        std::collections::HashMap::from([(ks.id.clone(), ks.keys.clone())]),
                    ),
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

        let max_known_proof_idx = state.proofs.get(&mint_url)
            .map(|ps| ps.iter().map(|p| p.derivation_index).max().unwrap_or(0))
            .unwrap_or(0);
        let recent_anchor = std::cmp::max(state.derivation_index, max_known_proof_idx);
        let initial_scan_limit = std::cmp::min(
            std::cmp::max(recent_anchor + GAP_EXTENSION, BATCH_SIZE - 1),
            MAX_SCAN_INDEX,
        );
        let mut highest_queued = initial_scan_limit;
        let mut pending_batches: std::collections::VecDeque<(u64, u64)> =
            plan_initial_restore_batches(recent_anchor, initial_scan_limit, BATCH_SIZE).into();

        let mut mint_restored_sats = 0_u64;
        let mut mint_restored_count = 0_usize;
        let mut mint_healed_count = 0_usize;
        let mut batch_number = 0_usize;

        while let Some((batch_start, batch_end)) = pending_batches.pop_front() {
            if batch_number > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            }
            batch_number += 1;

            let mut output_json = Vec::new();
            let mut session_map = std::collections::HashMap::new();
            let deriv = TokenDerivation::from_hex(&state.seed_hex)?;

            for idx in batch_start..=batch_end {
                for sess in [deriv.session_at(idx), deriv.session_at_legacy(idx)] {
                    let b_hex = sess.b_prime_hex();
                    let sess_hex = sess.to_session_hex();

                    if session_map.contains_key(&b_hex) {
                        continue;
                    }
                    output_json.push(serde_json::json!({
                        "amount": 1,
                        "id": keyset.id,
                        "B_": b_hex.clone()
                    }));
                    session_map.insert(b_hex, (sess_hex, idx));
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
                let mut seen_batch_secrets = std::collections::HashSet::new();
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
                            if let (Ok(mint_pk), Ok(c_prime)) = (point_from_hex(pk_str), point_from_hex(c_hex)) {
                                let dleq = crate::melt::parse_dleq(&sig_val);

                                // Match by B_ first; if DLEQ is present and fails (e.g. mint reordered array), find matching session via DLEQ
                                let mut matched_session = session_map.get(b_hex).cloned();
                                if let (Some((ref sess_str, _)), Some(ref dleq_val)) = (&matched_session, &dleq) {
                                    let cand = BlindingSession::new(sess_str);
                                    if !ecash_core::dhke::verify_dleq(&mint_pk, &c_prime, &cand.b_prime, dleq_val) {
                                        matched_session = None;
                                    }
                                }
                                if matched_session.is_none() {
                                    if let Some(ref dleq_val) = dleq {
                                        for (cand_sess_str, cand_idx) in session_map.values() {
                                            let cand = BlindingSession::new(cand_sess_str);
                                            if ecash_core::dhke::verify_dleq(&mint_pk, &c_prime, &cand.b_prime, dleq_val) {
                                                matched_session = Some((cand_sess_str.clone(), *cand_idx));
                                                break;
                                            }
                                        }
                                    }
                                }

                                if let Some((secret, idx)) = matched_session {
                                    let sess = BlindingSession::new(&secret);
                                    let mut proof = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                    proof.derivation_index = idx;
                                    max_used_index = std::cmp::max(max_used_index, idx as i64);

                                    // Extend scan limit past discovered index (gap limit)
                                    let desired_limit = std::cmp::min(idx + GAP_EXTENSION, MAX_SCAN_INDEX);
                                    if desired_limit > highest_queued {
                                        let mut cursor = highest_queued + 1;
                                        while cursor <= desired_limit {
                                            let end = std::cmp::min(cursor + BATCH_SIZE - 1, desired_limit);
                                            pending_batches.push_back((cursor, end));
                                            cursor = end + 1;
                                        }
                                        highest_queued = desired_limit;
                                    }

                                    if seen_batch_secrets.insert(proof.secret.clone()) {
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

                    let mut batch_healed = 0_usize;
                    for proof in batch_restored_proofs {
                        let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()));
                        if states.get(&y).map(|s| s.as_str()) == Some("UNSPENT") {
                            if let Some(existing_p) = existing_proofs.iter_mut().find(|p| p.secret == proof.secret) {
                                if existing_p.c != proof.c || existing_p.dleq.is_none() {
                                    *existing_p = proof;
                                    mint_healed_count += 1;
                                    batch_healed += 1;
                                }
                            } else {
                                mint_restored_sats += proof.amount;
                                mint_restored_count += 1;
                                batch_unspent.push(proof);
                            }
                        }
                    }

                    let batch_found_unspent = !batch_unspent.is_empty();
                    if batch_found_unspent {
                        let batch_sats: u64 = batch_unspent.iter().map(|p| p.amount).sum();
                        existing_proofs.extend(batch_unspent);
                        if !state.mints.contains(&mint_url) {
                            state.mints.push(mint_url.clone());
                        }
                        if let Some(tx) = &progress_tx {
                            tx.send(format!(
                                "Restored {} unspent proofs ({} sats) on {} (indices {}..{})",
                                mint_restored_count, batch_sats, mint_url, batch_start, batch_end
                            )).ok();
                        }
                    }

                    // Persist incrementally so recovered proofs survive later rate limits or disconnects.
                    if batch_found_unspent || batch_healed > 0 {
                        if max_used_index >= 0 {
                            state.derivation_index =
                                std::cmp::max(state.derivation_index, (max_used_index as u64) + 1);
                        }
                        state.normalize_proofs_for_persistence();
                        state.save_encrypted(wallet_path, passphrase)?;
                    }
                }
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
        state.normalize_proofs_for_persistence();
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
    let mut refreshed_mints: std::collections::HashSet<String> = std::collections::HashSet::new();

    for mint_url in &all_mints {
        let client = MintClient::new(mint_url);
        match client.fetch_all_keysets().await {
            Ok(all) => {
                state.cache_mint_keys(mint_url, all);
                refreshed_mints.insert(mint_url.clone());   // ← add this
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

        
        // 4b. Remove any proofs with unknown keyset IDs on this mint.
        //     Only safe if we actually refreshed this mint's keyset list in
        //     step 2 — otherwise the cache may be stale and "unknown" could
        //     mean "known to the mint but missing from our cache", which
        //     would silently destroy real proofs.
        if !refreshed_mints.contains(&mint_url) {
            tracing::warn!(
                "Skipping unknown-keyset purge for {} — keyset cache not refreshed this run",
                mint_url
            );
        } else if let Some(all_keysets) = state.trusted_keys.get(&mint_url).cloned() {
            if let Some(mint_proofs) = state.proofs.get_mut(&mint_url) {
                let count_before = mint_proofs.len();
                mint_proofs.retain(|p| {
                    let pid = p.id.as_str();
                    let known = all_keysets.contains_key(pid)
                        || all_keysets.keys().any(|k| {
                            let k = k.as_str();
                            (pid.starts_with("01") && k.starts_with(pid))
                                || (k.starts_with("01") && pid.starts_with(k))
                        });
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
                        tx.send(format!(
                            "Purged {} fake/unknown keyset proof(s) on {}",
                            unknown_purged, mint_url
                        ))
                        .ok();
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

    // 7. Final heal, deduplication, and authoritative spend-state check on all remaining proofs
    state.heal_corrupt_proofs();
    for (_, proofs) in state.proofs.iter_mut() {
        let mut seen = std::collections::HashSet::new();
        proofs.retain(|p| seen.insert(p.secret.clone()));
    }

    for (mint_url, proofs) in state.proofs.clone().into_iter() {
        if proofs.is_empty() { continue; }
        let client = MintClient::new(&mint_url);
        let mut ys = Vec::new();
        let mut y_to_secret = std::collections::HashMap::new();
        for p in &proofs {
            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
            ys.push(y.clone());
            y_to_secret.insert(y, p.secret.clone());
        }
        let mut states = std::collections::HashMap::new();
        for (chunk_idx, chunk) in ys.chunks(100).enumerate() {
            if chunk_idx > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
            if let Ok(st) = client.check_state(chunk).await {
                states.extend(st);
            }
        }
        let mut newly_found_spent = std::collections::HashSet::new();
        for (y, s) in states {
            if s == "SPENT" || s == "PENDING" {
                if let Some(secret) = y_to_secret.get(&y) {
                    newly_found_spent.insert(secret.clone());
                }
            }
        }
        if !newly_found_spent.is_empty() {
            if let Some(mint_proofs) = state.proofs.get_mut(&mint_url) {
                mint_proofs.retain(|p| {
                    if newly_found_spent.contains(&p.secret) {
                        total_removed += p.amount;
                        false
                    } else {
                        true
                    }
                });
            }
        }
    }

    // 8. Find maximum derivation index across all proofs and ensure derivation_index never regresses.
    // Never shrink derivation_index downward: lowering it risks output collisions and truncating
    // future NUT-09 restore scans if an earlier scan was rate-limited.
    let max_proof_idx = state
        .proofs
        .values()
        .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
        .max()
        .unwrap_or(0);

    let min_safe_idx = max_proof_idx + 1;
    if state.derivation_index < min_safe_idx {
        state.derivation_index = min_safe_idx;
        if let Some(tx) = &progress_tx {
            tx.send(format!("Derivation index advanced to {}", state.derivation_index)).ok();
        }
    }

    // 9. Save encrypted wallet to disk
    state.normalize_proofs_for_persistence();
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

#[cfg(test)]
mod tests {
    use super::plan_initial_restore_batches;

    #[test]
    fn recent_window_is_scanned_first_without_overlap_or_gaps() {
        let batches = plan_initial_restore_batches(350, 450, 100);
        // First batches cover [250..=449] around anchor 350.
        assert_eq!(batches[0], (250, 349));
        assert_eq!(batches[1], (350, 449));

        // Verify every index in 0..=450 is covered exactly once.
        let mut covered = vec![0u32; 451];
        for (start, end) in &batches {
            assert!(start <= end);
            assert!(end - start < 100);
            for idx in *start..=*end {
                covered[idx as usize] += 1;
            }
        }
        assert!(covered.iter().all(|&count| count == 1));
    }

    #[test]
    fn small_anchor_covers_zero_to_limit_in_single_batch() {
        let batches = plan_initial_restore_batches(20, 99, 100);
        assert_eq!(batches, vec![(0, 99)]);
    }
}
