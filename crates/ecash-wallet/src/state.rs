use std::{collections::HashMap, path::PathBuf};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use ecash_core::types::{Proof, Transaction};


// ─── Wallet State ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WalletState {
    pub seed_hex: String,
    /// BIP39 mnemonic phrase (24 words). Stored so `info` can display it.
    pub mnemonic: Option<String>,
    pub derivation_index: u64,
    pub proofs: HashMap<String, Vec<Proof>>,
    #[serde(default)]
    pub mints: Vec<String>,
    /// Mint public keys cached from previous sessions, used for offline DLEQ verification.
    /// Keyed by mint URL → (denomination → compressed pubkey hex).
    #[serde(default)]
    pub trusted_keys: HashMap<String, HashMap<u64, String>>,
    #[serde(default)]
    pub transactions: Vec<Transaction>,
    #[serde(default)]
    pub custom_nostr_key: Option<String>,
}

impl WalletState {
    pub fn new(seed_hex: String, mnemonic: Option<String>) -> Self {
        Self { seed_hex, mnemonic, derivation_index: 0, proofs: HashMap::new(), mints: Vec::new(), trusted_keys: HashMap::new(), transactions: Vec::new(), custom_nostr_key: None }
    }

    pub fn default_path() -> PathBuf {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".ecash").join("wallet.json")
    }

    /// Save wallet state as AES-256-GCM encrypted JSON (Argon2id key derivation).
    pub fn save_encrypted(&mut self, path: &PathBuf, passphrase: &str) -> Result<()> {
        self.dedup_proofs();
        let plaintext = serde_json::to_vec(self)?;
        let encrypted = encrypt_wallet(&plaintext, passphrase)?;
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
        std::fs::write(path, serde_json::to_string_pretty(&encrypted)?)?;
        Ok(())
    }

    /// Load and decrypt wallet state.
    pub fn load_encrypted(path: &PathBuf, passphrase: &str) -> Result<Self> {
        let data = std::fs::read_to_string(path)
            .context("Wallet not found — run `ecash init` first")?;
        // Support both encrypted and legacy plaintext wallets for migration
        if let Ok(enc) = serde_json::from_str::<EncryptedWallet>(&data) {
            if enc.version == 1 {
                let plaintext = decrypt_wallet(&enc, passphrase)?;
                let mut state: WalletState = serde_json::from_slice(&plaintext)?;
                state.heal_corrupt_proofs();
                state.normalize_mints();
                return Ok(state);
            }
        }
        // Fallback: legacy plaintext wallet
        Err(anyhow!("Wallet appears to be unencrypted. Run `ecash migrate` to encrypt it."))
    }



    /// Load a legacy plaintext wallet (used only by `ecash migrate`).
    pub fn load_plaintext(path: &PathBuf) -> Result<Self> {
        let data = std::fs::read_to_string(path)
            .context("Wallet not found — run `ecash init` first")?;
        let mut state: WalletState = serde_json::from_str(&data)?;
        state.heal_corrupt_proofs();
        state.normalize_mints();
        Ok(state)
    }

    fn dedup_proofs(&mut self) {
        for proofs in self.proofs.values_mut() {
            let mut seen = std::collections::HashSet::new();
            proofs.retain(|p| seen.insert(p.secret.clone()));
        }
    }

    pub fn balance_by_mint(&self) -> HashMap<String, u64> {
        self.proofs.iter().map(|(m, ps)| (m.clone(), ps.iter().map(|p| p.amount).sum())).collect()
    }

    pub fn total_balance(&self) -> u64 {
        self.proofs.values().flat_map(|v| v.iter()).map(|p| p.amount).sum()
    }

    /// Cache public keys for a mint (persisted in wallet.json for offline verification).
    pub fn cache_mint_keys(&mut self, url: &str, keys: HashMap<u64, String>) {
        let clean_url = normalize_mint_url(url);
        self.trusted_keys.insert(clean_url.clone(), keys);
        // Also ensure the mint is in our known mints list
        if !self.mints.contains(&clean_url) {
            self.mints.push(clean_url);
        }
    }

    pub fn heal_corrupt_proofs(&mut self) {
        use ecash_core::dhke::{point_from_hex, verify_dleq, BlindingSession};
        use ecash_core::derivation::TokenDerivation;

        let mut deriv = match TokenDerivation::from_hex(&self.seed_hex) {
            Ok(d) => d,
            Err(_) => return,
        };
        
        // Pre-compute all sessions up to current derivation index + some buffer
        let mut all_sessions = Vec::new();
        let max_index = self.derivation_index + 100;
        for _ in 0..max_index {
            let idx = deriv.index;
            let secret = deriv.next_secret();
            all_sessions.push((idx, BlindingSession::new(&secret)));
        }

        let mut healed_count = 0;

        for (mint, proofs) in self.proofs.iter_mut() {
            let keys_map = match self.trusted_keys.get(mint) {
                Some(k) => k,
                None => continue,
            };

            for p in proofs.iter_mut() {
                // First, check if it's already perfectly valid.
                let is_valid = if let (Some(c_p_str), Some(b_p_str), Some(dleq), Some(mint_pk_str)) = (&p.c_prime, &p.b_prime, &p.dleq, keys_map.get(&p.amount)) {
                    if let (Ok(c_p), Ok(b_p), Ok(mint_pk)) = (point_from_hex(c_p_str), point_from_hex(b_p_str), point_from_hex(mint_pk_str)) {
                        verify_dleq(&mint_pk, &c_p, &b_p, dleq)
                    } else { false }
                } else { true }; // If missing data, we can't heal, assume valid or leave it.

                if !is_valid {
                    // It's corrupt! Let's find the correct session.
                    if let (Some(c_p_str), Some(dleq), Some(mint_pk_str)) = (&p.c_prime, &p.dleq, keys_map.get(&p.amount)) {
                        if let (Ok(c_p), Ok(mint_pk)) = (point_from_hex(c_p_str), point_from_hex(mint_pk_str)) {
                            for (idx, sess) in &all_sessions {
                                if verify_dleq(&mint_pk, &c_p, &sess.b_prime, dleq) {
                                    tracing::info!("Auto-healed proof for amount {}! Restored from secret idx {}", p.amount, idx);
                                    let mut new_proof = sess.unblind(&c_p, &mint_pk, p.amount, &p.id, Some(dleq.clone()));
                                    new_proof.derivation_index = *idx;
                                    *p = new_proof;
                                    healed_count += 1;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if healed_count > 0 {
            tracing::info!("Successfully auto-healed {} corrupted proofs.", healed_count);
        }
    }

    pub fn remove_mint(&mut self, mint_url: &str) -> Result<()> {
        let mint_url = normalize_mint_url(mint_url);
        let balances = self.balance_by_mint();
        if balances.get(&mint_url).copied().unwrap_or(0) > 0 {
            return Err(anyhow::anyhow!("Cannot remove a mint with a non-zero balance"));
        }
        
        self.mints.retain(|m| m != &mint_url);
        self.trusted_keys.remove(&mint_url);
        self.proofs.remove(&mint_url);
        Ok(())
    }

    pub fn normalize_mints(&mut self) {
        // Safe lowercase mints list
        let mut new_mints = Vec::new();
        for m in &self.mints {
            let m_lower = normalize_mint_url(m);
            if !new_mints.contains(&m_lower) {
                new_mints.push(m_lower);
            }
        }
        self.mints = new_mints;

        // Lowercase trusted_keys
        let mut new_keys = HashMap::new();
        for (k, v) in self.trusted_keys.drain() {
            new_keys.insert(normalize_mint_url(&k), v);
        }
        self.trusted_keys = new_keys;

        // Lowercase proofs keys
        let mut new_proofs = HashMap::new();
        for (k, v) in self.proofs.drain() {
            let key_lower = normalize_mint_url(&k);
            new_proofs.entry(key_lower).or_insert_with(Vec::new).extend(v);
        }
        self.proofs = new_proofs;
        
        // Lowercase transactions
        for tx in &mut self.transactions {
            tx.mint_url = normalize_mint_url(&tx.mint_url);
            match &mut tx.tx_type {
                ecash_core::types::TransactionType::Issue(data) => {
                    data.hub_mint = normalize_mint_url(&data.hub_mint);
                    for a in &mut data.allocations {
                        a.0 = normalize_mint_url(&a.0);
                    }
                    for c in &mut data.child_quotes {
                        c.0 = normalize_mint_url(&c.0);
                    }
                    if let Some(note) = &mut data.note {
                        note.mint_urls = note.mint_urls.iter().map(|m| normalize_mint_url(m)).collect();
                        for e in &mut note.public_data.entries {
                            e.mint = normalize_mint_url(&e.mint);
                        }
                    }
                }
                ecash_core::types::TransactionType::Redeem(data) => {
                    for e in &mut data.public_data.entries {
                        e.mint = normalize_mint_url(&e.mint);
                    }
                }
                _ => {}
            }
        }
    }
}

pub fn normalize_mint_url(url_str: &str) -> String {
    let clean = url_str.trim_end_matches('/');
    
    // Automatically prepend https:// if no scheme is provided
    let with_scheme = if !clean.starts_with("http://") && !clean.starts_with("https://") {
        format!("https://{}", clean)
    } else {
        clean.to_string()
    };
    
    if let Ok(parsed) = reqwest::Url::parse(&with_scheme) {
        parsed.to_string().trim_end_matches('/').to_string()
    } else {
        // Fallback: don't use to_lowercase as it destroys path casing like /Bitcoin
        with_scheme
    }
}

// ─── BIP39 Mnemonic ───────────────────────────────────────────────────────────

/// Generate a fresh 24-word BIP39 mnemonic. Returns `(mnemonic_phrase, seed_hex)`.
/// The seed_hex is the raw 32-byte entropy, which feeds directly into `TokenDerivation`.
pub fn generate_mnemonic() -> Result<(String, String)> {
    use bip39::Mnemonic;
    use rand::RngCore;
    // 32 bytes = 256 bits = 24 words
    let mut entropy = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy(&entropy)
        .map_err(|e| anyhow!("Failed to generate mnemonic: {}", e))?;
    let phrase = mnemonic.to_string();
    let seed_hex = hex::encode(&entropy);
    Ok((phrase, seed_hex))
}

/// Recover a wallet seed from a BIP39 mnemonic phrase.
pub fn mnemonic_to_seed_hex(phrase: &str) -> Result<String> {
    use bip39::Mnemonic;
    let mnemonic = Mnemonic::parse(phrase)
        .map_err(|e| anyhow!("Invalid mnemonic: {}", e))?;
    let entropy = mnemonic.to_entropy();
    if entropy.len() != 32 {
        return Err(anyhow!("Mnemonic must be 24 words (256-bit entropy)"));
    }
    Ok(hex::encode(&entropy))
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
    use argon2::{Argon2, Algorithm, Version, Params};
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| anyhow!("Argon2 params error: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| anyhow!("Key derivation failed: {}", e))?;
    Ok(key)
}

fn encrypt_wallet(plaintext: &[u8], passphrase: &str) -> Result<EncryptedWallet> {
    use aes_gcm::{Aes256Gcm, KeyInit};
    use aes_gcm::aead::Aead;
    use rand::RngCore;

    let mut salt = [0u8; 32];
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);

    let key_bytes = derive_key(passphrase, &salt)?;
    let key = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| anyhow!("Key init failed: {}", e))?;
    let nonce = aes_gcm::Nonce::from(nonce_bytes);

    let ciphertext = key.encrypt(&nonce, plaintext)
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    Ok(EncryptedWallet {
        version: 1,
        salt: hex::encode(salt),
        nonce: hex::encode(nonce_bytes),
        ciphertext: hex::encode(ciphertext),
    })
}

fn decrypt_wallet(enc: &EncryptedWallet, passphrase: &str) -> Result<Vec<u8>> {
    use aes_gcm::{Aes256Gcm, KeyInit};
    use aes_gcm::aead::Aead;

    let salt = hex::decode(&enc.salt).context("Invalid salt")?;
    let nonce_bytes = hex::decode(&enc.nonce).context("Invalid nonce")?;
    let ciphertext = hex::decode(&enc.ciphertext).context("Invalid ciphertext")?;

    let key_bytes = derive_key(passphrase, &salt)?;
    let nonce_arr: [u8; 12] = nonce_bytes.try_into().map_err(|_| anyhow!("Nonce must be 12 bytes"))?;
    let nonce = aes_gcm::Nonce::from(nonce_arr);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| anyhow!("Key init failed: {}", e))?;

    cipher.decrypt(&nonce, ciphertext.as_ref())
        .map_err(|_| anyhow!("Decryption failed — wrong passphrase?"))
}

