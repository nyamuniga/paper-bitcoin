use ecash_core::types::{Dleq, Proof, TransactionStatus, TransactionType};
use ecash_wallet::outgoing::PendingSend;

fn selected_proofs() -> Vec<Proof> {
    [2, 8]
        .into_iter()
        .enumerate()
        .map(|(index, amount)| Proof {
            amount,
            id: "0001020304050607".into(),
            secret: format!("synthetic-unfunded-{index}"),
            c: format!("02{}", "11".repeat(32)),
            c_prime: Some(format!("03{}", "22".repeat(32))),
            b_prime: Some(format!("02{}", "33".repeat(32))),
            witness: Some(serde_json::json!({"signatures": ["synthetic-witness"]})),
            dleq: Some(Dleq {
                e: "44".repeat(32),
                s: "55".repeat(32),
            }),
            derivation_index: index as u64,
        })
        .collect()
}

#[test]
fn pending_send_preserves_the_full_recovery_record_contract() {
    let proofs = selected_proofs();
    let expected_proofs = serde_json::to_value(&proofs).unwrap();
    let transaction = PendingSend {
        id: "tx_send_1700000000123".into(),
        payment_request: Some("synthetic-payment-request".into()),
        proofs,
        amount: 7,
        fee: 1,
        timestamp: 1_700_000_000,
        mint_url: "https://synthetic-mint.invalid/path/".into(),
    }
    .into_transaction();

    // Check the saved JSON contract, including every proof credential and order.
    assert_eq!(
        serde_json::to_value(transaction).unwrap(),
        serde_json::json!({
            "id": "tx_send_1700000000123",
            "tx_type": {"Send": {
                "payment_request": "synthetic-payment-request",
                "token_string": "",
                "proofs": expected_proofs,
            }},
            "amount": 7,
            "fee": 1,
            "status": "Pending",
            "timestamp": 1_700_000_000,
            "mint_url": "https://synthetic-mint.invalid/path/",
        })
    );
}

#[test]
fn pending_send_without_a_request_keeps_the_legacy_omitted_field() {
    let transaction = PendingSend {
        id: "tx_send_synthetic-legacy".into(),
        payment_request: None,
        proofs: selected_proofs(),
        amount: 10,
        fee: 0,
        timestamp: 123,
        mint_url: "https://synthetic-mint.invalid".into(),
    }
    .into_transaction();

    assert_eq!(transaction.status, TransactionStatus::Pending);
    let TransactionType::Send(data) = &transaction.tx_type else {
        panic!("expected an eCash send record");
    };
    assert!(data.token_string.is_empty());
    assert_eq!(data.payment_request, None);
    let json = serde_json::to_value(&transaction).unwrap();
    assert!(json["tx_type"]["Send"].get("payment_request").is_none());
}

#[test]
fn pending_send_preserves_supplied_ids_and_scalar_boundaries_without_calculation() {
    for (amount, fee, timestamp) in [(0, u64::MAX, 1), (u64::MAX, 0, u64::MAX)] {
        let transaction = PendingSend {
            id: "caller-owned-recovery-id".into(),
            payment_request: None,
            proofs: Vec::new(),
            amount,
            fee,
            timestamp,
            mint_url: "https://synthetic-mint.invalid".into(),
        }
        .into_transaction();

        assert_eq!(transaction.id, "caller-owned-recovery-id");
        assert_eq!(transaction.amount, amount);
        assert_eq!(transaction.fee, fee);
        assert_eq!(transaction.timestamp, timestamp);
    }
}
