use ecash_core::dhke::{MintKeypair, BlindingSession, verify_dleq};

#[test]
fn test_core_dhke_full_lifecycle() {
    // 1. Mint generates a keypair
    let mint_key = MintKeypair::generate();
    let pubkey = mint_key.public_point();
    let keyset_id = mint_key.keyset_id();

    // 2. User generates a secret and blinding session
    let secret = "my-super-secret-token";
    let session = BlindingSession::new(secret);

    // 3. User sends B' to mint, mint blind signs and includes DLEQ
    let (c_prime, dleq) = mint_key.blind_sign_with_dleq(&session.b_prime);

    // 4. User unblinds to get the final proof
    let amount = 64;
    let proof = session.unblind(&c_prime, &pubkey, amount, &keyset_id, Some(dleq.clone()));

    // 5. Verify DLEQ locally
    let b_prime_hex = proof.b_prime.as_ref().unwrap();
    let b_prime = ecash_core::dhke::point_from_hex(b_prime_hex).unwrap();
    let is_dleq_valid = verify_dleq(&pubkey, &c_prime, &b_prime, &dleq);
    assert!(is_dleq_valid, "DLEQ verification failed");

    // 6. Mint verifies proof on redemption
    assert!(mint_key.verify_proof(&proof), "Mint rejected the unblinded proof");
}

#[test]
fn test_split_into_powers_of_2() {
    let amount = 13; // 8 + 4 + 1
    let denoms = ecash_core::types::split_into_powers_of_2(amount);
    assert_eq!(denoms, vec![1, 4, 8]);
}

#[test]
fn test_compact_codec_roundtrip() {
    use ecash_core::types::{PhysicalNote, PrivateNoteData, PublicNoteData, PublicTokenEntry, PublicProof, Dleq};
    use ecash_core::compact::{encode_full_note, decode_full_note};

    let note = PhysicalNote {
        amount_sats: 1024,
        mint_urls: vec!["https://mint.test".to_string()],
        serial: "TEST-1234".to_string(),
        validation_hash: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234".to_string(),
        block_height: 800000,
        fee_strategy: "dynamic".to_string(),
        public_data: PublicNoteData {
            entries: vec![
                PublicTokenEntry {
                    mint: "https://mint.test".to_string(),
                    proofs: vec![
                        PublicProof {
                            amount: 1024,
                            id: "0011223344556677".to_string(), // 8 bytes -> 16 hex chars
                            c: "020000000000000000000000000000000000000000000000000000000000000000".to_string(), // 33 bytes
                            c_prime: Some("030000000000000000000000000000000000000000000000000000000000000000".to_string()),
                            b_prime: Some("021111111111111111111111111111111111111111111111111111111111111111".to_string()),
                            y: Some("032222222222222222222222222222222222222222222222222222222222222222".to_string()),
                            dleq: Some(Dleq {
                                e: "3333333333333333333333333333333333333333333333333333333333333333".to_string(), // 32 bytes
                                s: "4444444444444444444444444444444444444444444444444444444444444444".to_string(), // 32 bytes
                            }),
                            derivation_index: 42,
                        }
                    ]
                }
            ],
            validation_hash: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234".to_string(),
            face_value_sats: 1024,
        },
        private_data: PrivateNoteData {
            master_seed_hex: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), // 32 bytes
        },
    };

    let encoded = encode_full_note(&note).expect("Failed to encode note");
    let decoded = decode_full_note(&encoded).expect("Failed to decode note");

    assert_eq!(note.amount_sats, decoded.amount_sats);
    assert_eq!(note.serial, decoded.serial);
    assert_eq!(note.validation_hash, decoded.validation_hash);
    assert_eq!(note.block_height, decoded.block_height);
    assert_eq!(note.fee_strategy, decoded.fee_strategy);
    assert_eq!(note.mint_urls, decoded.mint_urls);
    assert_eq!(note.private_data.master_seed_hex, decoded.private_data.master_seed_hex);
    
    assert_eq!(note.public_data.entries.len(), decoded.public_data.entries.len());
    let entry_orig = &note.public_data.entries[0];
    let entry_dec = &decoded.public_data.entries[0];
    assert_eq!(entry_orig.mint, entry_dec.mint);
    assert_eq!(entry_orig.proofs[0].amount, entry_dec.proofs[0].amount);
    assert_eq!(entry_orig.proofs[0].id, entry_dec.proofs[0].id);
    assert_eq!(entry_orig.proofs[0].c, entry_dec.proofs[0].c);
    assert_eq!(entry_orig.proofs[0].dleq.as_ref().unwrap().e, entry_dec.proofs[0].dleq.as_ref().unwrap().e);
    assert_eq!(entry_orig.proofs[0].dleq.as_ref().unwrap().s, entry_dec.proofs[0].dleq.as_ref().unwrap().s);
    assert_eq!(entry_orig.proofs[0].derivation_index, entry_dec.proofs[0].derivation_index);
}
