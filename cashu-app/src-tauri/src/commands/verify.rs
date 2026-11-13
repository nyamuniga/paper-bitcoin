use crate::error::CommandResult;
use std::collections::HashSet;
use crate::commands::auth::AppState;
use std::collections::HashMap;
use tauri::State;

// ─── Keyset helper ────────────────────────────────────────────────────────────

/// A mint's public keys indexed by keyset ID, then denomination.
/// `keyset_id -> (amount -> pubkey_hex)`
type KeysetMap = HashMap<String, HashMap<u64, String>>;

/// Fetch **every** keyset the mint serves.
///
/// `keysets[0]` is NOT guaranteed to be the keyset a given proof was signed
/// under — a mint retains rotated-out keysets in this array. Returning them all
/// lets the verifier pick the correct pubkey per proof by `proof.id`.
///
/// Returns `None` only if the mint is unreachable or returned non-JSON.
/// Individual malformed keysets are skipped.
async fn fetch_mint_keysets(url: &str) -> Option<KeysetMap> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .ok()?;
    let res = client
        .get(format!("{}/v1/keys", url.trim_end_matches('/')))
        .send()
        .await
        .ok()?;
    let v: serde_json::Value = res.json().await.ok()?;

    let arr = v["keysets"].as_array()?;
    let mut out = KeysetMap::new();
    for ks in arr {
        let Some(id) = ks["id"].as_str() else { continue };
        let Some(keys_obj) = ks["keys"].as_object() else { continue };
        let mut keys = HashMap::new();
        for (amt_str, pk) in keys_obj {
            if let (Ok(amt), Some(pk_str)) = (amt_str.parse::<u64>(), pk.as_str()) {
                keys.insert(amt, pk_str.to_string());
            }
        }
        out.insert(id.to_string(), keys);
    }
    Some(out)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn decode_bin(bin_b64: String) -> CommandResult<serde_json::Value> {
    let bin_data = crate::utils::decode_qr_payload(&bin_b64)
        .map_err(|e| anyhow::anyhow!("Invalid QR payload: {}", e))?;

    // Try decoding as Full PhysicalNote (Private/Redemption QR)
    if let Ok(note) = ecash_core::compact::decode_full_note(&bin_data) {
        return Ok(serde_json::json!({
            "type": "full",
            "amount_sats": note.amount_sats,
            "validation_hash": note.validation_hash,
            "public_data": note.public_data,
            "note": note
        }));
    }

    // Try decoding as PublicNoteData (Public/Verification QR)
    if let Ok(dec) = ecash_core::compact::decode_public_data(&bin_data) {
        return Ok(serde_json::json!({
            "type": "public",
            "amount_sats": dec.face_value_sats,
            "validation_hash": dec.data.validation_hash,
            "public_data": dec.data
        }));
    }

    Err(crate::error::CommandError(
        "Could not decode QR code. Not a valid E-Cash note.".to_string(),
    ))
}

#[tauri::command]
pub async fn verify_note(
    bin_b64: String,
    state: State<'_, AppState>,
) -> CommandResult<serde_json::Value> {
    let bin_data = crate::utils::decode_qr_payload(&bin_b64)
        .map_err(|e| anyhow::anyhow!("Invalid QR payload: {}", e))?;
    // In verify_note, we must accept EITHER the full note OR the public note data
    // because verification only requires public data!
    let (pub_data, block_height) =
        if let Ok(note) = ecash_core::compact::decode_full_note(&bin_data) {
            (note.public_data, note.block_height)
        } else if let Ok(dec) = ecash_core::compact::decode_public_data(&bin_data) {
            (dec.data, dec.block_height)
        } else {
            return Err(crate::error::CommandError(
                "Could not decode verification payload.".to_string(),
            ));
        };

    let hash = &pub_data.validation_hash;
    let chars: Vec<char> = hash.to_uppercase().chars().take(12).collect();
    let serial = format!(
        "{}-{}-{}",
        chars[..4].iter().collect::<String>(),
        chars[4..8].iter().collect::<String>(),
        chars[8..12].iter().collect::<String>()
    );

    let mut key_ids = Vec::new();
    for entry in &pub_data.entries {
        for proof in &entry.proofs {
            if !key_ids.contains(&proof.id) {
                key_ids.push(proof.id.clone());
            }
        }
    }

    // Cached trusted keys: mint_url -> keyset_id -> (amount -> pk).
    let (trusted_keys, known_mints): (HashMap<String, KeysetMap>, Vec<String>) =
        match state.lock_and_get_wallet().await {
            Ok((wallet_guard, _, _)) => {
                if let Some(ref w_state) = *wallet_guard {
                    (w_state.trusted_keys.clone(), w_state.mints.clone())
                } else {
                    (HashMap::new(), Vec::new())
                }
            }
            Err(_) => (HashMap::new(), Vec::new()),
        };

    let mut verifier = ecash_verifier::OfflineVerifier::new();
    
    for entry in &pub_data.entries {
        let url = &entry.mint;
    
        // Which keysets do THIS entry's proofs actually need?
        let needed: HashSet<&str> = entry.proofs
            .iter()
            .map(|p| p.id.as_str())
            .filter(|id| !id.is_empty())
            .collect();
    
        // Is the cache complete for those keysets?
        let cache_complete = match trusted_keys.get(url) {
            Some(cached) => needed.iter().all(|id| cached.contains_key(*id)),
            None => false,
        };
    
        let keysets = if cache_complete {
            trusted_keys.get(url).cloned().unwrap_or_default()
        } else {
            // Cache is missing at least one keyset. Fetch ALL keysets from the mint
            // (including inactive ones — NUT-02 requires they remain served),
            // merge with whatever we had, and persist.
            match fetch_mint_keysets(url).await {
                Some(fresh) => {
                    let mut merged = trusted_keys.get(url).cloned().unwrap_or_default();
                    for (id, keys) in fresh {
                        merged.insert(id, keys);
                    }
                    // Best-effort persist so next verify is offline.
                    if let Ok((mut wg, path, pass)) = state.lock_and_get_wallet().await {
                        if let Some(ref mut ws) = *wg {
                            ws.trusted_keys.insert(url.clone(), merged.clone());
                            let _ = ws.save_encrypted(&path, &pass);
                        }
                    }
                    merged
                }
                None => {
                    // Mint unreachable: fall back to whatever we have.
                    // If it's still incomplete, the verifier will report the same
                    // "no longer serves keyset" error — which is then accurate.
                    trusted_keys.get(url).cloned().unwrap_or_default()
                }
            }
        };
    
        if !keysets.is_empty() {
            let name = if known_mints.contains(url) { "Trusted Mint" } else { "Mint" };
            verifier.trust_mint(url.clone(), name.to_string(), keysets);
        }
    }


    let res = verifier.verify(&pub_data);

    // Check spend state if the note is valid or valid untrusted
    let spend_state_str = match &res {
        ecash_verifier::VerificationResult::Valid { .. }
        | ecash_verifier::VerificationResult::ValidUntrusted { .. } => {
            match ecash_verifier::OfflineVerifier::check_spend_state(&pub_data).await {
                Ok(ecash_verifier::SpentStatus::Unspent) => "unspent",
                Ok(ecash_verifier::SpentStatus::Spent) => "spent",
                Ok(ecash_verifier::SpentStatus::PartiallySpent) => "partially_spent",
                Err(_) => "unknown",
            }
        }
        _ => "unknown",
    };

    match res {
        ecash_verifier::VerificationResult::Valid {
            face_value_sats,
            proof_total_sats,
            mint_urls,
        } => Ok(serde_json::json!({
            "success": true,
            "untrusted": false,
            "mints": mint_urls,
            "face_value_sats": face_value_sats,
            "proof_total_sats": proof_total_sats,
            "spend_state": spend_state_str,
            "validation_hash": hash,
            "serial_number": serial,
            "block_height": block_height,
            "key_ids": key_ids,
        })),
        ecash_verifier::VerificationResult::ValidUntrusted {
            face_value_sats,
            proof_total_sats,
            mint_urls,
        } => Ok(serde_json::json!({
            "success": true,
            "untrusted": true,
            "mints": mint_urls,
            "face_value_sats": face_value_sats,
            "proof_total_sats": proof_total_sats,
            "spend_state": spend_state_str,
            "validation_hash": hash,
            "serial_number": serial,
            "block_height": block_height,
            "key_ids": key_ids,
        })),
        _ => Err(crate::error::CommandError(format!(
            "Verification failed: {:?}",
            res
        ))),
    }
}