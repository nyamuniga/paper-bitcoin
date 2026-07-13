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
        }
        input_json.push(val);
        input_secrets.insert(p.secret.clone());
    }

    // Set up blinding sessions for outputs
    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let mut sessions = Vec::new();
    let mut output_json = Vec::new();

    // First do desired amounts
    for &amt in &desired_amounts {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        output_json.push(serde_json::json!({"amount": amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((amt, sess, index, true)); // true = is_desired
    }

    // Then do change amounts
    for &amt in &change_amounts {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        output_json.push(serde_json::json!({"amount": amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((amt, sess, index, false)); // false = is_change
    }

    // Save index before network call
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase)?;

    // Call the mint
    let sigs = client.swap_tokens(input_json, output_json).await?;
    if sigs.len() != sessions.len() {
        return Err(anyhow!("Mint returned {} signatures, expected {}", sigs.len(), sessions.len()));
    }

    // Unblind signatures
    let mut desired_proofs = Vec::new();
    let mut change_proofs = Vec::new();

    for (i, sig_val) in sigs.iter().enumerate() {
        let amt = sig_val["amount"].as_u64().unwrap();
        let sig_id = sig_val["id"].as_str().unwrap().to_string();
        let c_prime = point_from_hex(sig_val["C_"].as_str().unwrap()).unwrap();

        let mint_pk = point_from_hex(keyset.keys.get(&amt).unwrap()).unwrap();
        let (_, ref sess, idx, is_desired) = sessions[i];

        let mut proof = sess.unblind(&c_prime, &mint_pk, amt, &sig_id, None);
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
