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
    inputs: Vec<Proof>,
    desired_amounts: Vec<u64>,
    change_amounts: Vec<u64>,
    target_pubkey: Option<String>,
) -> Result<Vec<Proof>> {
    let client = MintClient::new(mint_url);
    let keyset = client.fetch_keyset().await?;

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
                    use k256::sha2::{Sha256, Digest};

                    let privkey_bytes = hex::decode(privkey_hex)
                        .map_err(|e| anyhow::anyhow!("Invalid hex in nostr private key: {}", e))?;
                    
                    let signing_key = k256::schnorr::SigningKey::from_bytes(privkey_bytes.as_slice())
                        .map_err(|_| anyhow::anyhow!("Invalid nostr private key bytes"))?;

                    let msg_hash = Sha256::digest(p.secret.as_bytes());
                    let sig: k256::schnorr::Signature = signing_key.sign(&msg_hash);
                    
                    let witness_obj = serde_json::json!({
                        "signatures": [hex::encode(sig.to_bytes())]
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
                return Err(e);
            }
        }
    };

    // Unblind signatures
    let mut desired_proofs = Vec::new();
    let mut change_proofs = Vec::new();

    for (i, sig_val) in sigs.iter().enumerate() {
        let amt = sig_val["amount"].as_u64().unwrap();
        let sig_id = sig_val["id"].as_str().unwrap().to_string();
        let c_prime = point_from_hex(sig_val["C_"].as_str().unwrap()).unwrap();

        let mint_pk = point_from_hex(keyset.keys.get(&amt).unwrap()).unwrap();
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
