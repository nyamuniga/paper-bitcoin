//! Proof normalization and raw persistence separation tests (G11–G14).
//!
//! Verifies that explicit `WalletState::normalize_proofs_for_persistence` preserves
//! the characterized per-mint secret deduplication behavior and that raw persistence
//! (`WalletState::save_encrypted` and `storage::save_encrypted_wallet`) no longer
//! mutates domain state.

use ecash_core::types::{Dleq, Proof};
use ecash_wallet::{
    storage::{load_encrypted_wallet, save_encrypted_wallet},
    WalletState,
};
use std::path::PathBuf;

const PASSWORD: &str = "synthetic-normalization-passphrase";
const SEED_HEX: &str = "0000000000000000000000000000000000000000000000000000000000000002";
const MINT_A: &str = "https://mint-a.invalid";
const MINT_B: &str = "https://mint-b.invalid";

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", rand::random::<u64>()));
        std::fs::create_dir(&path).unwrap();
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn synthetic_proof(secret: &str, amount: u64, keyset: &str, derivation_index: u64) -> Proof {
    Proof {
        amount,
        id: keyset.into(),
        secret: secret.into(),
        c: format!("02{}", "11".repeat(32)),
        c_prime: None,
        b_prime: None,
        witness: None,
        dleq: None,
        derivation_index,
    }
}

#[test]
fn explicit_normalization_deduplicates_per_mint_by_secret_keeping_first_occurrence_and_order() {
    let dir = TempDir::new("bitnotes-norm-dedup");
    let path = dir.path.join("wallet.json");
    let mut wallet = WalletState::new(SEED_HEX.into(), None);

    let first_dup = synthetic_proof("dup-secret", 8, "0000000000000001", 1);
    let unique_mid = synthetic_proof("unique-secret", 16, "0000000000000001", 2);
    // Later duplicate with same secret but different amount/keyset/index is dropped.
    let second_dup = synthetic_proof("dup-secret", 64, "0000000000000002", 9);
    let unique_end = synthetic_proof("tail-secret", 4, "0000000000000001", 3);

    wallet.proofs.insert(
        MINT_A.into(),
        vec![first_dup, unique_mid, second_dup, unique_end],
    );

    wallet.normalize_proofs_for_persistence();
    wallet.save_encrypted(&path, PASSWORD).unwrap();

    let mem_proofs = &wallet.proofs[MINT_A];
    assert_eq!(mem_proofs.len(), 3);
    assert_eq!(
        mem_proofs
            .iter()
            .map(|p| (
                p.secret.as_str(),
                p.amount,
                p.id.as_str(),
                p.derivation_index
            ))
            .collect::<Vec<_>>(),
        vec![
            ("dup-secret", 8, "0000000000000001", 1),
            ("unique-secret", 16, "0000000000000001", 2),
            ("tail-secret", 4, "0000000000000001", 3),
        ]
    );
    assert_eq!(wallet.total_balance(), 28);

    let loaded = WalletState::load_encrypted(&path, PASSWORD).unwrap();
    assert_eq!(loaded.proofs[MINT_A].len(), 3);
    assert_eq!(loaded.total_balance(), 28);
    assert_eq!(loaded.proofs[MINT_A][0].amount, 8);
    assert_eq!(loaded.proofs[MINT_A][0].derivation_index, 1);
}

#[test]
fn explicit_normalization_scopes_deduplication_per_mint_not_globally() {
    let dir = TempDir::new("bitnotes-norm-per-mint");
    let path = dir.path.join("wallet.json");
    let mut wallet = WalletState::new(SEED_HEX.into(), None);

    wallet.proofs.insert(
        MINT_A.into(),
        vec![
            synthetic_proof("shared-secret", 8, "0000000000000001", 1),
            synthetic_proof("shared-secret", 8, "0000000000000001", 2),
        ],
    );
    wallet.proofs.insert(
        MINT_B.into(),
        vec![synthetic_proof("shared-secret", 16, "0000000000000002", 3)],
    );

    wallet.normalize_proofs_for_persistence();
    wallet.save_encrypted(&path, PASSWORD).unwrap();

    assert_eq!(wallet.proofs[MINT_A].len(), 1);
    assert_eq!(wallet.proofs[MINT_B].len(), 1);
    assert_eq!(wallet.total_balance(), 24);

    let loaded = WalletState::load_encrypted(&path, PASSWORD).unwrap();
    assert_eq!(loaded.proofs[MINT_A].len(), 1);
    assert_eq!(loaded.proofs[MINT_B].len(), 1);
    assert_eq!(loaded.total_balance(), 24);
}

#[test]
fn already_normalized_wallet_is_unchanged_in_memory_and_roundtrips_identically() {
    let dir = TempDir::new("bitnotes-norm-clean");
    let path = dir.path.join("wallet.json");
    let mut wallet = WalletState::new(SEED_HEX.into(), None);

    let mut with_metadata = synthetic_proof("s-1", 32, "0000000000000001", 5);
    with_metadata.witness = Some(serde_json::json!({"signatures": ["aa"]}));
    with_metadata.dleq = Some(Dleq {
        e: "ee".repeat(32),
        s: "ff".repeat(32),
    });
    let second = synthetic_proof("s-2", 4, "0000000000000001", 6);

    wallet.mints.push(MINT_A.into());
    wallet
        .proofs
        .insert(MINT_A.into(), vec![with_metadata, second]);
    wallet.proofs.insert(MINT_B.into(), Vec::new());

    let before = serde_json::to_value(&wallet).unwrap();
    wallet.normalize_proofs_for_persistence();
    wallet.save_encrypted(&path, PASSWORD).unwrap();
    let after = serde_json::to_value(&wallet).unwrap();
    assert_eq!(after, before);

    let loaded = WalletState::load_encrypted(&path, PASSWORD).unwrap();
    assert_eq!(serde_json::to_value(&loaded).unwrap(), before);
}

#[test]
fn save_encrypted_does_not_mutate_domain_state_on_success_or_failure() {
    let dir = TempDir::new("bitnotes-norm-immutable-save");
    let path = dir.path.join("wallet.json");
    let blocked_path = dir.path.join("blocked.json");
    std::fs::create_dir(&blocked_path).unwrap();

    let mut wallet = WalletState::new(SEED_HEX.into(), None);
    wallet.proofs.insert(
        MINT_A.into(),
        vec![
            synthetic_proof("dup", 8, "0000000000000001", 1),
            synthetic_proof("dup", 64, "0000000000000002", 2),
        ],
    );

    // Immutable borrow proves save_encrypted cannot mutate domain state.
    let immutable_wallet: &WalletState = &wallet;
    let before = serde_json::to_value(immutable_wallet).unwrap();

    immutable_wallet.save_encrypted(&path, PASSWORD).unwrap();
    assert_eq!(serde_json::to_value(immutable_wallet).unwrap(), before);
    let loaded = WalletState::load_encrypted(&path, PASSWORD).unwrap();
    assert_eq!(loaded.proofs[MINT_A].len(), 2);

    assert!(immutable_wallet
        .save_encrypted(&blocked_path, PASSWORD)
        .is_err());
    assert_eq!(serde_json::to_value(immutable_wallet).unwrap(), before);
}

#[test]
fn raw_storage_save_does_not_deduplicate_proofs() {
    let dir = TempDir::new("bitnotes-norm-raw");
    let path = dir.path.join("wallet.json");
    let mut wallet = WalletState::new(SEED_HEX.into(), None);
    wallet.proofs.insert(
        MINT_A.into(),
        vec![
            synthetic_proof("dup", 8, "0000000000000001", 1),
            synthetic_proof("dup", 8, "0000000000000001", 2),
        ],
    );

    save_encrypted_wallet(&wallet, &path, PASSWORD).unwrap();
    assert_eq!(wallet.proofs[MINT_A].len(), 2);

    let raw_loaded = load_encrypted_wallet(&path, PASSWORD).unwrap();
    assert_eq!(raw_loaded.proofs[MINT_A].len(), 2);
}

#[test]
fn explicit_normalize_proofs_for_persistence_matches_characterized_behavior() {
    let mut wallet = WalletState::new(SEED_HEX.into(), None);
    wallet.proofs.insert(
        MINT_A.into(),
        vec![
            synthetic_proof("dup", 8, "0000000000000001", 1),
            synthetic_proof("unique", 16, "0000000000000001", 2),
            synthetic_proof("dup", 64, "0000000000000002", 9),
        ],
    );
    wallet.proofs.insert(
        MINT_B.into(),
        vec![synthetic_proof("dup", 32, "0000000000000002", 3)],
    );

    wallet.normalize_proofs_for_persistence();

    assert_eq!(
        wallet.proofs[MINT_A]
            .iter()
            .map(|p| (p.secret.as_str(), p.amount, p.derivation_index))
            .collect::<Vec<_>>(),
        vec![("dup", 8, 1), ("unique", 16, 2)]
    );
    assert_eq!(wallet.proofs[MINT_B].len(), 1);
    assert_eq!(wallet.total_balance(), 56);

    // Idempotent on an already-normalized wallet.
    let normalized = serde_json::to_value(&wallet).unwrap();
    wallet.normalize_proofs_for_persistence();
    assert_eq!(serde_json::to_value(&wallet).unwrap(), normalized);
}
