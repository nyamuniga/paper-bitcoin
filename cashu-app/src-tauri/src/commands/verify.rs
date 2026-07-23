use crate::error::CommandResult;
use ecash_wallet::WalletState;

use crate::commands::auth::AppState;
use tauri::State;

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

    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mut verifier = ecash_verifier::OfflineVerifier::new();
    for entry in &pub_data.entries {
        let url = &entry.mint;
        if let Some(keys) = w_state.trusted_keys.get(url) {
            let mut keys_u64 = std::collections::HashMap::new();
            for (amt, pk) in keys {
                keys_u64.insert(*amt, pk.clone());
            }
            verifier.trust_mint(url.clone(), "Trusted Mint".to_string(), keys_u64);
        } else {
            // Keys not in local database. If we are online, we can fetch them to verify DLEQ!
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .unwrap_or_default();

            if let Ok(resp) = client.get(format!("{}/v1/keys", url)).send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(ks_array) = json.get("keysets").and_then(|k| k.as_array()) {
                        if !ks_array.is_empty() {
                            let ks = &ks_array[0];
                            if let Some(keys_obj) = ks.get("keys").and_then(|k| k.as_object()) {
                                let mut keys_u64 = std::collections::HashMap::new();
                                for (amt_str, pk) in keys_obj {
                                    if let (Ok(amt), Some(pk_str)) =
                                        (amt_str.parse::<u64>(), pk.as_str())
                                    {
                                        keys_u64.insert(amt, pk_str.to_string());
                                    }
                                }
                                verifier.trust_mint(
                                    url.clone(),
                                    "Fetched Mint".to_string(),
                                    keys_u64,
                                );
                            }
                        }
                    }
                }
            }
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
