use ecash_wallet::WalletState;
use ecash_wallet::mint::{prepare_issue_multimint_note, resume_issue_note, ReserveStrategy};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
use serde_json::json;

// Valid secp256k1 point hex for dummy C_ and mint public keys
const DUMMY_POINT: &str = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

#[tokio::test]
async fn test_multi_mint_issuance_integration() {
    // 1. Start Hub Mock Server
    let hub_server = MockServer::start().await;
    
    // Mock Hub /v1/mint/quote/bolt11
    Mock::given(method("POST"))
        .and(path("/v1/mint/quote/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "hub_q123",
            "request": "lnbc1..."
        })))
        .mount(&hub_server)
        .await;

    // Mock Hub /v1/keys
    let keys_body = json!({
        "keysets": [
            {
                "id": "00112233",
                "unit": "sat",
                "keys": {
                    "1": DUMMY_POINT,
                    "2": DUMMY_POINT,
                    "4": DUMMY_POINT,
                    "8": DUMMY_POINT,
                    "16": DUMMY_POINT,
                    "32": DUMMY_POINT,
                    "64": DUMMY_POINT,
                    "128": DUMMY_POINT,
                    "256": DUMMY_POINT,
                    "512": DUMMY_POINT,
                    "1024": DUMMY_POINT
                }
            }
        ]
    });
    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(200).set_body_json(keys_body.clone()))
        .mount(&hub_server)
        .await;

    // Mock Hub quote check PAID
    Mock::given(method("GET"))
        .and(path("/v1/mint/quote/bolt11/hub_q123"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"state": "PAID"})))
        .mount(&hub_server)
        .await;

    // Mock Hub melt quote for multi-mint routing fee calculation
    Mock::given(method("POST"))
        .and(path("/v1/melt/quote/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "melt_q123",
            "fee_reserve": 10
        })))
        .mount(&hub_server)
        .await;

    // Mock Hub Mint
    // Mint tokens requires us to return signatures corresponding to the outputs sent
    // We don't care exactly about amounts here because resume_issue_note expects
    // the amount returned to match what we requested... wait, resume_issue_note extracts amount from the signature!
    // If the mock just returns fixed signatures, we need them to match the denominations.
    // To simplify, we can use a mock that matches POST /v1/mint/bolt11 and returns 1 signature for each output.
    // Wiremock allows dynamic responses, but maybe we can just return a large array of signatures for all possible amounts
    // No, resume_issue_note iterates `zip` between outputs and signatures.
    // It's easier if we just write a custom responder or just hardcode the expected outputs.
    // Hub denoms = split(74) + split(84) = 64 + 8 + 2 + 64 + 16 + 4 (6 sigs)
    let hub_sigs = json!({
        "signatures": [
            { "amount": 64, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 8, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 2, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 64, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 16, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 4, "id": "00112233", "C_": DUMMY_POINT }
        ]
    });
    Mock::given(method("POST"))
        .and(path("/v1/mint/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(hub_sigs))
        .mount(&hub_server)
        .await;

    // Mock Hub Melt
    Mock::given(method("POST"))
        .and(path("/v1/melt/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"paid": true})))
        .mount(&hub_server)
        .await;

    // 2. Start Child Mock Server
    let child_server = MockServer::start().await;
    
    Mock::given(method("POST"))
        .and(path("/v1/mint/quote/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "quote": "child_q123",
            "request": "lnbc1..."
        })))
        .mount(&child_server)
        .await;

    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(200).set_body_json(keys_body))
        .mount(&child_server)
        .await;

    // Child Mint
    // Child denoms for 74 = 64 + 8 + 2 (3 sigs)
    let child_sigs = json!({
        "signatures": [
            { "amount": 64, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 8, "id": "00112233", "C_": DUMMY_POINT },
            { "amount": 2, "id": "00112233", "C_": DUMMY_POINT }
        ]
    });
    Mock::given(method("POST"))
        .and(path("/v1/mint/bolt11"))
        .respond_with(ResponseTemplate::new(200).set_body_json(child_sigs))
        .mount(&child_server)
        .await;

    // 3. Execution
    let tmp_dir = std::env::temp_dir();
    let wallet_path = tmp_dir.join(format!("test_wallet_{}.json", uuid::Uuid::new_v4()));
    let passphrase = "my-secure-password";

    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    
    let hub_url = hub_server.uri();
    let child_url = child_server.uri();
    
    let allocations = vec![
        (hub_url.as_str(), 64),
        (child_url.as_str(), 64)
    ];

    let (tx_id, returned_hub, _, total) = prepare_issue_multimint_note(&mut state, &wallet_path, passphrase, &allocations, ReserveStrategy::Static).await.unwrap();
    
    assert_eq!(returned_hub, hub_url);
    // Hub (64+10) + Child (64+10) + melt fee (10) = 158
    assert_eq!(total, 158);

    // Call resume
    let note = resume_issue_note(&mut state, &wallet_path, passphrase, &tx_id).await.expect("resume_issue_note failed");
    
    // Asserts
    assert_eq!(note.amount_sats, 128); // 64 + 64
    assert_eq!(note.mint_urls, vec![hub_url.clone(), child_url.clone()]);
    assert_eq!(note.public_data.entries.len(), 2);
    
    // Check that transaction is Success
    let tx = state.transactions.iter().find(|t| t.id == tx_id).unwrap();
    assert_eq!(tx.status, ecash_core::types::TransactionStatus::Success);
    
    let _ = std::fs::remove_file(wallet_path);
}
