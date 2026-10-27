use anyhow::{anyhow, Result};
use ecash_core::{
    dhke::{point_from_hex, verify_dleq, BlindingSession},
    types::Proof,
    derivation::TokenDerivation,
};
use crate::{
    state::WalletState,
    client::{MintClient, KeysetInfo, KeysetSummary},
};
use std::path::PathBuf;

/// Swap proofs for new proofs of a specific set of output denominations.
///
/// This is an internal function that:
/// 1. Submits the `inputs` proofs to the mint via `/v1/swap`.
/// 2. Requests new blinded messages for `desired_amounts` and `change_amounts`.
/// 3. Unblinds the returned signatures and updates the wallet state.
///
/// Returns the new `Proof`s generated for `desired_amounts`.
/// The new `change_amounts` proofs are added directly to the wallet state.
pub async fn swap_proofs(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    mint_url: &str,
    mut inputs: Vec<Proof>,
    mut desired_amounts: Vec<u64>,
    mut change_amounts: Vec<u64>,
    target_pubkey: Option<String>,
) -> Result<Vec<Proof>> {
    let client = MintClient::new(mint_url);
    let keyset = client.fetch_keyset().await?;
    let all_keysets = client.fetch_keysets().await.unwrap_or_default();

    // Resolve short keyset IDs (s_id) per NUT-00 v4
    // If an input proof has an 8-byte / 16-hex short keyset ID (especially starting with "01"),
    // expand it to the matching full 33-byte / 66-hex keyset ID known by the mint.
    for p in &mut inputs {
        if p.id.starts_with("01") && p.id.len() < 66 {
            if let Some(matching) = all_keysets.iter().find(|ks| ks.id.starts_with(&p.id)) {
                p.id = matching.id.clone();
            } else if keyset.id.starts_with(&p.id) {
                p.id = keyset.id.clone();
            }
        } else if p.id.len() < 16 {
            if let Some(matching) = all_keysets.iter().find(|ks| ks.id.starts_with(&p.id)) {
                p.id = matching.id.clone();
            }
        }
    }

    // Create inputs JSON
    let mut input_json = Vec::new();
    let mut input_secrets = std::collections::HashSet::new();
    for p in &inputs {
        let mut val = serde_json::to_value(p)?;
        
        if let Some(obj) = val.as_object_mut() {
            obj.remove("derivation_index");
            obj.remove("B_");
            obj.remove("C_");
            obj.remove("dleq");

            // Handle P2PK locked tokens
            let is_p2pk = if let Ok(val) = serde_json::from_str::<serde_json::Value>(&p.secret) {
                val.as_array().and_then(|a| a.get(0)).and_then(|k| k.as_str()) == Some("P2PK")
            } else {
                p.secret.contains("\"P2PK\"")
            };

            if is_p2pk {
                let nostr_key = state.get_nostr_privkey();
                if let Some(privkey_hex) = nostr_key {
                    use k256::schnorr::signature::Signer;

                    let privkey_bytes = hex::decode(privkey_hex)
                        .map_err(|e| anyhow::anyhow!("Invalid hex in nostr private key: {}", e))?;
                    
                    let signing_key = k256::schnorr::SigningKey::from_bytes(privkey_bytes.as_slice())
                        .map_err(|_| anyhow::anyhow!("Invalid nostr private key bytes"))?;

                    let my_xonly = hex::encode(signing_key.verifying_key().to_bytes()).to_lowercase();

                    // Parse the P2PK spending condition to inspect authorized keys and threshold
                    let mut authorized_pks = Vec::new();
                    let mut refund_pks = Vec::new();
                    let mut n_sigs = 1;
                    let mut locktime: Option<u64> = None;

                    let normalize_xonly = |pk: &str| -> String {
                        let s = pk.trim().to_lowercase();
                        if s.len() == 66 && (s.starts_with("02") || s.starts_with("03")) {
                            s[2..].to_string()
                        } else {
                            s
                        }
                    };

                    if let Ok(sec_val) = serde_json::from_str::<serde_json::Value>(&p.secret) {
                        if let Some(payload) = sec_val.as_array().and_then(|a| a.get(1)) {
                            if let Some(data_pk) = payload.get("data").and_then(|d| d.as_str()) {
                                authorized_pks.push(normalize_xonly(data_pk));
                            }

                            if let Some(tags) = payload.get("tags").and_then(|t| t.as_array()) {
                                for tag in tags {
                                    if let Some(tag_arr) = tag.as_array() {
                                        if let Some(tag_name) = tag_arr.get(0).and_then(|n| n.as_str()) {
                                            if tag_name == "pubkeys" {
                                                for pk_val in &tag_arr[1..] {
                                                    if let Some(pk_str) = pk_val.as_str() {
                                                        authorized_pks.push(normalize_xonly(pk_str));
                                                    }
                                                }
                                            } else if tag_name == "refund" {
                                                for pk_val in &tag_arr[1..] {
                                                    if let Some(pk_str) = pk_val.as_str() {
                                                        refund_pks.push(normalize_xonly(pk_str));
                                                    }
                                                }
                                            } else if tag_name == "n_sigs" {
                                                if let Some(n_val) = tag_arr.get(1) {
                                                    if let Some(n_int) = n_val.as_u64() {
                                                        n_sigs = n_int as usize;
                                                    } else if let Some(n_str) = n_val.as_str() {
                                                        n_sigs = n_str.parse::<usize>().unwrap_or(1);
                                                    }
                                                }
                                            } else if tag_name == "locktime" {
                                                if let Some(lt_val) = tag_arr.get(1) {
                                                    if let Some(lt_int) = lt_val.as_u64() {
                                                        locktime = Some(lt_int);
                                                    } else if let Some(lt_str) = lt_val.as_str() {
                                                        locktime = lt_str.parse::<u64>().ok();
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Check if current time has passed locktime
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let locktime_passed = locktime.map(|lt| now > lt).unwrap_or(false);

                    let is_authorized = authorized_pks.contains(&my_xonly)
                        || (locktime_passed && refund_pks.contains(&my_xonly));

                    if !authorized_pks.is_empty() && !is_authorized {
                        return Err(anyhow::anyhow!(
                            "Cannot unlock P2PK ecash: Token is locked to public key(s) {:?}, but your wallet Nostr public key is {}",
                            authorized_pks,
                            my_xonly
                        ));
                    }

                    // Compute BIP-340 Schnorr signature on SHA-256 hash (NUT-11 specification)
                    use k256::sha2::{Sha256, Digest};
                    let msg_hash = Sha256::digest(p.secret.as_bytes());
                    let sig_hash: k256::schnorr::Signature = signing_key.sign(&msg_hash);
                    let sig_hash_hex = hex::encode(sig_hash.to_bytes());

                    // Also compute raw secret signature for compatibility with mints that sign raw
                    let sig_raw: k256::schnorr::Signature = signing_key.sign(p.secret.as_bytes());
                    let sig_raw_hex = hex::encode(sig_raw.to_bytes());

                    // Preserve existing signatures from witness if present, and append our signature
                    let mut signatures = Vec::new();
                    if let Some(ref existing_witness) = p.witness {
                        if let Some(s) = existing_witness.as_str() {
                            if let Ok(w_val) = serde_json::from_str::<serde_json::Value>(s) {
                                if let Some(arr) = w_val.get("signatures").and_then(|a| a.as_array()) {
                                    for item in arr {
                                        if let Some(sig_str) = item.as_str() {
                                            signatures.push(sig_str.to_string());
                                        }
                                    }
                                }
                            }
                        } else if let Some(arr) = existing_witness.get("signatures").and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(sig_str) = item.as_str() {
                                    signatures.push(sig_str.to_string());
                                }
                            }
                        }
                    }

                    if !signatures.contains(&sig_hash_hex) {
                        signatures.push(sig_hash_hex);
                    }
                    if !signatures.contains(&sig_raw_hex) {
                        signatures.push(sig_raw_hex);
                    }

                    if signatures.len() < n_sigs {
                        return Err(anyhow::anyhow!(
                            "Cannot unlock ecash: Token requires {} signatures (multisig threshold), but only {} signature(s) are available. Co-signers must sign before redeeming.",
                            n_sigs,
                            signatures.len()
                        ));
                    }

                    let witness_obj = serde_json::json!({
                        "signatures": signatures
                    });

                    obj.insert("witness".to_string(), serde_json::Value::String(witness_obj.to_string()));
                } else {
                    return Err(anyhow::anyhow!("Cannot spend P2PK locked ecash: No Nostr private key configured. Go to Settings > Nostr to configure it."));
                }
            }
        }
        input_json.push(val);
        input_secrets.insert(p.secret.clone());
    }

    // Ensure derivation_index is at least higher than any existing proof's derivation index
    let max_proof_idx = state
        .proofs
        .values()
        .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
        .max()
        .unwrap_or(0);
    if max_proof_idx > 0 && state.derivation_index <= max_proof_idx {
        state.derivation_index = max_proof_idx + 1;
    }

    // Calculate mint input fees per NUT-02 / NUT-03
    let fee = crate::client::calculate_input_fee(&inputs, &all_keysets);
    let total_input: u64 = inputs.iter().map(|p| p.amount).sum();
    let max_output = total_input.saturating_sub(fee);
    let mut total_desired: u64 = desired_amounts.iter().sum();

    // If caller wants to swap all tokens (e.g. receiving/claiming ecash where desired == total_input and change is empty),
    // adjust desired_amounts to max_output (total_input - fee).
    if total_desired == total_input && change_amounts.is_empty() && max_output > 0 && max_output != total_desired {
        desired_amounts = ecash_core::types::split_into_powers_of_2(max_output);
        total_desired = max_output;
    }

    if total_desired > max_output {
        return Err(anyhow!(
            "Input proofs ({} sats) minus mint fee ({} sats) = {} sats cannot cover desired {} sats",
            total_input, fee, max_output, total_desired
        ));
    }

    // Always ensure outputs exactly equal max_output (total_input - fee)
    let current_change: u64 = change_amounts.iter().sum();
    if total_desired + current_change != max_output {
        let balanced_change = max_output - total_desired;
        if balanced_change > 0 {
            change_amounts = ecash_core::types::split_into_powers_of_2(balanced_change);
        } else {
            change_amounts.clear();
        }
    }

    let mut attempts = 0;
    let (sigs, sessions) = loop {
        attempts += 1;

        // Set up blinding sessions for outputs
        let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
        deriv.index = state.derivation_index;

        let mut current_sessions = Vec::new();
        let mut output_json = Vec::new();

        // First do desired amounts
        for &amt in &desired_amounts {
            let index = deriv.index;
            let mut secret = deriv.next_secret();
            if let Some(ref pubkey) = target_pubkey {
                let mut nonce = [0u8; 16];
                rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut nonce);
                
                let normalized_pubkey = if pubkey.len() == 64 {
                    format!("02{}", pubkey)
                } else {
                    pubkey.clone()
                };

                secret = serde_json::json!([
                    "P2PK",
                    {
                        "nonce": hex::encode(nonce),
                        "data": normalized_pubkey,
                        "tags": []
                    }
                ]).to_string();
            }
            let sess = BlindingSession::new(&secret);
            output_json.push(serde_json::json!({"amount": amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
            current_sessions.push((amt, sess, index, true)); // true = is_desired
        }

        // Then do change amounts
        for &amt in &change_amounts {
            let index = deriv.index;
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            output_json.push(serde_json::json!({"amount": amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
            current_sessions.push((amt, sess, index, false)); // false = is_change
        }

        // Save index before network call
        state.derivation_index = deriv.index;
        state.save_encrypted(wallet_path, passphrase)?;

        // Call the mint
        match client.swap_tokens(input_json.clone(), output_json).await {
            Ok(sigs) => {
                if sigs.len() != current_sessions.len() {
                    return Err(anyhow!("Mint returned {} signatures, expected {}", sigs.len(), current_sessions.len()));
                }
                break (sigs, current_sessions);
            }
            Err(e) => {
                let err_lower = e.to_string().to_lowercase();
                if (err_lower.contains("already signed")
                    || err_lower.contains("already been signed")
                    || err_lower.contains("already exists")
                    || err_lower.contains("outputs already"))
                    && attempts < 10
                {
                    eprintln!(
                        "Output collision detected on mint. Advancing derivation index by 25 and retrying (attempt {}/10)...",
                        attempts
                    );
                    state.derivation_index += 25;
                    state.save_encrypted(wallet_path, passphrase)?;
                    continue;
                }

                if err_lower.contains("token not verified") || err_lower.contains("not verified") {
                    eprintln!("[swap_tokens] Mint reported 'Token not verified' on swap inputs. Isolating and purging invalid proofs...");
                    let purged = isolate_and_purge_unverified_inputs(
                        state,
                        wallet_path,
                        passphrase,
                        &client,
                        mint_url,
                        &inputs,
                        &input_json,
                        &keyset,
                        &all_keysets,
                    ).await;
                    return Err(anyhow!(
                        "Mint rejected invalid tokens with 'Token not verified'. Automatically identified and purged {} corrupt proof(s) from wallet.",
                        if purged > 0 { purged } else { 1 }
                    ));
                }

                if err_lower.contains("already spent") || err_lower.contains("token already spent") {
                    eprintln!("[swap_tokens] Mint reported proofs already spent. Identifying and purging dead proofs from wallet...");
                    let input_ys: Vec<String> = inputs.iter().map(|p| {
                        ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()))
                    }).collect();
                    if let Ok(states) = client.check_state(&input_ys).await {
                        let spent_secrets: std::collections::HashSet<String> = inputs.iter().filter_map(|p| {
                            let y = ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()));
                            match states.get(&y).map(|s| s.as_str()) {
                                Some("SPENT") | Some("PENDING") => Some(p.secret.clone()),
                                _ => None,
                            }
                        }).collect();

                        if !spent_secrets.is_empty() {
                            if let Some(mint_proofs) = state.proofs.get_mut(mint_url) {
                                mint_proofs.retain(|p| !spent_secrets.contains(&p.secret));
                            }
                            state.save_encrypted(wallet_path, passphrase).ok();
                            eprintln!("[swap_tokens] Automatically purged {} dead/spent proof(s) from wallet.", spent_secrets.len());
                        }
                    }
                }

                return Err(e);
            }
        }
    };

    // Unblind signatures
    let mut desired_proofs = Vec::new();
    let mut change_proofs = Vec::new();

    for (i, sig_val) in sigs.iter().enumerate() {
        let amt = sig_val["amount"].as_u64().ok_or_else(|| anyhow!("Mint signature missing amount"))?;
        let sig_id = sig_val["id"].as_str().ok_or_else(|| anyhow!("Mint signature missing id"))?.to_string();
        let c_prime_str = sig_val["C_"].as_str().ok_or_else(|| anyhow!("Mint signature missing C_"))?;
        let c_prime = point_from_hex(c_prime_str).map_err(|e| anyhow!("Invalid C_ in signature: {}", e))?;

        let mint_pk_hex = match keyset.keys.get(&amt) {
            Some(k) => k.clone(),
            None => {
                let fallback_ks = client.fetch_keyset_by_id(&sig_id).await?;
                fallback_ks.keys.get(&amt).cloned()
                    .ok_or_else(|| anyhow!("Mint keyset does not have key for denomination {}", amt))?
            }
        };
        let mint_pk = point_from_hex(&mint_pk_hex).map_err(|e| anyhow!("Invalid mint pubkey for amount {}: {}", amt, e))?;
        let (_, ref sess, idx, is_desired) = sessions[i];

        let dleq = crate::melt::parse_dleq(sig_val);
        let mut proof = sess.unblind(&c_prime, &mint_pk, amt, &sig_id, dleq);
        proof.derivation_index = idx;

        if is_desired {
            desired_proofs.push(proof);
        } else {
            change_proofs.push(proof);
        }
    }

    // Remove inputs from wallet state
    if let Some(mint_proofs) = state.proofs.get_mut(mint_url) {
        mint_proofs.retain(|p| !input_secrets.contains(&p.secret));
    }

    // Add change proofs to wallet state
    if let Some(mint_proofs) = state.proofs.get_mut(mint_url) {
        mint_proofs.extend(change_proofs);
    } else {
        state.proofs.insert(mint_url.to_string(), change_proofs);
    }

    state.save_encrypted(wallet_path, passphrase)?;

    Ok(desired_proofs)
}

/// Identifies which input proofs in a failed swap are cryptographically unverified or corrupt,
/// permanently removes them from the wallet state, and saves the wallet.
async fn isolate_and_purge_unverified_inputs(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    client: &MintClient,
    mint_url: &str,
    inputs: &[Proof],
    input_json: &[serde_json::Value],
    active_keyset: &KeysetInfo,
    all_keysets: &[KeysetSummary],
) -> usize {
    let mut bad_secrets = std::collections::HashSet::new();

    // 1. Check offline: keyset validity
    // If a proof's keyset ID is completely unknown to the mint, it cannot be verified
    for p in inputs {
        let keyset_known = all_keysets.iter().any(|ks| {
            ks.id == p.id
                || (p.id.starts_with("01") && ks.id.starts_with(&p.id))
                || (ks.id.starts_with("01") && p.id.starts_with(&ks.id))
        }) || p.id == active_keyset.id;
        if !keyset_known {
            eprintln!("[isolate_unverified] Proof has unknown keyset ID {}: {}", p.id, p.secret);
            bad_secrets.insert(p.secret.clone());
        }
    }

    // 2. Check offline: DLEQ proof (if present)
    for p in inputs {
        if bad_secrets.contains(&p.secret) { continue; }
        if let (Some(c_prime), Some(b_prime), Some(dleq)) = (&p.c_prime, &p.b_prime, &p.dleq) {
            if let (Ok(c_p), Ok(b_p)) = (point_from_hex(c_prime), point_from_hex(b_prime)) {
                let pk_str = if p.id == active_keyset.id {
                    active_keyset.keys.get(&p.amount).cloned()
                } else {
                    client.fetch_keyset_by_id(&p.id).await.ok().and_then(|ks| ks.keys.get(&p.amount).cloned())
                };
                if let Some(mint_pk_hex) = pk_str {
                    if let Ok(mint_pk) = point_from_hex(&mint_pk_hex) {
                        if !verify_dleq(&mint_pk, &c_p, &b_p, dleq) {
                            eprintln!("[isolate_unverified] Proof failed DLEQ verification: {}", p.secret);
                            bad_secrets.insert(p.secret.clone());
                        }
                    }
                }
            }
        }
    }

    // 3. If inputs.len() == 1 and no bad secret flagged yet:
    // That single input MUST be the invalid one!
    if inputs.len() == 1 {
        bad_secrets.insert(inputs[0].secret.clone());
    } else {
        // 4. Test candidate inputs individually via single-input test swap
        for (i, p) in inputs.iter().enumerate() {
            if bad_secrets.contains(&p.secret) { continue; }

            let fee = crate::client::calculate_input_fee(std::slice::from_ref(p), all_keysets);
            if p.amount <= fee {
                continue;
            }

            let output_amount = p.amount - fee;
            let output_denoms = ecash_core::types::split_into_powers_of_2(output_amount);

            let mut deriv = match TokenDerivation::from_hex(&state.seed_hex) {
                Ok(d) => d,
                Err(_) => continue,
            };
            deriv.index = state.derivation_index;

            let mut test_sessions = Vec::new();
            let mut test_outputs = Vec::new();
            for &amt in &output_denoms {
                let idx = deriv.index;
                let sec = deriv.next_secret();
                let sess = BlindingSession::new(&sec);
                test_outputs.push(serde_json::json!({
                    "amount": amt,
                    "id": active_keyset.id,
                    "B_": sess.b_prime_hex()
                }));
                test_sessions.push((amt, sess, idx));
            }

            state.derivation_index = deriv.index;

            let single_input = vec![input_json[i].clone()];
            match client.swap_tokens(single_input, test_outputs).await {
                Ok(sigs) => {
                    // Valid proof! Mint verified it and signed new outputs.
                    let mut new_proofs = Vec::new();
                    for (s_idx, sig_val) in sigs.iter().enumerate() {
                        if let (Some(amt), Some(sig_id), Some(c_prime_str)) = (
                            sig_val.get("amount").and_then(|a| a.as_u64()),
                            sig_val.get("id").and_then(|id| id.as_str()),
                            sig_val.get("C_").and_then(|c| c.as_str()),
                        ) {
                            if let Ok(c_prime) = point_from_hex(c_prime_str) {
                                let mint_pk_str = if sig_id == active_keyset.id {
                                    active_keyset.keys.get(&amt).cloned()
                                } else {
                                    client.fetch_keyset_by_id(sig_id).await.ok().and_then(|ks| ks.keys.get(&amt).cloned())
                                };
                                if let Some(pk_str) = mint_pk_str {
                                    if let Ok(mint_pk) = point_from_hex(&pk_str) {
                                        let (_, ref sess, idx) = test_sessions[s_idx];
                                        let dleq = crate::melt::parse_dleq(sig_val);
                                        let mut new_p = sess.unblind(&c_prime, &mint_pk, amt, sig_id, dleq);
                                        new_p.derivation_index = idx;
                                        new_proofs.push(new_p);
                                    }
                                }
                            }
                        }
                    }
                    if !new_proofs.is_empty() {
                        if let Some(mint_proofs) = state.proofs.get_mut(mint_url) {
                            mint_proofs.retain(|x| x.secret != p.secret);
                            mint_proofs.extend(new_proofs);
                        }
                    }
                }
                Err(test_err) => {
                    let terr_lower = test_err.to_string().to_lowercase();
                    if terr_lower.contains("not verified") || terr_lower.contains("already spent") {
                        eprintln!("[isolate_unverified] Found bad proof ({} sats): {}", p.amount, p.secret);
                        bad_secrets.insert(p.secret.clone());
                    }
                }
            }
        }

        // If no bad secret was found yet, any input with amount <= fee must be the bad proof
        if bad_secrets.is_empty() {
            for p in inputs {
                let fee = crate::client::calculate_input_fee(std::slice::from_ref(p), all_keysets);
                if p.amount <= fee {
                    eprintln!("[isolate_unverified] Low-denomination proof flagged as bad: {}", p.secret);
                    bad_secrets.insert(p.secret.clone());
                }
            }
        }
    }

    if !bad_secrets.is_empty() {
        let count = bad_secrets.len();
        if let Some(mint_proofs) = state.proofs.get_mut(mint_url) {
            mint_proofs.retain(|p| !bad_secrets.contains(&p.secret));
        }
        state.save_encrypted(wallet_path, passphrase).ok();
        eprintln!("[isolate_unverified] Successfully purged {} bad proof(s) from wallet on {}.", count, mint_url);
        count
    } else {
        0
    }
}

