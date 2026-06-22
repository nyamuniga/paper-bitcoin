use std::collections::HashMap;
use ecash_verifier::{OfflineVerifier, VerificationResult};
use ecash_core::types::{PublicNoteData, PublicTokenEntry, PublicProof};
use ecash_core::dhke::{MintKeypair, BlindingSession, compute_validation_hash};

fn create_valid_note(mint_url: &str) -> (OfflineVerifier, PublicNoteData) {
    let mut verifier = OfflineVerifier::new();
    let mint_key = MintKeypair::generate();
    
    let mut keys = HashMap::new();
    keys.insert(64, mint_key.public_key_hex());
    verifier.trust_mint(mint_url, "Test Mint", keys);

    let session = BlindingSession::new("test-secret");
    let (c_prime, dleq) = mint_key.blind_sign_with_dleq(&session.b_prime);
    let proof = session.unblind(&c_prime, &mint_key.public_point(), 64, &mint_key.keyset_id(), Some(dleq));

    let pub_proof = PublicProof {
        amount: proof.amount,
        id: proof.id,
        c: proof.c,
        c_prime: proof.c_prime,
        b_prime: proof.b_prime,
        dleq: proof.dleq,
        y: Some(ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(proof.secret.as_bytes()))),
        derivation_index: 0,
    };

    let entry = PublicTokenEntry {
        mint: mint_url.to_string(),
        proofs: vec![pub_proof],
    };

    let validation_hash = compute_validation_hash(&[entry.clone()]);
    let note = PublicNoteData {
        entries: vec![entry],
        validation_hash,
        face_value_sats: 64,
    };

    (verifier, note)
}

#[test]
fn test_verify_valid_note() {
    let url = "https://test.mint";
    let (verifier, note) = create_valid_note(url);
    
    let result = verifier.verify(&note);
    match result {
        VerificationResult::Valid { face_value_sats, proof_total_sats, mint_urls } => {
            assert_eq!(face_value_sats, 64);
            assert_eq!(proof_total_sats, 64);
            assert_eq!(mint_urls[0], url);
        },
        other => panic!("Expected Valid, got {:?}", other),
    }
}

#[test]
fn test_verify_untrusted_mint() {
    let url = "https://untrusted.mint";
    let (_, note) = create_valid_note(url);
    
    // Create a new verifier that doesn't trust this mint
    let verifier = OfflineVerifier::new();
    let result = verifier.verify(&note);
    
    match result {
        VerificationResult::ValidUntrusted { face_value_sats, .. } => {
            assert_eq!(face_value_sats, 64);
        },
        other => panic!("Expected ValidUntrusted, got {:?}", other),
    }
}

#[test]
fn test_verify_integrity_mismatch() {
    let url = "https://test.mint";
    let (verifier, mut note) = create_valid_note(url);
    
    // Tamper with the validation hash
    note.validation_hash = "deadbeef".to_string();
    
    let result = verifier.verify(&note);
    assert_eq!(result, VerificationResult::IntegrityMismatch);
}
