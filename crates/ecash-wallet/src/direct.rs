use anyhow::{anyhow, Result};
use ecash_core::{
    dhke::{point_from_hex, BlindingSession},
    types::{PhysicalNote, TokenEntry, PublicNoteData, PrivateNoteData, Transaction, TransactionType, IssueTransactionData, TransactionStatus},
    derivation::TokenDerivation,
};
use crate::{
    state::WalletState,
    client::MintClient,
};
use std::path::PathBuf;

pub async fn issue_direct_note(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    allocations: &[(&str, u64)],
) -> Result<PhysicalNote> {
    // 1. Check total balance
    for (mint_url, amt) in allocations {
        let balance: u64 = state.proofs.get(*mint_url).map(|v| v.iter().map(|p| p.amount).sum()).unwrap_or(0);
        if balance < *amt {
            return Err(anyhow!("Insufficient balance in mint {}. Have {}, need {}.", mint_url, balance, amt));
        }
    }

    // 2. Generate random master seed for the new note
    use rand::RngCore;
    let mut seed_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut seed_bytes);
    let note_seed_hex = hex::encode(seed_bytes);
    let mut note_deriv = TokenDerivation::from_hex(&note_seed_hex)?;

    let mut entries = Vec::new();
    let mut public_entries = Vec::new();

    // 3. For each mint allocation, perform a swap to get fresh tokens
    for (mint_url, amt) in allocations {
        let client = MintClient::new(*mint_url);
        let keyset = client.fetch_keyset().await?;
        
        // Find inputs to melt
        let mut sorted_proofs = state.proofs.get(*mint_url).unwrap().clone();
        sorted_proofs.sort_by_key(|p| std::cmp::Reverse(p.amount)); // larger first to reduce inputs? Or smallest first? 
        // Actually smallest first is better to clear dust, let's do smallest first
        sorted_proofs.sort_by_key(|p| p.amount);
        
        let mut selected_for_swap = Vec::new();
        let mut swap_total = 0;
        for p in &sorted_proofs {
            if swap_total >= *amt { break; }
            selected_for_swap.push(p.clone());
            swap_total += p.amount;
        }

        let change_amount = swap_total - amt;
        let desired_denoms = ecash_core::types::split_into_powers_of_2(*amt);
        let change_denoms = ecash_core::types::split_into_powers_of_2(change_amount);

        let mut input_json = Vec::new();
        let mut input_secrets = std::collections::HashSet::new();
        for p in &selected_for_swap {
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

        // Setup outputs
        let mut output_json = Vec::new();
        let mut sessions = Vec::new(); // (amount, session, idx, is_desired)
        
        // Desired amounts (use note_deriv)
        for &d_amt in &desired_denoms {
            let index = note_deriv.index;
            let secret = note_deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            output_json.push(serde_json::json!({"amount": d_amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
            sessions.push((d_amt, sess, index, true));
        }

        // Change amounts (use wallet deriv)
        let mut wallet_deriv = TokenDerivation::from_hex(&state.seed_hex)?;
        wallet_deriv.index = state.derivation_index;
        for &c_amt in &change_denoms {
            let index = wallet_deriv.index;
            let secret = wallet_deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            output_json.push(serde_json::json!({"amount": c_amt, "id": keyset.id, "B_": sess.b_prime_hex()}));
            sessions.push((c_amt, sess, index, false));
        }
        
        state.derivation_index = wallet_deriv.index;
        state.save_encrypted(wallet_path, passphrase)?;

        // Call swap
        let sigs = client.swap_tokens(input_json, output_json).await?;
        if sigs.len() != sessions.len() {
            return Err(anyhow!("Mint {} returned {} signatures, expected {}", mint_url, sigs.len(), sessions.len()));
        }

        let mut desired_proofs = Vec::new();
        let mut change_proofs = Vec::new();

        for (i, sig_val) in sigs.iter().enumerate() {
            let s_amt = sig_val["amount"].as_u64().unwrap();
            let sig_id = sig_val["id"].as_str().unwrap().to_string();
            let c_prime = point_from_hex(sig_val["C_"].as_str().unwrap()).unwrap();
            let mint_pk = point_from_hex(keyset.keys.get(&s_amt).unwrap()).unwrap();
            
            let (_, ref sess, idx, is_desired) = sessions[i];
            let dleq = crate::melt::parse_dleq(sig_val);
            let mut proof = sess.unblind(&c_prime, &mint_pk, s_amt, &sig_id, dleq);
            proof.derivation_index = idx;

            if is_desired {
                desired_proofs.push(proof);
            } else {
                change_proofs.push(proof);
            }
        }

        // Update state
        if let Some(mint_proofs) = state.proofs.get_mut(*mint_url) {
            mint_proofs.retain(|p| !input_secrets.contains(&p.secret));
            mint_proofs.extend(change_proofs);
        }
        
        state.save_encrypted(wallet_path, passphrase)?;

        let token_entry = TokenEntry { mint: mint_url.to_string(), proofs: desired_proofs };
        public_entries.push(token_entry.to_public());
        entries.push(token_entry);
    }

    let validation_hash = ecash_core::dhke::compute_validation_hash(&public_entries);
    let serial = crate::serial_from_hash(&validation_hash);
    
    let total_sats = allocations.iter().map(|a| a.1).sum();

    // Just use 0 for block height in direct notes, or fetch it if needed.
    let block_height = 0; 

    let note = PhysicalNote {
        amount_sats: total_sats,
        mint_urls: allocations.iter().map(|a| a.0.to_string()).collect(),
        serial,
        validation_hash: validation_hash.clone(),
        block_height,
        fee_strategy: "direct".to_string(),
        public_data: PublicNoteData {
            entries: public_entries,
            validation_hash,
            face_value_sats: total_sats,
        },
        private_data: PrivateNoteData { master_seed_hex: note_seed_hex },
    };

    // Record the issue tx
    let tx_id = format!("tx_issue_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let mut allocs = Vec::new();
    for (m, a) in allocations { allocs.push((m.to_string(), *a)); }
    
    let tx = Transaction {
        id: tx_id,
        tx_type: TransactionType::Issue(IssueTransactionData {
            note: Some(note.clone()),
            allocations: allocs,
            hub_mint: "Direct Wallet Issue".to_string(),
            quote_id: "".to_string(),
            master_seed_hex: note.private_data.master_seed_hex.clone(),
            fee_strategy: "direct".to_string(),
            hub_blinding_sessions_hex: vec![],
            hub_outputs: vec![],
            child_quotes: vec![],
        }),
        amount: total_sats,
        fee: 0,
        status: TransactionStatus::Success,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: "Local Wallet".to_string(),
    };
    state.transactions.push(tx);
    state.save_encrypted(wallet_path, passphrase)?;

    Ok(note)
}

pub async fn redeem_direct_note(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    public_data: &ecash_core::types::PublicNoteData,
    master_seed_hex: &str,
) -> Result<u64> {
    // 1. Reconstruct token from note
    let token = crate::melt::reconstruct_token(public_data, master_seed_hex).await?;
    if token.token.is_empty() {
        return Err(anyhow!("Empty token"));
    }

    let mut total_amount = 0;

    // 2. For each mint in the token, perform swap to receive the proofs
    for entry in &token.token {
        let mint_url = &entry.mint;
        let proofs = entry.proofs.clone();
        
        if proofs.is_empty() { continue; }
        
        let mint_amt: u64 = proofs.iter().map(|p| p.amount).sum();
        total_amount += mint_amt;

        // Perform swap
        let desired_amounts = ecash_core::types::split_into_powers_of_2(mint_amt);
        
        // Use swap_proofs from swap.rs
        let new_proofs = crate::swap::swap_proofs(
            state,
            wallet_path,
            passphrase,
            mint_url,
            proofs,
            desired_amounts,
            vec![], // no change needed
        ).await.map_err(|e| anyhow!("Failed to receive ecash from {}: {}", mint_url, e))?;

        // Add to wallet
        state.proofs.entry(mint_url.clone()).or_default().extend(new_proofs);
        if !state.mints.contains(mint_url) {
            state.mints.push(mint_url.clone());
        }
    }

    // 3. Record transaction
    let tx_id = format!("tx_redeem_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let tx = Transaction {
        id: tx_id,
        tx_type: TransactionType::Redeem(ecash_core::types::RedeemTransactionData {
            public_data: public_data.clone(),
            master_seed_hex: master_seed_hex.to_string(),
            external_invoice: "Direct Wallet Redeem".to_string(),
        }),
        amount: total_amount,
        fee: 0,
        status: TransactionStatus::Success,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: "Local Wallet".to_string(),
    };
    
    state.transactions.push(tx);
    state.save_encrypted(wallet_path, passphrase)?;

    Ok(total_amount)
}
