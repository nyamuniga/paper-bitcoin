use ecash_core::types::{
    Proof, ReceiveEcashTransactionData, Transaction, TransactionStatus, TransactionType,
};
use ecash_wallet::{
    deferred_ecash::save_for_later,
    receive::{receive_ecash, ReceiveEcashRequest},
    WalletState,
};
use std::{path::PathBuf, time::Duration};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

const MINT: &str = "http://127.0.0.1:0";
const PASSWORD: &str = "synthetic-test-passphrase";
const KEYSET: &str = "0000000000000000";

struct TestWallet {
    wallet: WalletState,
    path: PathBuf,
    directory: PathBuf,
}

impl TestWallet {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("bitnotes-wallet-receive-{}", rand::random::<u64>()));
        std::fs::create_dir(&directory).unwrap();
        let wallet = WalletState::new("00".repeat(32), None);
        Self {
            wallet,
            path: directory.join("wallet.json"),
            directory,
        }
    }
}

impl Drop for TestWallet {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn synthetic_proof(amount: u64) -> Proof {
    Proof {
        amount,
        id: KEYSET.into(),
        secret: format!("synthetic-unfunded-proof-{amount}"),
        c: format!("02{}", "11".repeat(32)),
        c_prime: None,
        b_prime: None,
        witness: None,
        dleq: None,
        derivation_index: 0,
    }
}

fn ordinary_request(token: impl Into<String>) -> ReceiveEcashRequest {
    ReceiveEcashRequest {
        token_string: token.into(),
        nostr_key: None,
        expected_mint: None,
        expected_amount: None,
        expected_invoice_id: None,
    }
}

fn invoice_request(
    token: impl Into<String>,
    mint: &str,
    amount: u64,
    invoice_id: &str,
) -> ReceiveEcashRequest {
    ReceiveEcashRequest {
        token_string: token.into(),
        nostr_key: None,
        expected_mint: Some(mint.into()),
        expected_amount: Some(amount),
        expected_invoice_id: Some(invoice_id.into()),
    }
}

async fn mint_with_responses(
    responses: Vec<(&'static str, &'static str, serde_json::Value)>,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (method, path, body) in responses {
            let (stream, _) = tokio::time::timeout(Duration::from_secs(10), listener.accept())
                .await
                .unwrap()
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut request = String::new();
            reader.read_line(&mut request).await.unwrap();
            assert!(
                request.starts_with(&format!("{method} {path} ")),
                "expected {method} {path}, got {request:?}"
            );
            let mut content_length = 0usize;
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).await.unwrap() == 0 || header == "\r\n" {
                    break;
                }
                if let Some((name, value)) = header.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse().unwrap_or(0);
                    }
                }
            }
            if content_length > 0 {
                let mut req_body = vec![0u8; content_length];
                tokio::io::AsyncReadExt::read_exact(&mut reader, &mut req_body)
                    .await
                    .unwrap();
            }
            requests.push(request.trim().to_string());
            let body = body.to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            reader
                .get_mut()
                .write_all(response.as_bytes())
                .await
                .unwrap();
        }
        requests
    });
    (mint, server)
}

fn recovery_fault_mint(
    wallet_path: PathBuf,
    saved_snapshot: PathBuf,
    fail_save: bool,
    keys_error: &'static str,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    use std::io::{BufRead, BufReader, Write};
    use std::time::Instant;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let mint = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let mut requests = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(15);
        for expected_path in ["/v1/keysets", "/v1/keys"] {
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(Instant::now() < deadline, "expected local mint request");
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("local mint accept failed: {error}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(&mut stream);
            let mut request = String::new();
            reader.read_line(&mut request).unwrap();
            assert!(request.starts_with(&format!("GET {expected_path} ")));
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).unwrap() == 0 || header == "\r\n" {
                    break;
                }
            }
            requests.push(request.trim().to_string());
            let body = if expected_path == "/v1/keys" {
                if fail_save {
                    std::fs::rename(&wallet_path, &saved_snapshot).unwrap();
                    std::fs::create_dir(&wallet_path).unwrap();
                }
                format!(r#"{{"error":"{keys_error}"}}"#)
            } else {
                format!(
                    r#"{{"keysets":[{{"id":"{KEYSET}","unit":"sat","active":true,"input_fee_ppk":0}}]}}"#
                )
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
        requests
    });

    (mint, server)
}

#[tokio::test]
async fn existing_successful_raw_receipt_returns_early_before_decoding_and_enforces_invoice_identity(
) {
    let mut fixture = TestWallet::new();
    fixture.wallet.transactions.push(Transaction {
        id: "existing-receive".into(),
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: "legacy-raw-token".into(),
            invoice_id: None,
            claim_deferred: false,
        }),
        amount: 42,
        fee: 0,
        status: TransactionStatus::Success,
        timestamp: 1,
        mint_url: MINT.into(),
    });

    let amount = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        ordinary_request("legacy-raw-token"),
    )
    .await
    .unwrap();
    assert_eq!(amount, 42);
    assert!(!fixture.path.exists());

    // Invoice already paid by another token must be rejected before decoding or mint access.
    let token_a =
        ecash_wallet::encode_token_v3(MINT, &[synthetic_proof(100)], Some("sat")).unwrap();
    let token_b =
        ecash_wallet::encode_token_v3(MINT, &[synthetic_proof(100)], Some("sat")).unwrap();
    let token_b_padded = format!(" {token_b} ");
    fixture.wallet.transactions.push(Transaction {
        id: "existing-invoice-receive".into(),
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: token_a.clone(),
            invoice_id: Some("inv-1".into()),
            claim_deferred: false,
        }),
        amount: 100,
        fee: 0,
        status: TransactionStatus::Success,
        timestamp: 2,
        mint_url: MINT.into(),
    });

    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        invoice_request(token_b_padded, MINT, 100, "inv-1"),
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "This invoice has already been paid by another token"
    );

    // Same token for a different invoice must fail receipt validation.
    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        invoice_request(token_a.clone(), MINT, 100, "inv-2"),
    )
    .await
    .unwrap_err();
    assert!(error.to_string().contains("invoice"));

    // Same token for the same invoice returns the recorded amount without mint access.
    let amount = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        invoice_request(token_a, MINT, 100, "inv-1"),
    )
    .await
    .unwrap();
    assert_eq!(amount, 100);
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn nostr_key_updates_before_ordinary_parse_failure_without_saving() {
    let mut fixture = TestWallet::new();
    let mut request = ordinary_request("not-a-token");
    request.nostr_key = Some("synthetic-nostr-key".into());
    let error = receive_ecash(&mut fixture.wallet, &fixture.path, PASSWORD, request)
        .await
        .unwrap_err();
    assert_eq!(
        error.to_string(),
        "Failed to parse token: Invalid token: must start with cashuA or cashuB"
    );
    assert_eq!(
        fixture.wallet.default_nostr_key.as_deref(),
        Some("synthetic-nostr-key")
    );
    assert!(fixture.wallet.transactions.is_empty());
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn invoice_receive_enforces_constraints_and_strict_metadata_fetch() {
    let mut fixture = TestWallet::new();
    let token = ecash_wallet::encode_token_v3(MINT, &[synthetic_proof(100)], Some("sat")).unwrap();

    // Incomplete constraints fail before touching the wallet.
    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        ReceiveEcashRequest {
            token_string: token.clone(),
            nostr_key: Some("ignored-on-prevalidation-failure".into()),
            expected_mint: Some(MINT.into()),
            expected_amount: None,
            expected_invoice_id: Some("inv-1".into()),
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "Incomplete invoice payment constraints");
    assert_eq!(fixture.wallet.default_nostr_key, None);

    // Strict metadata fetch: unreachable mint fails invoice receive without creating a pending tx.
    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        invoice_request(token, MINT, 100, "inv-1"),
    )
    .await
    .unwrap_err();
    assert!(!error.to_string().is_empty());
    assert!(fixture.wallet.transactions.is_empty());
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn standalone_receive_reuses_deferred_card_and_reports_recovery_save_failure() {
    let mut fixture = TestWallet::new();
    let initial_save = fixture.directory.join("initial-receive.json");
    let (mint, server) = recovery_fault_mint(
        fixture.path.clone(),
        initial_save.clone(),
        true,
        "synthetic-swap-prep-failure",
    );
    let token = ecash_wallet::encode_token_v3(&mint, &[synthetic_proof(100)], Some("sat")).unwrap();
    let saved_id = save_for_later(&mut fixture.wallet, &token, 10).unwrap();

    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        ordinary_request(token.clone()),
    )
    .await
    .unwrap_err();
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests.iter().all(|request| request.starts_with("GET ")));

    let message = error.to_string();
    assert!(message.contains("Failed to receive ecash:"));
    assert!(message.contains("synthetic-swap-prep-failure"));
    assert!(message.contains("Recovery state could not be saved:"));
    assert!(message.contains("Outcome remains unknown; check History before claiming again."));

    let saved = WalletState::load_encrypted(&initial_save, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    let tx = &saved.transactions[0];
    assert_eq!(tx.id, saved_id);
    assert_eq!(tx.status, TransactionStatus::Pending);
    assert!(matches!(
        &tx.tx_type,
        TransactionType::ReceiveEcash(data) if data.token_string == token && !data.claim_deferred
    ));
    assert_eq!(fixture.wallet.total_balance(), 0);
}

#[tokio::test]
async fn standalone_receive_recovery_save_success_preserves_legacy_error_message() {
    let mut fixture = TestWallet::new();
    let (mint, server) = recovery_fault_mint(
        fixture.path.clone(),
        fixture.directory.join("unused.json"),
        false,
        "synthetic-swap-prep-failure",
    );
    let token = ecash_wallet::encode_token_v3(&mint, &[synthetic_proof(100)], Some("sat")).unwrap();

    let error = receive_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        ordinary_request(token),
    )
    .await
    .unwrap_err();
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        error.to_string(),
        r#"Failed to receive ecash: Mint error: "synthetic-swap-prep-failure""#
    );

    let saved = WalletState::load_encrypted(&fixture.path, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    assert_eq!(saved.transactions[0].status, TransactionStatus::Pending);
    assert_eq!(saved.total_balance(), 0);
}

#[tokio::test]
async fn already_spent_error_runs_scoped_restore_only_for_ordinary_receives() {
    // Ordinary receive: "already spent" triggers scoped restore; 0 restored marks tx Failed.
    let mut ordinary_fixture = TestWallet::new();
    let (mint, server) = mint_with_responses(vec![
        (
            "GET",
            "/v1/keysets",
            serde_json::json!({"keysets": [{"id": KEYSET, "unit": "sat", "active": true, "input_fee_ppk": 0}]}),
        ),
        (
            "GET",
            "/v1/keys",
            serde_json::json!({"error": "Token already spent"}),
        ),
        // Scoped restore fetches /v1/keys and returns an error -> total_restored = 0.
        (
            "GET",
            "/v1/keys",
            serde_json::json!({"error": "synthetic-restore-unavailable"}),
        ),
    ])
    .await;
    let token = ecash_wallet::encode_token_v3(&mint, &[synthetic_proof(100)], Some("sat")).unwrap();
    let error = receive_ecash(
        &mut ordinary_fixture.wallet,
        &ordinary_fixture.path,
        PASSWORD,
        ordinary_request(token),
    )
    .await
    .unwrap_err();
    assert_eq!(server.await.unwrap().len(), 3);
    assert_eq!(
        error.to_string(),
        "Tokens are already spent and could not be recovered"
    );
    let saved = WalletState::load_encrypted(&ordinary_fixture.path, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    assert_eq!(saved.transactions[0].status, TransactionStatus::Failed);
    assert_eq!(saved.total_balance(), 0);

    // Invoice receive: "already spent" skips scoped restore and stays Pending.
    let mut invoice_fixture = TestWallet::new();
    let (mint, server) = mint_with_responses(vec![
        (
            "GET",
            "/v1/keysets",
            serde_json::json!({"keysets": [{"id": KEYSET, "unit": "sat", "active": true, "input_fee_ppk": 0}]}),
        ),
        (
            "GET",
            "/v1/keys",
            serde_json::json!({"error": "Token already spent"}),
        ),
    ])
    .await;
    let token = ecash_wallet::encode_token_v3(&mint, &[synthetic_proof(100)], Some("sat")).unwrap();
    let error = receive_ecash(
        &mut invoice_fixture.wallet,
        &invoice_fixture.path,
        PASSWORD,
        invoice_request(token, &mint, 100, "inv-spent"),
    )
    .await
    .unwrap_err();
    assert_eq!(server.await.unwrap().len(), 2);
    assert_eq!(
        error.to_string(),
        r#"Failed to receive ecash: Mint error: "Token already spent""#
    );
    let saved = WalletState::load_encrypted(&invoice_fixture.path, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    assert_eq!(saved.transactions[0].status, TransactionStatus::Pending);
    assert_eq!(saved.total_balance(), 0);
}
