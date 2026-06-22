use ecash_wallet::WalletState;
use ecash_wallet::melt::redeem_note;
use ecash_core::types::{PublicNoteData, PublicTokenEntry, PublicProof};
use ecash_core::dhke::{MintKeypair, BlindingSession, point_to_hex};
use ecash_core::derivation::TokenDerivation;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
use serde_json::json;

const DUMMY_POINT: &str = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

#[tokio::test]
async fn test_redemption_integration() {
    let server = MockServer::start().await;

    // Generate valid crypto values for the token
    let master_seed_hex = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    let mut note_deriv = TokenDerivation::from_hex(master_seed_hex).unwrap();
    let secret = note_deriv.next_secret();
    let session = BlindingSession::new(&secret);

    let mint = MintKeypair::generate();
    let mint_pk = mint.public_key_hex();

    let (c_prime, dleq) = mint.blind_sign_with_dleq(&session.b_prime);
    let c_prime_hex = point_to_hex(&c_prime);

    let mut proof = session.unblind(&c_prime, &mint.public_point(), 64, "00112233", Some(dleq.clone()));
    proof.derivation_index = 0;
    let c_hex = proof.c.clone();

    // Mock keys
    let keys_body = json!({
        "keysets": [
            {
                "id": "00112233",
                "unit": "sat",
                "keys": { "64": mint_pk, "16": DUMMY_POINT, "4": DUMMY_POINT, "2": DUMMY_POINT }
            }
        ]
    });
    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(200).set_body_json(keys_body))
        .mount(&server)
        .await;

    // Mock checkstate
    Mock::given(method("POST"))
        .and(path("/v1/checkstate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"states": [{"Y": "...", "state": "UNSPENT"}]})))
        .mount(&server)
        .await;

    // Mock Melt Quote
    Mock::given(method("POST"))
        .and(path("/v1/melt/quote/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "melt_q123",
            "amount": 60,
            "fee_reserve": 2
        })))
        .mount(&server)
        .await;

    // Mock Melt
    Mock::given(method("POST"))
        .and(path("/v1/melt/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "paid": true,
            "change": [
                { "amount": 2, "id": "00112233", "C_": DUMMY_POINT }
            ]
        })))
        .mount(&server)
        .await;

    let tmp_dir = std::env::temp_dir();
    let wallet_path = tmp_dir.join(format!("test_wallet_{}.json", uuid::Uuid::new_v4()));
    let passphrase = "my-secure-password";

    let mut state = WalletState::new(master_seed_hex.to_string(), None);
    
    let public_data = PublicNoteData {
        entries: vec![
            PublicTokenEntry {
                mint: server.uri(),
                proofs: vec![
                    PublicProof {
                        amount: 64,
                        id: "00112233".to_string(),
                        c: c_hex,
                        c_prime: Some(c_prime_hex),
                        b_prime: Some(session.b_prime_hex()),
                        y: None,
                        dleq: Some(dleq),
                        derivation_index: 0,
                    }
                ]
            }
        ],
        validation_hash: "".to_string(),
        face_value_sats: 64,
    };

    let mut real_public_data = public_data.clone();
    let public_entries: Vec<_> = public_data.entries.clone();
    real_public_data.validation_hash = ecash_core::dhke::compute_validation_hash(&public_entries);

    let seed_hex = state.seed_hex.clone();
    let result = redeem_note(&mut state, &wallet_path, passphrase, &real_public_data, &seed_hex, "lnbc1...").await;
    
    assert!(result.is_ok(), "Redemption failed: {:?}", result.err());
    assert_eq!(result.unwrap(), 60);

    // Check that transaction is Success
    let tx = state.transactions.iter().find(|t| matches!(t.tx_type, ecash_core::types::TransactionType::Redeem(_))).unwrap();
    assert_eq!(tx.status, ecash_core::types::TransactionStatus::Success);

    // Check that change was added to wallet proofs
    let proofs = state.proofs.get(&server.uri()).unwrap();
    assert_eq!(proofs.len(), 1);
    assert_eq!(proofs[0].amount, 2); // The change amount returned by the mock

    let _ = std::fs::remove_file(wallet_path);
}

#[tokio::test]
async fn test_pay_invoice_integration() {
    use ecash_wallet::melt::pay_invoice;
    use ecash_core::types::Proof;

    let server = MockServer::start().await;

    // Mock keys
    let keys_body = json!({
        "keysets": [
            {
                "id": "00112233",
                "unit": "sat",
                "keys": { "64": DUMMY_POINT, "16": DUMMY_POINT, "4": DUMMY_POINT, "2": DUMMY_POINT }
            }
        ]
    });
    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(200).set_body_json(keys_body))
        .mount(&server)
        .await;

    // Mock checkstate
    Mock::given(method("POST"))
        .and(path("/v1/checkstate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"states": [{"Y": "...", "state": "UNSPENT"}]})))
        .mount(&server)
        .await;

    // Mock Melt Quote
    Mock::given(method("POST"))
        .and(path("/v1/melt/quote/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "melt_q123",
            "amount": 60,
            "fee_reserve": 2
        })))
        .mount(&server)
        .await;

    // Mock Melt
    Mock::given(method("POST"))
        .and(path("/v1/melt/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "paid": true,
            "change": [
                { "amount": 2, "id": "00112233", "C_": DUMMY_POINT }
            ]
        })))
        .mount(&server)
        .await;

    let tmp_dir = std::env::temp_dir();
    let wallet_path = tmp_dir.join(format!("test_wallet_{}.json", uuid::Uuid::new_v4()));
    let passphrase = "my-secure-password";

    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    
    // Add existing proofs to wallet
    state.proofs.insert(server.uri(), vec![
        Proof {
            amount: 64,
            id: "00112233".to_string(),
            c: DUMMY_POINT.to_string(),
            c_prime: Some(DUMMY_POINT.to_string()),
            b_prime: Some(DUMMY_POINT.to_string()),
            dleq: None,
            secret: "random_secret".to_string(),
            derivation_index: 1,
        }
    ]);

    let result = pay_invoice(&mut state, &wallet_path, passphrase, "lnbc1...").await;
    
    assert!(result.is_ok(), "pay_invoice failed: {:?}", result.err());
    assert_eq!(result.unwrap(), 60);

    // Check that transaction is Success
    let tx = state.transactions.iter().find(|t| matches!(t.tx_type, ecash_core::types::TransactionType::Melt(_))).unwrap();
    assert_eq!(tx.status, ecash_core::types::TransactionStatus::Success);

    // Check that change was added to wallet proofs
    let proofs = state.proofs.get(&server.uri()).unwrap();
    assert_eq!(proofs.len(), 1);
    assert_eq!(proofs[0].amount, 2); // The change amount returned by the mock

    let _ = std::fs::remove_file(wallet_path);
}
