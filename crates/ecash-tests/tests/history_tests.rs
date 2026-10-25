use ecash_wallet::history::check_transaction_status;
use ecash_wallet::WalletState;
use ecash_core::types::{Transaction, TransactionType, MeltTransactionData, TransactionStatus, Proof};
use wiremock::{Mock, MockServer, ResponseTemplate};
use wiremock::matchers::{method, path};
use serde_json::json;

#[tokio::test]
async fn test_check_melt_status_recovers_pending_failure() {
    let server = MockServer::start().await;

    // 1. Mock /v1/checkstate to return SPENT (proofs are used)
    Mock::given(method("POST"))
        .and(path("/v1/checkstate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "states": [{"Y": "some_y", "state": "SPENT"}]
        })))
        .mount(&server)
        .await;

    // 2. Mock /v1/melt/quote/bolt11/test_quote to return UNPAID (mint failed to pay)
    Mock::given(method("GET"))
        .and(path("/v1/melt/quote/bolt11/test_quote"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "test_quote",
            "state": "UNPAID"
        })))
        .mount(&server)
        .await;

    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    // Insert a pending transaction
    state.transactions.push(Transaction {
        id: "tx_123".to_string(),
        tx_type: TransactionType::Melt(MeltTransactionData {
            quote_id: "test_quote".to_string(),
            proofs: vec![Proof {
                amount: 100,
                id: "test".to_string(),
                secret: "test".to_string(),
                c: "test".to_string(),
                c_prime: None,
                b_prime: None,
                dleq: None,
                witness: None,
                derivation_index: 0,
            }],
        }),
        amount: 100,
        fee: 5,
        status: TransactionStatus::Pending,
        timestamp: 0,
        mint_url: server.uri(),
    });

    let wallet_path = std::env::temp_dir().join(format!("test_wallet_history_{}.json", uuid::Uuid::new_v4()));
    
    // Simulate check_transaction_status
    let result = check_transaction_status(&mut state, &wallet_path, "pass", "tx_123").await.unwrap();
    
    // The proofs are spent, but invoice wasn't paid -> FailedMintError
    assert_eq!(result, TransactionStatus::FailedMintError);
    
    // Ensure proofs are NOT refunded (they are stuck at the mint)
    assert!(state.proofs.get(&server.uri()).is_none());
    
    let _ = std::fs::remove_file(wallet_path);
}

#[tokio::test]
async fn test_check_redeem_status_spent_marks_success() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/checkstate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "states": [{"Y": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "state": "SPENT"}]
        })))
        .mount(&server)
        .await;

    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    let public_data = ecash_core::types::PublicNoteData {
        entries: vec![ecash_core::types::PublicTokenEntry {
            mint: server.uri(),
            proofs: vec![ecash_core::types::PublicProof {
                amount: 100,
                id: "test".to_string(),
                c: "test".to_string(),
                c_prime: None,
                b_prime: None,
                witness: None,
                dleq: None,
                y: Some("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798".to_string()),
                derivation_index: 0,
            }],
        }],
        face_value_sats: 100,
        validation_hash: "hash123".to_string(),
    };

    state.transactions.push(Transaction {
        id: "tx_redeem_123".to_string(),
        tx_type: TransactionType::Redeem(ecash_core::types::RedeemTransactionData {
            public_data,
            master_seed_hex: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(),
            external_invoice: "lnbc1...".to_string(),
        }),
        amount: 100,
        fee: 0,
        status: TransactionStatus::Pending,
        timestamp: 0,
        mint_url: "Local Wallet".to_string(),
    });

    let wallet_path = std::env::temp_dir().join(format!("test_wallet_redeem_{}.json", uuid::Uuid::new_v4()));
    let result = check_transaction_status(&mut state, &wallet_path, "pass", "tx_redeem_123").await.unwrap();

    assert_eq!(result, TransactionStatus::Success);
    assert_eq!(state.transactions[0].status, TransactionStatus::Success);
    let _ = std::fs::remove_file(wallet_path);
}

#[tokio::test]
async fn test_check_redeem_status_unspent_marks_failed() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/checkstate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "states": [{"Y": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "state": "UNSPENT"}]
        })))
        .mount(&server)
        .await;

    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    let public_data = ecash_core::types::PublicNoteData {
        entries: vec![ecash_core::types::PublicTokenEntry {
            mint: server.uri(),
            proofs: vec![ecash_core::types::PublicProof {
                amount: 100,
                id: "test".to_string(),
                c: "test".to_string(),
                c_prime: None,
                b_prime: None,
                witness: None,
                dleq: None,
                y: Some("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798".to_string()),
                derivation_index: 0,
            }],
        }],
        face_value_sats: 100,
        validation_hash: "hash123".to_string(),
    };

    state.transactions.push(Transaction {
        id: "tx_redeem_456".to_string(),
        tx_type: TransactionType::Redeem(ecash_core::types::RedeemTransactionData {
            public_data,
            master_seed_hex: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(),
            external_invoice: "lnbc1...".to_string(),
        }),
        amount: 100,
        fee: 0,
        status: TransactionStatus::Pending,
        timestamp: 0,
        mint_url: "Local Wallet".to_string(),
    });

    let wallet_path = std::env::temp_dir().join(format!("test_wallet_redeem_{}.json", uuid::Uuid::new_v4()));
    let result = check_transaction_status(&mut state, &wallet_path, "pass", "tx_redeem_456").await.unwrap();

    assert_eq!(result, TransactionStatus::Failed);
    assert_eq!(state.transactions[0].status, TransactionStatus::Failed);
    let _ = std::fs::remove_file(wallet_path);
}

