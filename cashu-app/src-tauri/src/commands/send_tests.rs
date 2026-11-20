use super::*;
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

#[test]
fn increased_fees_require_review_while_the_approved_boundary_is_accepted() {
    assert!(ensure_approved_total(100, 100).is_ok());
    assert!(ensure_approved_total(99, 100).is_ok());
    let error = ensure_approved_total(101, 100).unwrap_err();
    assert_eq!(error.code, SendEcashErrorCode::ReviewRequired);
    assert_eq!(
        error.message,
        "Mint fees changed. Review the payment again."
    );
}

#[tokio::test]
async fn unresolved_swap_keeps_the_durable_pending_transaction_id() {
    let fixture = TestWallet::new();
    let pubkey = ecash_core::MintKeypair::generate().public_key_hex();
    let error =
        send_ecash_operation(MINT.into(), 100, Some(pubkey), None, None, &fixture.state)
            .await
            .err()
            .expect("unavailable swap must fail");
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
