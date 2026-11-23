//! Encrypted wallet file persistence, atomic replacement and path helpers.
//!
//! Preserves the v1 AES-256-GCM + Argon2id JSON format, `.json.tmp` atomic
//! replacement behavior and legacy plaintext migration reads.

use crate::state::WalletState;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Default CLI wallet path (`~/.ecash/wallet.json`).
pub fn default_wallet_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ecash")
        .join("wallet.json")
}

/// Temporary file path used for atomic write-and-rename replacement.
pub fn temp_wallet_path(path: &Path) -> PathBuf {
    path.with_extension("json.tmp")
}

/// Persistence boundary for wallet operations that save updated wallet state.
pub trait WalletStorage {
    fn save(&mut self, state: &WalletState) -> Result<()>;
}

/// Concrete encrypted-file storage delegating to `WalletState::save_encrypted`.
pub struct EncryptedFileStorage<'a> {
    path: &'a PathBuf,
    passphrase: &'a str,
}

impl<'a> EncryptedFileStorage<'a> {
    pub fn new(path: &'a PathBuf, passphrase: &'a str) -> Self {
        Self { path, passphrase }
    }
}

impl WalletStorage for EncryptedFileStorage<'_> {
    fn save(&mut self, state: &WalletState) -> Result<()> {
        state.save_encrypted(self.path, self.passphrase)
    }
}

/// Save wallet state as AES-256-GCM encrypted JSON (Argon2id key derivation).
/// Uses an atomic write-to-temp-and-rename so crashes mid-write never corrupt the wallet file.
pub fn save_encrypted_wallet(state: &WalletState, path: &Path, passphrase: &str) -> Result<()> {
    let mut plaintext = serde_json::to_vec(state)?;
    let encrypted = encrypt_wallet(&plaintext, passphrase);
    plaintext.fill(0);
    let encrypted = encrypted?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_string_pretty(&encrypted)?;
    let tmp_path = temp_wallet_path(path);
    std::fs::write(&tmp_path, &serialized)?;
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

/// Read and decrypt a v1 encrypted wallet file without applying post-load mutations.
pub fn load_encrypted_wallet(path: &Path, passphrase: &str) -> Result<WalletState> {
    let data =
        std::fs::read_to_string(path).context("Wallet not found — run `ecash init` first")?;
    // Support both encrypted and legacy plaintext wallets for migration
    if let Ok(enc) = serde_json::from_str::<EncryptedWallet>(&data) {
        if enc.version == 1 {
            let mut plaintext = decrypt_wallet(&enc, passphrase)?;
            let state = serde_json::from_slice::<WalletState>(&plaintext);
            plaintext.fill(0);
            return Ok(state?);
        }
    }
    // Fallback: legacy plaintext wallet
    Err(anyhow!(
        "Wallet appears to be unencrypted. Run `ecash migrate` to encrypt it."
    ))
}

/// Read a legacy plaintext wallet file without applying post-load mutations.
pub fn load_plaintext_wallet(path: &Path) -> Result<WalletState> {
    let data =
        std::fs::read_to_string(path).context("Wallet not found — run `ecash init` first")?;
    let state: WalletState = serde_json::from_str(&data)?;
    Ok(state)
}

// ─── Wallet Encryption ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedWallet {
    pub version: u8,
    /// Argon2id salt, hex-encoded (32 bytes).
    pub salt: String,
    /// AES-GCM nonce, hex-encoded (12 bytes).
    pub nonce: String,
    /// Ciphertext (AES-256-GCM encrypted JSON), hex-encoded.
    pub ciphertext: String,
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32]> {
    use argon2::{Algorithm, Argon2, Params, Version};
    let params =
        Params::new(65536, 3, 4, Some(32)).map_err(|e| anyhow!("Argon2 params error: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| anyhow!("Key derivation failed: {}", e))?;
    Ok(key)
}

pub fn encrypt_wallet(plaintext: &[u8], passphrase: &str) -> Result<EncryptedWallet> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit};
    use rand::RngCore;

    let mut salt = [0u8; 32];
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);

    let key_bytes = derive_key(passphrase, &salt)?;
    let key =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| anyhow!("Key init failed: {}", e))?;
    let nonce = aes_gcm::Nonce::from(nonce_bytes);

    let ciphertext = key
        .encrypt(&nonce, plaintext)
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    Ok(EncryptedWallet {
        version: 1,
        salt: hex::encode(salt),
        nonce: hex::encode(nonce_bytes),
        ciphertext: hex::encode(ciphertext),
    })
}

pub fn decrypt_wallet(enc: &EncryptedWallet, passphrase: &str) -> Result<Vec<u8>> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit};

    let salt = hex::decode(&enc.salt).context("Invalid salt")?;
    let nonce_bytes = hex::decode(&enc.nonce).context("Invalid nonce")?;
    let ciphertext = hex::decode(&enc.ciphertext).context("Invalid ciphertext")?;

    let key_bytes = derive_key(passphrase, &salt)?;
    let nonce_arr: [u8; 12] = nonce_bytes
        .try_into()
        .map_err(|_| anyhow!("Nonce must be 12 bytes"))?;
    let nonce = aes_gcm::Nonce::from(nonce_arr);
    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| anyhow!("Key init failed: {}", e))?;

    cipher
        .decrypt(&nonce, ciphertext.as_ref())
        .map_err(|_| anyhow!("Decryption failed — wrong passphrase?"))
}
