use ecash_core::types::Proof;
use ecash_wallet::{
    storage::{
        decrypt_wallet, default_wallet_path, encrypt_wallet, load_encrypted_wallet,
        load_plaintext_wallet, save_encrypted_wallet, temp_wallet_path, EncryptedWallet,
    },
    WalletState,
};
use std::path::PathBuf;

const PASSWORD: &str = "synthetic-storage-passphrase";
const SEED_HEX: &str = "0000000000000000000000000000000000000000000000000000000000000001";
const MINT: &str = "https://mint.invalid";

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

fn synthetic_wallet(amount: u64) -> WalletState {
    let mut wallet = WalletState::new(SEED_HEX.into(), Some("synthetic mnemonic fixture".into()));
    wallet.mints.push(MINT.into());
    wallet.proofs.insert(
        MINT.into(),
        vec![Proof {
            amount,
            id: "0000000000000000".into(),
            secret: format!("synthetic-secret-{amount}"),
            c: format!("02{}", "11".repeat(32)),
            c_prime: None,
            b_prime: None,
            witness: None,
            dleq: None,
            derivation_index: 0,
        }],
    );
    wallet
}

#[test]
fn encrypted_wallet_format_and_roundtrip_stay_compatible() {
    let dir = TempDir::new("bitnotes-storage-format");
    let wallet_path = dir.path.join("nested").join("dir").join("wallet.json");
    let wallet = synthetic_wallet(64);

    wallet.save_encrypted(&wallet_path, PASSWORD).unwrap();
    assert!(wallet_path.exists());
    assert!(!temp_wallet_path(&wallet_path).exists());

    // Raw file on disk must be v1 EncryptedWallet JSON without leaking secrets.
    let raw = std::fs::read_to_string(&wallet_path).unwrap();
    assert!(!raw.contains(SEED_HEX));
    assert!(!raw.contains("synthetic-secret-64"));
    assert!(!raw.contains("synthetic mnemonic fixture"));

    let envelope: EncryptedWallet = serde_json::from_str(&raw).unwrap();
    assert_eq!(envelope.version, 1);
    assert_eq!(hex::decode(&envelope.salt).unwrap().len(), 32);
    assert_eq!(hex::decode(&envelope.nonce).unwrap().len(), 12);
    assert!(!hex::decode(&envelope.ciphertext).unwrap().is_empty());

    // Decrypting directly and loading via both storage and WalletState must agree.
    let plaintext = decrypt_wallet(&envelope, PASSWORD).unwrap();
    let direct: WalletState = serde_json::from_slice(&plaintext).unwrap();
    let via_storage = load_encrypted_wallet(&wallet_path, PASSWORD).unwrap();
    let via_state = WalletState::load_encrypted(&wallet_path, PASSWORD).unwrap();

    assert_eq!(direct.seed_hex, SEED_HEX);
    assert_eq!(via_storage.total_balance(), 64);
    assert_eq!(via_state.total_balance(), 64);
    assert_eq!(
        via_state.mnemonic.as_deref(),
        Some("synthetic mnemonic fixture")
    );
}

#[test]
fn independently_encrypted_v1_fixture_and_error_messages_remain_compatible() {
    let dir = TempDir::new("bitnotes-storage-errors");
    let missing_path = dir.path.join("missing.json");
    let missing_err = WalletState::load_encrypted(&missing_path, PASSWORD).unwrap_err();
    assert!(missing_err
        .to_string()
        .contains("Wallet not found — run `ecash init` first"));

    // Write a v1 EncryptedWallet produced via encrypt_wallet directly.
    let wallet = synthetic_wallet(32);
    let plaintext = serde_json::to_vec(&wallet).unwrap();
    let encrypted = encrypt_wallet(&plaintext, PASSWORD).unwrap();
    let wallet_path = dir.path.join("wallet.json");
    std::fs::write(
        &wallet_path,
        serde_json::to_string_pretty(&encrypted).unwrap(),
    )
    .unwrap();

    let loaded = WalletState::load_encrypted(&wallet_path, PASSWORD).unwrap();
    assert_eq!(loaded.total_balance(), 32);

    // Wrong passphrase keeps the existing error text.
    let wrong_pass = WalletState::load_encrypted(&wallet_path, "wrong-passphrase").unwrap_err();
    assert_eq!(
        wrong_pass.to_string(),
        "Decryption failed — wrong passphrase?"
    );

    // Unsupported version falls through to the existing unencrypted/migration message.
    let mut v2 = encrypted;
    v2.version = 2;
    std::fs::write(&wallet_path, serde_json::to_string_pretty(&v2).unwrap()).unwrap();
    let v2_err = WalletState::load_encrypted(&wallet_path, PASSWORD).unwrap_err();
    assert_eq!(
        v2_err.to_string(),
        "Wallet appears to be unencrypted. Run `ecash migrate` to encrypt it."
    );

    // Plaintext legacy wallet is rejected by load_encrypted and accepted by load_plaintext.
    let plaintext_path = dir.path.join("legacy-plaintext.json");
    std::fs::write(&plaintext_path, serde_json::to_string(&wallet).unwrap()).unwrap();
    let plain_err = WalletState::load_encrypted(&plaintext_path, PASSWORD).unwrap_err();
    assert_eq!(
        plain_err.to_string(),
        "Wallet appears to be unencrypted. Run `ecash migrate` to encrypt it."
    );
    let plain_via_storage = load_plaintext_wallet(&plaintext_path).unwrap();
    let plain_via_state = WalletState::load_plaintext(&plaintext_path).unwrap();
    assert_eq!(plain_via_storage.total_balance(), 32);
    assert_eq!(plain_via_state.total_balance(), 32);
}

#[test]
fn atomic_replacement_preserves_temp_path_and_protects_existing_file_on_write_failure() {
    let dir = TempDir::new("bitnotes-storage-atomic");
    let wallet_path = dir.path.join("wallet.json");
    let tmp_path = temp_wallet_path(&wallet_path);
    assert_eq!(tmp_path, wallet_path.with_extension("json.tmp"));

    // Initial save succeeds and leaves no temp file.
    let initial = synthetic_wallet(16);
    save_encrypted_wallet(&initial, &wallet_path, PASSWORD).unwrap();
    assert!(wallet_path.exists());
    assert!(!tmp_path.exists());

    // Blocking temp-file creation leaves the previously saved wallet untouched on disk.
    std::fs::create_dir(&tmp_path).unwrap();
    let updated = synthetic_wallet(128);
    assert!(save_encrypted_wallet(&updated, &wallet_path, PASSWORD).is_err());
    std::fs::remove_dir(&tmp_path).unwrap();

    let still_initial = WalletState::load_encrypted(&wallet_path, PASSWORD).unwrap();
    assert_eq!(still_initial.total_balance(), 16);

    // Normal overwrite atomically replaces the wallet with the updated state.
    save_encrypted_wallet(&updated, &wallet_path, PASSWORD).unwrap();
    assert!(!tmp_path.exists());
    let replaced = WalletState::load_encrypted(&wallet_path, PASSWORD).unwrap();
    assert_eq!(replaced.total_balance(), 128);

    // Blocking the final rename fails with an OS error while leaving the temp file at json.tmp.
    let rename_dir_path = dir.path.join("blocked.json");
    std::fs::create_dir(&rename_dir_path).unwrap();
    assert!(save_encrypted_wallet(&updated, &rename_dir_path, PASSWORD).is_err());
    assert!(temp_wallet_path(&rename_dir_path).exists());
}

#[test]
fn default_wallet_path_matches_wallet_state_default_path() {
    let path = default_wallet_path();
    assert_eq!(path, WalletState::default_path());
    assert_eq!(
        path.file_name().and_then(|n| n.to_str()),
        Some("wallet.json")
    );
    assert_eq!(
        path.parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str()),
        Some(".ecash")
    );
}
