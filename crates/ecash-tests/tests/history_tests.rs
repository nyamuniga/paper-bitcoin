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
