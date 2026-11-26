use ecash_core::types::{
    Proof, SendTransactionData, Transaction, TransactionStatus, TransactionType,
};
use ecash_wallet::{
    send::{send_ecash, send_ecash_with_storage, SendEcashRequest},
    send_error::SendEcashErrorCode,
    storage::WalletStorage,
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
}

impl TestWallet {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("bitnotes-wallet-send-{}", rand::random::<u64>()));
        std::fs::create_dir(&directory).unwrap();
        let mut wallet = WalletState::new("00".repeat(32), None);
        wallet.proofs.insert(
            MINT.into(),
            vec![Proof {
                amount: 100,
                id: KEYSET.into(),
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
            wallet,
            path: directory.join("wallet.json"),
        }
    }
}

impl Drop for TestWallet {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.path.parent().unwrap());
    }
}

fn request(mint: &str, cap: Option<u64>) -> SendEcashRequest {
    SendEcashRequest {
        mint_url: mint.into(),
        amount: 50,
        pubkey: None,
        payment_request: Some("synthetic-request".into()),
        payment_max_total: cap,
    }
}

#[tokio::test]
async fn duplicate_requests_keep_their_identity_for_every_existing_status() {
    for status in [
        TransactionStatus::Pending,
        TransactionStatus::Success,
        TransactionStatus::Failed,
        TransactionStatus::FailedMintError,
    ] {
        let mut fixture = TestWallet::new();
        fixture.wallet.transactions.push(Transaction {
            id: "existing-send".into(),
            tx_type: TransactionType::Send(SendTransactionData {
                payment_request: Some("synthetic-request".into()),
                token_string: String::new(),
                proofs: Vec::new(),
            }),
            amount: 50,
            fee: 0,
            status,
            timestamp: 1,
            mint_url: "https://another-mint.invalid".into(),
        });
        let before = serde_json::to_value(&fixture.wallet).unwrap();
        let error = send_ecash(
            &mut fixture.wallet,
            &fixture.path,
            PASSWORD,
            request(MINT, Some(50)),
        )
        .await
        .err()
        .expect("duplicate must be rejected before mint access");
        assert_eq!(error.code, SendEcashErrorCode::InvalidRequest);
        assert_eq!(error.tx_id.as_deref(), Some("existing-send"));
        assert_eq!(
            error.message,
            "A payment already exists for this request. Resume it instead of creating another."
        );
        assert_eq!(serde_json::to_value(&fixture.wallet).unwrap(), before);
        assert!(!fixture.path.exists());
    }
}

#[tokio::test]
async fn standalone_exact_send_saves_the_same_result_without_tauri_state() {
    let mut fixture = TestWallet::new();
    let input = SendEcashRequest {
        mint_url: MINT.into(),
        amount: 100,
        pubkey: None,
        payment_request: None,
        payment_max_total: None,
    };
    let result = send_ecash(&mut fixture.wallet, &fixture.path, PASSWORD, input)
        .await
        .unwrap();
    let saved = WalletState::load_encrypted(&fixture.path, PASSWORD).unwrap();
    assert_eq!(saved.total_balance(), 0);
    assert_eq!(saved.transactions.len(), 1);
    let transaction = &saved.transactions[0];
    assert_eq!(transaction.id, result.tx_id);
    assert_eq!(transaction.status, TransactionStatus::Success);
    let TransactionType::Send(data) = &transaction.tx_type else {
        panic!("expected send receipt")
    };
    assert_eq!(data.token_string, result.token);
    assert_eq!(result.token, result.token_v3);
    assert!(result.token_v4.starts_with("cashuB"));
}

async fn mint_with_responses(
    responses: Vec<(&'static str, serde_json::Value)>,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (path, body) in responses {
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
            requests.push(request.trim().to_string());
            let body = body.to_string();
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
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

fn keysets(fee: u64) -> serde_json::Value {
    serde_json::json!({"keysets": [{"id": KEYSET, "unit": "sat", "active": true, "input_fee_ppk": fee}]})
}

#[tokio::test]
async fn approved_totals_are_checked_at_quote_and_again_before_swap() {
    // Quote total = 50; the later keyset read raises the swap input fee to 1.
    for (cap, expected_requests) in [(49, 2), (50, 3), (51, 4)] {
        let mut fixture = TestWallet::new();
        let mut responses = vec![
            ("/v1/keysets", keysets(0)),
            (
                "/v1/keys",
                serde_json::json!({"keysets": [{"id": KEYSET, "keys": {}}]}),
            ),
        ];
        if expected_requests >= 3 {
            responses.push(("/v1/keysets", keysets(1000)));
        }
        if expected_requests == 4 {
            responses.push((
                "/v1/keys",
                serde_json::json!({"error": "synthetic-stop-before-swap"}),
            ));
        }
        let (mint, server) = mint_with_responses(responses).await;
        let proofs = fixture.wallet.proofs.remove(MINT).unwrap();
        fixture.wallet.proofs.insert(mint.clone(), proofs);
        let before = serde_json::to_value(&fixture.wallet).unwrap();
        let error = send_ecash(
            &mut fixture.wallet,
            &fixture.path,
            PASSWORD,
            request(&mint, Some(cap)),
        )
        .await
        .err()
        .expect("fixture must stop before any swap submission");
        assert_eq!(server.await.unwrap().len(), expected_requests);
        if cap < 51 {
            assert_eq!(error.code, SendEcashErrorCode::ReviewRequired);
            assert_eq!(
                error.message,
                "Mint fees changed. Review the payment again."
            );
            assert_eq!(error.tx_id, None);
            assert_eq!(serde_json::to_value(&fixture.wallet).unwrap(), before);
            assert!(!fixture.path.exists());
        } else {
            assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
            assert!(error.message.contains("synthetic-stop-before-swap"));
            let saved = WalletState::load_encrypted(&fixture.path, PASSWORD).unwrap();
            assert_eq!(saved.transactions.len(), 1);
            let transaction = &saved.transactions[0];
            assert_eq!(Some(&transaction.id), error.tx_id.as_ref());
            assert_eq!(transaction.status, TransactionStatus::Pending);
            assert_eq!(transaction.amount, 50);
            assert_eq!(transaction.fee, 1);
            assert_eq!(saved.total_balance(), 100);
        }
    }
}

struct ScriptedStorage {
    outcomes: std::collections::VecDeque<Result<(), &'static str>>,
    snapshots: Vec<WalletState>,
}

impl ScriptedStorage {
    fn new(outcomes: impl IntoIterator<Item = Result<(), &'static str>>) -> Self {
        Self {
            outcomes: outcomes.into_iter().collect(),
            snapshots: Vec::new(),
        }
    }
}

impl WalletStorage for ScriptedStorage {
    fn save(&mut self, state: &WalletState) -> anyhow::Result<()> {
        self.snapshots.push(state.clone());
        match self.outcomes.pop_front().unwrap_or(Ok(())) {
            Ok(()) => Ok(()),
            Err(message) => Err(anyhow::anyhow!(message)),
        }
    }
}

#[tokio::test]
async fn injected_storage_failure_before_swap_blocks_swap_submission() {
    let mut fixture = TestWallet::new();
    let (mint, server) = mint_with_responses(vec![("/v1/keysets", keysets(0))]).await;
    let proofs = fixture.wallet.proofs.remove(MINT).unwrap();
    fixture.wallet.proofs.insert(mint.clone(), proofs);

    let mut storage = ScriptedStorage::new([Err("injected-pre-swap-save-error")]);
    let error = send_ecash_with_storage(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        SendEcashRequest {
            mint_url: mint,
            amount: 50,
            pubkey: None,
            payment_request: None,
            payment_max_total: None,
        },
        &mut storage,
    )
    .await
    .err()
    .expect("pre-swap save failure must abort before swap");

    // Only /v1/keysets was fetched; /v1/keys (swap preparation) was never reached.
    assert_eq!(server.await.unwrap().len(), 1);
    assert_eq!(storage.snapshots.len(), 1);
    assert_eq!(error.code, SendEcashErrorCode::InternalError);
    assert_eq!(error.tx_id, None);
    assert_eq!(error.message, "injected-pre-swap-save-error");
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn injected_storage_failure_after_swap_error_reports_both_diagnostics() {
    let mut fixture = TestWallet::new();
    let (mint, server) = mint_with_responses(vec![
        ("/v1/keysets", keysets(0)),
        (
            "/v1/keys",
            serde_json::json!({"error": "synthetic-swap-failure"}),
        ),
    ])
    .await;
    let proofs = fixture.wallet.proofs.remove(MINT).unwrap();
    fixture.wallet.proofs.insert(mint.clone(), proofs);

    // First save (durable pending intent) succeeds; second save (post-swap recovery) fails.
    let mut storage = ScriptedStorage::new([Ok(()), Err("injected-recovery-save-error")]);
    let error = send_ecash_with_storage(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        SendEcashRequest {
            mint_url: mint,
            amount: 50,
            pubkey: None,
            payment_request: None,
            payment_max_total: None,
        },
        &mut storage,
    )
    .await
    .err()
    .expect("post-swap recovery save failure must report unknown outcome");

    assert_eq!(server.await.unwrap().len(), 2);
    assert_eq!(storage.snapshots.len(), 2);
    assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
    assert!(error.message.contains("synthetic-swap-failure"));
    assert!(error.message.contains(
        " Recovery state could not be saved: injected-recovery-save-error. Outcome remains unknown; do not resend."
    ));

    let pre_swap_snapshot = &storage.snapshots[0];
    assert_eq!(pre_swap_snapshot.transactions.len(), 1);
    let pending_tx = &pre_swap_snapshot.transactions[0];
    assert_eq!(Some(&pending_tx.id), error.tx_id.as_ref());
    assert_eq!(pending_tx.status, TransactionStatus::Pending);
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn injected_storage_failure_on_exact_send_final_save_reports_unknown_outcome() {
    let mut fixture = TestWallet::new();
    let mut storage = ScriptedStorage::new([Err("injected-final-save-error")]);
    let error = send_ecash_with_storage(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        SendEcashRequest {
            mint_url: MINT.into(),
            amount: 100,
            pubkey: None,
            payment_request: None,
            payment_max_total: None,
        },
        &mut storage,
    )
    .await
    .err()
    .expect("final save failure must return unknown outcome");

    assert_eq!(storage.snapshots.len(), 1);
    assert_eq!(error.code, SendEcashErrorCode::OutcomeUnknown);
    assert_eq!(error.tx_id, None);
    assert_eq!(error.message, "injected-final-save-error");
    assert_eq!(fixture.wallet.total_balance(), 0);
    assert!(!fixture.path.exists());
}

#[tokio::test]
async fn send_normalizes_proofs_explicitly_before_calling_injected_storage() {
    let mut fixture = TestWallet::new();
    // Add duplicate proofs under another mint so send_ecash_with_storage does not touch them
    // directly, proving explicit normalization runs before storage.save without save_encrypted.
    let other_mint = "https://other-mint.invalid";
    fixture.wallet.proofs.insert(
        other_mint.into(),
        vec![
            Proof {
                amount: 8,
                id: KEYSET.into(),
                secret: "dup-proof".into(),
                c: format!("02{}", "11".repeat(32)),
                c_prime: None,
                b_prime: None,
                witness: None,
                dleq: None,
                derivation_index: 1,
            },
            Proof {
                amount: 64,
                id: KEYSET.into(),
                secret: "dup-proof".into(),
                c: format!("02{}", "11".repeat(32)),
                c_prime: None,
                b_prime: None,
                witness: None,
                dleq: None,
                derivation_index: 2,
            },
        ],
    );

    let mut storage = ScriptedStorage::new([Ok(())]);
    send_ecash_with_storage(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        SendEcashRequest {
            mint_url: MINT.into(),
            amount: 100,
            pubkey: None,
            payment_request: None,
            payment_max_total: None,
        },
        &mut storage,
    )
    .await
    .unwrap();

    assert_eq!(storage.snapshots.len(), 1);
    let saved_other = &storage.snapshots[0].proofs[other_mint];
    assert_eq!(saved_other.len(), 1);
    assert_eq!(saved_other[0].amount, 8);
    assert_eq!(saved_other[0].derivation_index, 1);
}

#[tokio::test]
async fn offline_swap_returns_service_unavailable_without_pending_record() {
    let mut fixture = TestWallet::new();
    let error = send_ecash(
        &mut fixture.wallet,
        &fixture.path,
        PASSWORD,
        SendEcashRequest {
            mint_url: MINT.into(),
            amount: 50,
            pubkey: None,
            payment_request: None,
            payment_max_total: None,
        },
    )
    .await
    .err()
    .expect("offline swap must fail cleanly");

    assert_eq!(error.code, SendEcashErrorCode::ServiceUnavailable);
    assert_eq!(error.tx_id, None);
    assert_eq!(fixture.wallet.total_balance(), 100);
    assert!(fixture.wallet.transactions.is_empty());
    assert!(!fixture.path.exists());
}
