use anyhow::{anyhow, Result};
use ecash_core::{
    dhke::{point_from_hex, BlindingSession},
    types::Proof,
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
) -> Result<u64> {
    let mut total_restored = 0;
    let mut max_used_index = -1_i64;
    
    // We scan up to 100 derivation indices. In a real wallet, we'd dynamically stop after a gap.
    let scan_limit = 100;
    
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

        let mut target_amounts: Vec<u64> = keyset.keys.keys().cloned().collect();
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
            // So we request a restore for ALL standard amounts for this B_.
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

        println!("Requesting restore of {} outputs from {}", output_json.len(), mint_url);

        let mut out_arr = Vec::new();
        let mut sig_arr = Vec::new();
        
        for chunk in output_json.chunks(500) {
            match client.restore_tokens(chunk.to_vec()).await {
                Ok((o, s)) => {
                    out_arr.extend(o);
                    sig_arr.extend(s);
                }
                Err(e) => {
                    println!("Restore failed for chunk on {}: {}", mint_url, e);
                    // continue with next chunk or break? Let's just continue
                }
            }
        }

        if sig_arr.is_empty() {
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
            // Fallback: If B_ was missing and sizes don't match, we can't reliably map.
            // But let's assume the mint implements it reasonably.
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
            println!("Restored {} unspent proofs from {}", unspent.len(), mint_url);
            state.proofs.entry(mint_url.clone()).or_default().extend(unspent);
            if !state.mints.contains(&mint_url) {
                state.mints.push(mint_url);
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
