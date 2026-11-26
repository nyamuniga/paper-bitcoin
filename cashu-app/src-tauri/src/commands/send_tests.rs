use super::*;
use ecash_core::types::{Proof, SendTransactionData, Transaction, TransactionStatus, TransactionType};
use std::sync::{atomic::AtomicBool, Mutex};

const MINT: &str = "http://127.0.0.1:0";
const PASSWORD: &str = "synthetic-test-passphrase";

struct TestWallet {
    state: AppState,
    directory: std::path::PathBuf,
}

impl TestWallet {
    fn new() -> Self {
        let directory = std::env::temp_dir()
            .join(format!("bitnotes-send-contract-{}", rand::random::<u64>()));
        std::fs::create_dir(&directory).unwrap();
        let mut wallet = ecash_wallet::WalletState::new("00".repeat(32), None);
        wallet.proofs.insert(
            MINT.to_string(),
            vec![Proof {
                amount: 100,
                id: "0000000000000000".into(),
                secret: "synthetic-unfunded-proof".into(),
                c: format!("02{}", "11".repeat(32)),
                c_prime: None,
                b_prime: None,
                witness: None,
                dleq: None,
                derivation_index: 0,
            }],
        );
        Self {
            state: AppState {
                passphrase: Mutex::new(Some(PASSWORD.into())),
                wallet_path: directory.join("wallet.json"),
                wallet: tokio::sync::Mutex::new(Some(wallet)),
                pending_nwc_requests: Mutex::new(Vec::new()),
                nwc_enabled: AtomicBool::new(false),
            },
            directory,
        }
    }
}

impl Drop for TestWallet {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

#[tokio::test]
async fn locked_wallet_and_local_load_failure_have_distinct_codes() {
    let fixture = TestWallet::new();
    *fixture.state.passphrase.lock().unwrap() = None;
    let error = send_ecash_operation(MINT.into(), 100, None, None, None, &fixture.state)
        .await
        .err()
        .expect("locked send must fail");
    assert_eq!(error.code, SendEcashErrorCode::WalletLocked);
    assert_eq!(error.message, "Wallet is locked");
    let legacy = fixture.state.lock_and_get_wallet().await.err().unwrap();
    assert_eq!(legacy.0, error.message);

    *fixture.state.passphrase.lock().unwrap() = Some(PASSWORD.into());
    *fixture.state.wallet.lock().await = None;
    let error = send_ecash_operation(MINT.into(), 100, None, None, None, &fixture.state)
        .await
        .err()
        .expect("missing wallet file must fail");
    assert_eq!(error.code, SendEcashErrorCode::InternalError);
    assert_eq!(error.tx_id, None);
    let legacy = fixture.state.lock_and_get_wallet().await.err().unwrap();
    assert_eq!(legacy.0, error.message);
}

#[tokio::test]
async fn invalid_requests_keep_their_legacy_messages_without_changing_proofs() {
    let fixture = TestWallet::new();
    for (request, cap, message) in [
        (
            Some("request".into()),
            None,
            "Ecash payments require a request and approved total",
        ),
        (
            Some("x".repeat(28672)),
            Some(100),
            "Ecash request too large",
        ),
    ] {
        let error = send_ecash_operation(MINT.into(), 100, None, request, cap, &fixture.state)
            .await
            .err()
            .expect("invalid request must fail");
        assert_eq!(error.code, SendEcashErrorCode::InvalidRequest);
        assert_eq!(error.message, message);
        assert_eq!(error.tx_id, None);
    }
    let guard = fixture.state.wallet.lock().await;
    let wallet = guard.as_ref().unwrap();
    assert_eq!(wallet.total_balance(), 100);
    assert!(wallet.transactions.is_empty());
}

#[tokio::test]
async fn missing_and_empty_proofs_report_insufficient_funds() {
    let fixture = TestWallet::new();
    for empty_entry in [false, true] {
        {
            let mut guard = fixture.state.wallet.lock().await;
            let wallet = guard.as_mut().unwrap();
            wallet.proofs.clear();
            if empty_entry {
                wallet.proofs.insert(MINT.into(), Vec::new());
            }
        }
        let error = send_ecash_operation(MINT.into(), 100, None, None, None, &fixture.state)
            .await
            .err()
            .expect("empty wallet must fail");
        assert_eq!(error.code, SendEcashErrorCode::InsufficientFunds);
        assert_eq!(
            error.message,
            if empty_entry {
                "No proofs available for this mint".to_string()
            } else {
                format!("No proofs found for mint {}", MINT)
            }
        );
    }
}

#[tokio::test]
async fn duplicate_request_returns_existing_identity_without_another_send() {
    let fixture = TestWallet::new();
    fixture
        .state
        .wallet
        .lock()
        .await
        .as_mut()
        .unwrap()
        .transactions
        .push(Transaction {
            id: "existing-send".into(),
            tx_type: TransactionType::Send(SendTransactionData {
                payment_request: Some("request".into()),
                token_string: String::new(),
                proofs: Vec::new(),
            }),
            amount: 100,
            fee: 0,
            status: TransactionStatus::Pending,
            timestamp: 0,
            mint_url: MINT.into(),
        });
    let error = send_ecash_operation(
        MINT.into(),
        100,
        None,
        Some("request".into()),
        Some(100),
        &fixture.state,
    )
    .await
    .err()
    .expect("duplicate request must fail");
    assert_eq!(error.code, SendEcashErrorCode::InvalidRequest);
    assert_eq!(error.tx_id.as_deref(), Some("existing-send"));
    assert_eq!(
        error.message,
        "A payment already exists for this request. Resume it instead of creating another."
    );
    assert_eq!(
        fixture
            .state
            .wallet
            .lock()
            .await
            .as_ref()
            .unwrap()
            .transactions
            .len(),
        1
    );
}

#[tokio::test]
async fn preparation_outage_leaves_proofs_and_history_untouched() {
    let fixture = TestWallet::new();
    let error = send_ecash_operation(
        MINT.into(),
        100,
        None,
        Some("request".into()),
        Some(200),
        &fixture.state,
    )
    .await
    .err()
    .expect("unavailable quote must fail");
    assert_eq!(error.code, SendEcashErrorCode::ServiceUnavailable);
    assert_eq!(error.tx_id, None);
    let guard = fixture.state.wallet.lock().await;
    assert_eq!(guard.as_ref().unwrap().total_balance(), 100);
    assert!(guard.as_ref().unwrap().transactions.is_empty());
}

#[tokio::test]
async fn offline_swap_fails_before_pending_record_with_service_unavailable() {
    let fixture = TestWallet::new();
    let pubkey = ecash_core::MintKeypair::generate().public_key_hex();
    let error =
        send_ecash_operation(MINT.into(), 100, Some(pubkey), None, None, &fixture.state)
            .await
            .err()
            .expect("offline swap must fail cleanly");
    assert_eq!(error.code, SendEcashErrorCode::ServiceUnavailable);
    assert_eq!(error.tx_id, None);
    let guard = fixture.state.wallet.lock().await;
    assert_eq!(guard.as_ref().unwrap().total_balance(), 100);
    assert!(guard.as_ref().unwrap().transactions.is_empty());
    assert!(!fixture.state.wallet_path.exists());
}

#[tokio::test]
async fn unresolved_swap_keeps_the_durable_pending_transaction_id() {
    let fixture = TestWallet::new();
    let initial_save = fixture.directory.join("initial-wallet.json");
    let (mint, server) = recovery_fault_mint(
        fixture.state.wallet_path.clone(),
        initial_save,
        false,
    );
    {
        let mut guard = fixture.state.wallet.lock().await;
        let wallet = guard.as_mut().unwrap();
        let proofs = wallet.proofs.remove(MINT).unwrap();
        wallet.proofs.insert(mint.clone(), proofs);
    }
    let pubkey = ecash_core::MintKeypair::generate().public_key_hex();
    let error =
        send_ecash_operation(mint, 100, Some(pubkey), None, None, &fixture.state)
            .await
            .err()
            .expect("unavailable swap must fail");
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
    assert!(error.message.starts_with("Failed to split tokens: "));
    let saved = ecash_wallet::WalletState::load_encrypted(&fixture.state.wallet_path, PASSWORD)
        .unwrap();
    let transaction = saved
        .transactions
        .iter()
        .find(|tx| Some(&tx.id) == error.tx_id.as_ref())
        .expect("pending transaction must survive restart");
    assert_eq!(transaction.status, TransactionStatus::Pending);
}

#[tokio::test]
async fn final_save_failure_is_unresolved_even_without_a_durable_id() {
    let fixture = TestWallet::new();
    std::fs::create_dir(&fixture.state.wallet_path).unwrap();
    let error = send_ecash_operation(MINT.into(), 100, None, None, None, &fixture.state)
        .await
        .err()
        .expect("final save to directory must fail");
    assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
    assert_eq!(error.tx_id, None);
    assert_eq!(
        fixture
            .state
            .wallet
            .lock()
            .await
            .as_ref()
            .unwrap()
            .total_balance(),
        0
    );
}

#[tokio::test]
async fn successful_send_preserves_the_existing_result_shape() {
    let fixture = TestWallet::new();
    let result = send_ecash_operation(MINT.into(), 100, None, None, None, &fixture.state)
        .await
        .expect("synthetic exact-proof transfer must succeed");
    assert_eq!(result.token, result.token_v3);
    assert!(result.token_v3.starts_with("cashuA"));
    assert!(result.token_v4.starts_with("cashuB"));
    let value = serde_json::to_value(result).unwrap();
    let mut keys: Vec<_> = value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(keys, ["token", "token_v3", "token_v4", "tx_id"]);
    let saved = ecash_wallet::WalletState::load_encrypted(&fixture.state.wallet_path, PASSWORD)
        .unwrap();
    assert_eq!(saved.transactions[0].status, TransactionStatus::Success);
    assert_eq!(saved.total_balance(), 0);
}

#[tokio::test]
async fn swap_failure_and_recovery_save_failure_preserve_both_diagnostics() {
    let fixture = TestWallet::new();
    let initial_save = fixture.directory.join("initial-wallet.json");
    let (mint, server) = recovery_fault_mint(
        fixture.state.wallet_path.clone(),
        initial_save.clone(),
        true,
    );
    {
        let mut guard = fixture.state.wallet.lock().await;
        let wallet = guard.as_mut().unwrap();
        let proofs = wallet.proofs.remove(MINT).unwrap();
        wallet.proofs.insert(mint.clone(), proofs);
    }
    let pubkey = ecash_core::MintKeypair::generate().public_key_hex();
    let error = send_ecash_operation(mint, 100, Some(pubkey), None, None, &fixture.state)
        .await
        .err()
        .expect("ambiguous split and failed recovery save must return an error");
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests.iter().all(|request| request.starts_with("GET ")));
    assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
    assert!(error.message.contains("synthetic-split-failure"));
    assert!(error.message.contains("Recovery state could not be saved"));
    let save_error = std::fs::rename(
        fixture.state.wallet_path.with_extension("json.tmp"),
        &fixture.state.wallet_path,
    )
    .unwrap_err();
    assert!(error.message.contains(&save_error.to_string()));
    assert!(error.message.contains("do not resend"));

    let saved = ecash_wallet::WalletState::load_encrypted(&initial_save, PASSWORD).unwrap();
    let transaction = saved
        .transactions
        .iter()
        .find(|transaction| Some(&transaction.id) == error.tx_id.as_ref())
        .expect("the original pending send identity must be retained");
    assert_eq!(transaction.status, TransactionStatus::Pending);
    assert_eq!(saved.transactions.len(), 1);
    assert_eq!(transaction.amount, 100);
    assert_eq!(transaction.fee, 0);
    let (saved_mint, saved_proofs) = saved.proofs.iter().next().unwrap();
    assert_eq!(&transaction.mint_url, saved_mint);
    let TransactionType::Send(data) = &transaction.tx_type else {
        panic!("the durable intent must be an eCash send");
    };
    assert!(data.token_string.is_empty());
    assert_eq!(data.payment_request, None);
    assert_eq!(
        serde_json::to_value(&data.proofs).unwrap(),
        serde_json::to_value(saved_proofs).unwrap()
    );
    let legacy = crate::error::CommandError::from(error);
    assert!(legacy.0.contains("synthetic-split-failure"));
    assert!(legacy.0.contains(&save_error.to_string()));
}

#[tokio::test]
async fn send_holds_the_wallet_lock_across_mint_awaits_and_queues_other_sends() {
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::sync::oneshot;

    let fixture = TestWallet::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mint = format!("http://{}", listener.local_addr().unwrap());
    {
        let mut guard = fixture.state.wallet.lock().await;
        let wallet = guard.as_mut().unwrap();
        let proofs = wallet.proofs.remove(MINT).unwrap();
        wallet.proofs.insert(mint.clone(), proofs);
    }
    let (entered, arrived) = oneshot::channel();
    let (resume, release) = oneshot::channel();
    let server = tokio::spawn(async move {
        let mut entered = Some(entered);
        let mut release = Some(release);
        let mut requests = Vec::new();
        for path in ["/v1/keysets", "/v1/keys"] {
            let (stream, _) = tokio::time::timeout(Duration::from_secs(10), listener.accept())
                .await
                .unwrap()
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut request = String::new();
            reader.read_line(&mut request).await.unwrap();
            assert!(request.starts_with(&format!("GET {path} ")));
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).await.unwrap() == 0 || header == "\r\n" {
                    break;
                }
            }
            requests.push(request);
            let body = if path == "/v1/keysets" {
                entered.take().unwrap().send(()).unwrap();
                release.take().unwrap().await.unwrap();
                r#"{"keysets":[]}"#
            } else {
                r#"{"error":"synthetic-stop-before-swap"}"#
            };
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            reader
                .get_mut()
                .write_all(response.as_bytes())
                .await
                .unwrap();
        }
        requests
    });

    let first = send_ecash_operation(mint.clone(), 50, None, None, None, &fixture.state);
    tokio::pin!(first);
    tokio::select! {
        _ = &mut first => panic!("send completed before the mint gate"),
        arrived = arrived => arrived.unwrap(),
    }
    assert!(
        fixture.state.wallet.try_lock().is_err(),
        "send must retain its guard while awaiting the mint"
    );
    let second = send_ecash_operation(mint, 50, None, Some("request".into()), None, &fixture.state);
    tokio::pin!(second);
    tokio::select! {
        biased;
        _ = &mut second => panic!("second send bypassed the wallet lock"),
        _ = std::future::ready(()) => {},
    }
    resume.send(()).unwrap();
    assert_eq!(
        first.await.err().unwrap().code,
        SendEcashErrorCode::OutcomeUnknown
    );
    // Tokio reserves the released mutex for the queued send before try_lock.
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(10), second)
            .await
            .expect("queued send must resume after the first releases its guard")
            .err()
            .unwrap()
            .code,
        SendEcashErrorCode::InvalidRequest
    );
    assert!(
        fixture.state.wallet.try_lock().is_ok(),
        "settled sends must release their guards"
    );
    assert_eq!(server.await.unwrap().len(), 2);
    assert_eq!(
        fixture
            .state
            .wallet
            .lock()
            .await
            .as_ref()
            .unwrap()
            .transactions
            .len(),
        1
    );
}

fn recovery_fault_mint(
    wallet_path: std::path::PathBuf,
    saved_snapshot: std::path::PathBuf,
    fail_save: bool,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    use std::io::{BufRead, BufReader, Write};
    use std::time::{Duration, Instant};
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
                // Optionally block the recovery write after the initial intent is durable.
                if fail_save {
                    std::fs::rename(&wallet_path, &saved_snapshot).unwrap();
                    std::fs::create_dir(&wallet_path).unwrap();
                }
                r#"{"error":"synthetic-split-failure"}"#
            } else {
                r#"{"keysets":[]}"#
            };
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        }
        requests
    });

    (mint, server)
}

#[tokio::test]
async fn receive_input_validation_keeps_its_precedence_over_wallet_access() {
    let fixture = TestWallet::new();
    let proofs = fixture.state.wallet.lock().await.as_ref().unwrap().proofs[MINT].clone();
    let valid_token = ecash_wallet::encode_token_v3(MINT, &proofs, Some("sat")).unwrap();
    *fixture.state.passphrase.lock().unwrap() = None;
    for (token, mint, amount, invoice_id, message) in [
        ("not-a-token".into(), None, None, None, "Wallet is locked"),
        (
            "not-a-token".into(),
            Some(MINT.into()),
            None,
            Some("invoice".into()),
            "Incomplete invoice payment constraints",
        ),
        (
            "x".repeat(100001),
            Some(MINT.into()),
            Some(100),
            Some("invoice".into()),
            "Invoice payment is too large",
        ),
        (
            "not-a-token".into(),
            Some(MINT.into()),
            Some(100),
            Some("invoice".into()),
            "Invalid token: must start with cashuA or cashuB",
        ),
        (
            valid_token,
            Some(MINT.into()),
            Some(100),
            Some("invoice".into()),
            "Wallet is locked",
        ),
    ] {
        let error = receive_ecash_operation(token, None, mint, amount, invoice_id, &fixture.state)
            .await
            .err()
            .expect("fixture must fail before any mint request");
        assert_eq!(error.0, message);
    }
}

#[tokio::test]
async fn receive_parse_error_retains_its_prefix_and_nostr_update_order() {
    let fixture = TestWallet::new();
    let error = receive_ecash_operation(
        "not-a-token".into(),
        Some("synthetic-key".into()),
        None,
        None,
        None,
        &fixture.state,
    )
    .await
    .err()
    .expect("malformed token must fail");
    assert_eq!(
        error.0,
        "Failed to parse token: Invalid token: must start with cashuA or cashuB"
    );
    let guard = fixture.state.wallet.lock().await;
    let wallet = guard.as_ref().unwrap();
    assert_eq!(wallet.default_nostr_key.as_deref(), Some("synthetic-key"));
    assert_eq!(wallet.total_balance(), 100);
    assert!(wallet.transactions.is_empty());
    assert!(!fixture.state.wallet_path.exists());
}

#[tokio::test]
async fn receive_existing_raw_receipt_is_returned_before_decoding() {
    let fixture = TestWallet::new();
    fixture
        .state
        .wallet
        .lock()
        .await
        .as_mut()
        .unwrap()
        .transactions
        .push(Transaction {
            id: "synthetic-existing-receipt".into(),
            tx_type: TransactionType::ReceiveEcash(
                ecash_core::types::ReceiveEcashTransactionData {
                    token_string: "legacy-invalid-token".into(),
                    invoice_id: None,
                    claim_deferred: false,
                },
            ),
            amount: 17,
            fee: 0,
            status: TransactionStatus::Success,
            timestamp: 1,
            mint_url: MINT.into(),
        });
    let amount = receive_ecash_operation(
        "legacy-invalid-token".into(),
        None,
        None,
        None,
        None,
        &fixture.state,
    )
    .await
    .unwrap();
    assert_eq!(amount, 17);
    assert!(!fixture.state.wallet_path.exists());
    assert_eq!(
        fixture
            .state
            .wallet
            .lock()
            .await
            .as_ref()
            .unwrap()
            .transactions
            .len(),
        1
    );
}

#[tokio::test]
async fn receive_recovery_save_failure_reports_both_errors_without_success() {
    let fixture = TestWallet::new();
    let initial_save = fixture.directory.join("initial-receive.json");
    let (mint, server) = recovery_fault_mint(
        fixture.state.wallet_path.clone(),
        initial_save.clone(),
        true,
    );
    let proofs = fixture.state.wallet.lock().await.as_ref().unwrap().proofs[MINT].clone();
    let token = ecash_wallet::encode_token_v3(&mint, &proofs, Some("sat")).unwrap();
    let error = receive_ecash_operation(token.clone(), None, None, None, None, &fixture.state)
        .await
        .err()
        .expect("failed receive and recovery save cannot return success");
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests.iter().all(|request| request.starts_with("GET ")));
    assert!(error.0.contains("synthetic-split-failure"));
    assert!(error.0.contains("Recovery state could not be saved"));
    let save_error = std::fs::rename(
        fixture.state.wallet_path.with_extension("json.tmp"),
        &fixture.state.wallet_path,
    )
    .unwrap_err();
    assert!(error.0.contains(&save_error.to_string()));
    assert!(error.0.contains("check History"));
    let saved = ecash_wallet::WalletState::load_encrypted(&initial_save, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    let transaction = &saved.transactions[0];
    assert_eq!(transaction.status, TransactionStatus::Pending);
    assert!(
        matches!(&transaction.tx_type, TransactionType::ReceiveEcash(data) if data.token_string == token)
    );
    let guard = fixture.state.wallet.lock().await;
    let wallet = guard.as_ref().unwrap();
    assert_eq!(wallet.transactions[0].id, transaction.id);
    assert_eq!(wallet.transactions[0].status, TransactionStatus::Pending);
    assert_eq!(wallet.total_balance(), 100);
}

#[tokio::test]
async fn receive_recovery_save_success_preserves_the_existing_error_message() {
    let fixture = TestWallet::new();
    let (mint, server) = recovery_fault_mint(
        fixture.state.wallet_path.clone(),
        fixture.directory.join("unused-snapshot.json"),
        false,
    );
    let proofs = fixture.state.wallet.lock().await.as_ref().unwrap().proofs[MINT].clone();
    let token = ecash_wallet::encode_token_v3(&mint, &proofs, Some("sat")).unwrap();
    let error = receive_ecash_operation(token, None, None, None, None, &fixture.state)
        .await
        .err()
        .expect("the receive failure must remain an error");
    server.join().unwrap();
    assert_eq!(
        error.0,
        r#"Failed to receive ecash: Mint error: "synthetic-split-failure""#
    );
    let saved =
        ecash_wallet::WalletState::load_encrypted(&fixture.state.wallet_path, PASSWORD).unwrap();
    assert_eq!(saved.transactions.len(), 1);
    assert_eq!(saved.transactions[0].status, TransactionStatus::Pending);
}

#[tokio::test]
async fn receive_holds_the_wallet_lock_across_mint_awaits_and_queues_other_receives() {
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::sync::oneshot;

    let fixture = TestWallet::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mint = format!("http://{}", listener.local_addr().unwrap());
    let proofs = fixture.state.wallet.lock().await.as_ref().unwrap().proofs[MINT].clone();
    let token = ecash_wallet::encode_token_v3(&mint, &proofs, Some("sat")).unwrap();

    let (entered, arrived) = oneshot::channel();
    let (resume, release) = oneshot::channel();
    let server = tokio::spawn(async move {
        let mut entered = Some(entered);
        let mut release = Some(release);
        let mut requests = Vec::new();
        for path in ["/v1/keysets", "/v1/keys"] {
            let (stream, _) = tokio::time::timeout(Duration::from_secs(10), listener.accept())
                .await
                .unwrap()
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut request = String::new();
            reader.read_line(&mut request).await.unwrap();
            assert!(request.starts_with(&format!("GET {path} ")));
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).await.unwrap() == 0 || header == "\r\n" {
                    break;
                }
            }
            requests.push(request);
            let body = if path == "/v1/keysets" {
                entered.take().unwrap().send(()).unwrap();
                release.take().unwrap().await.unwrap();
                r#"{"keysets":[]}"#
            } else {
                r#"{"error":"synthetic-stop-before-swap"}"#
            };
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

    let first = receive_ecash_operation(token, None, None, None, None, &fixture.state);
    tokio::pin!(first);
    tokio::select! {
        _ = &mut first => panic!("receive completed before the mint gate"),
        arrived = arrived => arrived.unwrap(),
    }
    assert!(
        fixture.state.wallet.try_lock().is_err(),
        "receive must retain its guard while awaiting the mint"
    );
    let second = receive_ecash_operation(
        "not-a-token".into(),
        None,
        None,
        None,
        None,
        &fixture.state,
    );
    tokio::pin!(second);
    tokio::select! {
        biased;
        _ = &mut second => panic!("second receive bypassed the wallet lock"),
        _ = std::future::ready(()) => {},
    }
    resume.send(()).unwrap();
    assert!(first
        .await
        .err()
        .unwrap()
        .0
        .contains("synthetic-stop-before-swap"));
    // Tokio reserves the released mutex for the queued receive before try_lock.
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(10), second)
            .await
            .expect("queued receive must resume after the first releases its guard")
            .err()
            .unwrap()
            .0,
        "Failed to parse token: Invalid token: must start with cashuA or cashuB"
    );
    assert!(
        fixture.state.wallet.try_lock().is_ok(),
        "settled receives must release their guards"
    );
    assert_eq!(server.await.unwrap().len(), 2);
}
