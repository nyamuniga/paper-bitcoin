//! Multi-mint Cashu wallet.
//!
//! Manages the wallet seed, derivation index, and stored proofs.
//! Talks to Cashu-compatible mint HTTP APIs to issue and redeem tokens.
//!
//! # Security
//! Wallet state is persisted as AES-256-GCM encrypted JSON.
//! The encryption key is derived from a user passphrase via Argon2id.
//! The seed itself is the entropy of a BIP39 24-word mnemonic phrase.

use std::{collections::HashMap, path::PathBuf};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use ecash_core::{
    derivation::TokenDerivation,
    dhke::{compute_validation_hash, point_from_hex, BlindingSession},
    types::{Amount, CashuToken, PhysicalNote, PrivateNoteData, Proof, PublicNoteData, TokenEntry},
};

pub const DEFAULT_MINT_URL: &str = "https://mint.minibits.cash/Bitcoin";

// ─── Wallet State ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WalletState {
    pub seed_hex: String,
    /// BIP39 mnemonic phrase (24 words). Stored so `info` can display it.
    pub mnemonic: Option<String>,
    pub derivation_index: u64,
    pub proofs: HashMap<String, Vec<Proof>>,
    pub mints: Vec<String>,
    /// Mint public keys cached from previous sessions, used for offline DLEQ verification.
    /// Keyed by mint URL → (denomination → compressed pubkey hex).
    #[serde(default)]
    pub trusted_keys: HashMap<String, HashMap<u64, String>>,
}

impl WalletState {
    pub fn new(seed_hex: String, mnemonic: Option<String>) -> Self {
        Self { seed_hex, mnemonic, derivation_index: 0, proofs: HashMap::new(), mints: Vec::new(), trusted_keys: HashMap::new() }
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
                return Ok(serde_json::from_slice(&plaintext)?);
            }
        }
        // Fallback: legacy plaintext wallet
        Err(anyhow!("Wallet appears to be unencrypted. Run `ecash migrate` to encrypt it."))
    }

    /// Load a legacy plaintext wallet (used only by `ecash migrate`).
    pub fn load_plaintext(path: &PathBuf) -> Result<Self> {
        let data = std::fs::read_to_string(path)
            .context("Wallet not found — run `ecash init` first")?;
        Ok(serde_json::from_str(&data)?)
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
        self.trusted_keys.insert(url.to_string(), keys);
        // Also ensure the mint is in our known mints list
        if !self.mints.contains(&url.to_string()) {
            self.mints.push(url.to_string());
        }
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

// ─── Invoice Validation ───────────────────────────────────────────────────────

/// Parse a BOLT11 invoice and return its amount in satoshis.
/// Returns `None` if the invoice carries no amount (any-amount invoice).
/// Returns `Err` if the invoice string is not valid BOLT11 format.
pub fn parse_bolt11_sats(invoice: &str) -> Result<Option<u64>> {
    let lower = invoice.to_lowercase().trim().to_string();
    if !lower.starts_with("ln") {
        return Err(anyhow!("Not a valid Lightning invoice (must start with 'ln')"));
    }

    // In bech32 the separator '1' is the LAST '1' in the string.
    // Everything before it is the HRP: e.g. "lnbc1000u"
    let sep = lower.rfind('1').ok_or_else(|| anyhow!("Invalid BOLT11: no bech32 separator"))?;
    let hrp = &lower[..sep];

    // Strip network prefix to isolate the amount field
    let amount_part = if hrp.starts_with("lnbcrt") {
        &hrp["lnbcrt".len()..]
    } else if hrp.starts_with("lntbs") || hrp.starts_with("lntb") {
        &hrp["lntb".len()..]
    } else if hrp.starts_with("lnbc") {
        &hrp["lnbc".len()..]
    } else {
        return Err(anyhow!("Unknown Lightning network prefix in invoice"));
    };

    if amount_part.is_empty() {
        return Ok(None); // any-amount invoice
    }

    let last = amount_part.chars().last().unwrap();
    let (num_str, multiplier) = if last.is_alphabetic() {
        (&amount_part[..amount_part.len() - 1], Some(last))
    } else {
        (amount_part, None)
    };

    if num_str.is_empty() {
        return Err(anyhow!("Invalid amount in invoice"));
    }

    let amount: u64 = num_str.parse().map_err(|_| anyhow!("Invalid amount digits in invoice"))?;

    // Convert to millisatoshis, then to sats
    let msats: u64 = match multiplier {
        Some('m') => amount * 100_000_000,       // 1 mBTC = 100,000 sats = 100,000,000 msats
        Some('u') => amount * 100_000,            // 1 µBTC = 100 sats = 100,000 msats
        Some('n') => amount * 100,                // 1 nBTC = 0.1 sats = 100 msats
        Some('p') => amount / 10,                 // 10 pBTC = 1 msat (floored)
        None => amount.checked_mul(100_000_000_000)
            .ok_or_else(|| anyhow!("Invoice amount overflow"))?,  // whole BTC
        Some(c) => return Err(anyhow!("Unknown multiplier '{}' in invoice", c)),
    };

    Ok(Some(msats / 1000))
}

/// Validate a BOLT11 invoice. If `expected_sats` is provided, the invoice amount must match exactly.
/// Returns the invoice amount in sats (or 0 for any-amount invoices).
pub fn validate_invoice(invoice: &str, expected_sats: Option<u64>) -> Result<u64> {
    let inv = invoice.trim();
    if inv.is_empty() {
        return Err(anyhow!("Invoice is empty"));
    }
    if inv.len() < 20 {
        return Err(anyhow!("Invoice string is too short to be valid"));
    }

    let amount = parse_bolt11_sats(inv)?;

    if let Some(expected) = expected_sats {
        match amount {
            None => {
                // Any-amount invoice — accepted, the mint will enforce the amount
                return Ok(expected);
            }
            Some(got) if got != expected => {
                return Err(anyhow!(
                    "Invoice amount mismatch: invoice is for {} sats but note face value is {} sats.\n\
                     Please create a new invoice for exactly {} sats.",
                    got, expected, expected
                ));
            }
            Some(got) => return Ok(got),
        }
    }

    Ok(amount.unwrap_or(0))
}

// ─── Mint Client (internal) ───────────────────────────────────────────────────

struct MintClient {
    http: reqwest::Client,
    url: String,
}

impl MintClient {
    fn new(mint_url: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            url: mint_url.trim_end_matches('/').to_string(),
        }
    }

    async fn fetch_keyset(&self) -> Result<KeysetInfo> {
        let v: serde_json::Value = self.http.get(format!("{}/v1/keys", self.url)).send().await?.json().await?;
        let ks = &v["keysets"][0];
        let id = ks["id"].as_str().unwrap().to_string();
        let mut keys = HashMap::new();
        for (amt_str, pk) in ks["keys"].as_object().unwrap() {
            keys.insert(amt_str.parse()?, pk.as_str().unwrap().to_string());
        }
        Ok(KeysetInfo { id, keys })
    }

    pub async fn fetch_keyset_by_id(&self, keyset_id: &str) -> Result<KeysetInfo> {
        let v: serde_json::Value = match self.http.get(format!("{}/v1/keys/{}", self.url, keyset_id)).send().await {
            Ok(resp) if resp.status().is_success() => resp.json().await?,
            _ => self.http.get(format!("{}/v1/keys", self.url)).send().await?.json().await?,
        };

        let ks_array = v["keysets"].as_array().ok_or_else(|| anyhow!("Invalid keys response"))?;
        let ks = ks_array.iter().find(|k| k["id"].as_str() == Some(keyset_id))
            .ok_or_else(|| anyhow!("Keyset {} not found in mint", keyset_id))?;

        let id = ks["id"].as_str().unwrap().to_string();
        let mut keys = HashMap::new();
        for (amt_str, pk) in ks["keys"].as_object().unwrap() {
            keys.insert(amt_str.parse()?, pk.as_str().unwrap().to_string());
        }
        Ok(KeysetInfo { id, keys })
    }

    pub async fn request_mint_quote(&self, amount_sats: u64) -> Result<(String, String)> {
        let v: serde_json::Value = self.http.post(format!("{}/v1/mint/quote/bolt11", self.url))
            .json(&serde_json::json!({ "amount": amount_sats, "unit": "sat" })).send().await?.json().await?;
        if let Some(err) = v.get("error") { return Err(anyhow!("Mint error: {}", err)); }
        Ok((v["quote"].as_str().unwrap().to_string(), v["request"].as_str().unwrap_or("").to_string()))
    }

    pub async fn wait_for_quote_paid(&self, quote_id: &str) -> Result<()> {
        for _ in 0..120 {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            let check: serde_json::Value = self.http.get(format!("{}/v1/mint/quote/bolt11/{}", self.url, quote_id)).send().await?.json().await?;
            if check["state"].as_str() == Some("PAID") { return Ok(()); }
        }
        Err(anyhow!("Invoice payment timeout"))
    }

    async fn mint_tokens(&self, quote_id: &str, outputs: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let v: serde_json::Value = self.http.post(format!("{}/v1/mint/bolt11", self.url))
            .json(&serde_json::json!({ "quote": quote_id, "outputs": outputs })).send().await?.json().await?;
        if let Some(err) = v.get("error") { return Err(anyhow!("Mint error: {}", err)); }
        Ok(v["signatures"].as_array().unwrap().clone())
    }

    pub async fn melt_tokens(&self, proofs: &[Proof], invoice: &str, quote_id: Option<&str>, outputs: Option<Vec<serde_json::Value>>) -> Result<(bool, Vec<serde_json::Value>)> {
        let qid = if let Some(q) = quote_id {
            q.to_string()
        } else {
            let qv: serde_json::Value = self.http.post(format!("{}/v1/melt/quote/bolt11", self.url))
                .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
            if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
            if let Some(err) = qv.get("detail") { return Err(anyhow!("Melt quote error (detail): {}", err)); }
            qv["quote"].as_str().ok_or_else(|| anyhow!("No quote returned"))?.to_string()
        };

        let mut clean_proofs = proofs.to_vec();
        for p in &mut clean_proofs {
            p.b_prime = None;
            p.dleq = None;
        }
        let mut req = serde_json::json!({ "quote": qid, "inputs": clean_proofs });
        if let Some(outs) = outputs {
            req["outputs"] = serde_json::Value::Array(outs);
        }

        let mv: serde_json::Value = self.http.post(format!("{}/v1/melt/bolt11", self.url))
            .json(&req).send().await?.json().await?;
        if let Some(err) = mv.get("error") { return Err(anyhow!("Melt error: {}", err)); }
        if let Some(err) = mv.get("detail") { return Err(anyhow!("Melt error (detail): {}", err)); }

        let paid = mv["paid"].as_bool().unwrap_or(false);

        let change = mv.get("change")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        Ok((paid, change))
    }
}

pub async fn estimate_melt_fee(mint_url: &str, invoice: &str) -> Result<(u64, String)> {
    let client = MintClient::new(mint_url);
    let qv: serde_json::Value = client.http.post(format!("{}/v1/melt/quote/bolt11", client.url))
        .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
    if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
    let fee = qv["fee_reserve"].as_u64().unwrap_or(0);
    let quote = qv["quote"].as_str().unwrap_or("").to_string();
    Ok((fee, quote))
}

struct KeysetInfo { id: String, keys: HashMap<u64, String> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn parse_dleq(sig: &serde_json::Value) -> Option<ecash_core::types::Dleq> {
    if let Some(d) = sig.get("dleq") {
        if let (Some(e), Some(s)) = (d.get("e").and_then(|v| v.as_str()), d.get("s").and_then(|v| v.as_str())) {
            return Some(ecash_core::types::Dleq { e: e.to_string(), s: s.to_string() });
        }
    }
    None
}

fn serial_from_hash(hash: &str) -> String {
    let chars: Vec<char> = hash.to_uppercase().chars().take(12).collect();
    format!("{}-{}-{}", chars[..4].iter().collect::<String>(), chars[4..8].iter().collect::<String>(), chars[8..12].iter().collect::<String>())
}

// ─── Public API ───────────────────────────────────────────────────────────────

pub async fn issue_multimint_note<F, Fut>(
    state: &mut WalletState,
    wallet_path: &PathBuf,
    passphrase: &str,
    allocations: &[(&str, u64)],
    on_invoice: F,
) -> Result<PhysicalNote>
where
    F: FnOnce(String, String, u64) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let hub_mint = allocations[0].0;
    let mut actual_allocations = Vec::new();
    let mut total_face_value = 0;

    for &(mint, face_val) in allocations {
        if face_val == 0 { continue; }
        total_face_value += face_val;
        let reserve = std::cmp::max(10, face_val * 3 / 100); // 3% reserve
        actual_allocations.push((mint, face_val + reserve));
    }

    let mut other_quotes = Vec::new();
    let mut total_hub_needed = actual_allocations[0].1;

    for (mint, amt) in &actual_allocations[1..] {
        let client = MintClient::new(mint);
        let (qid, inv) = client.request_mint_quote(*amt).await?;
        let (fee, _) = estimate_melt_fee(hub_mint, &inv).await?;
        other_quotes.push((mint.to_string(), *amt, qid, inv, fee));
        total_hub_needed += amt + fee;
    }

    let hub_client = MintClient::new(hub_mint);
    let (hub_qid, hub_inv) = hub_client.request_mint_quote(total_hub_needed).await?;

    on_invoice(hub_mint.to_string(), hub_inv, total_hub_needed).await;
    hub_client.wait_for_quote_paid(&hub_qid).await?;

    let hub_keyset = hub_client.fetch_keyset().await?;

    state.trusted_keys.insert(hub_mint.to_string(), hub_keyset.keys.clone());

    // Generate a unique seed for this physical note
    let (mut note_deriv, note_seed_hex) = TokenDerivation::generate();

    let mut hub_denoms = Amount::from_sat(actual_allocations[0].1).split_into_powers_of_2();
    for (_, amt, _, _, fee) in &other_quotes {
        hub_denoms.extend(Amount::from_sat(amt + fee).split_into_powers_of_2());
    }

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &hub_denoms {
        let index = note_deriv.index;
        let secret = note_deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push((sess, index));
    }

    let sigs = hub_client.mint_tokens(&hub_qid, outputs).await?;
    let mut hub_all_proofs = Vec::new();
    for ((sess, index), sig) in sessions.iter().zip(sigs.iter()) {
        let amount = sig["amount"].as_u64().unwrap();
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id);
        let c_prime = point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
        let mint_pk = point_from_hex(hub_keyset.keys.get(&amount).unwrap()).unwrap();
        let dleq = parse_dleq(sig);
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
        proof.derivation_index = *index;
        hub_all_proofs.push(proof);
    }

    // ── 1. Save Hub tokens to wallet immediately to prevent loss ──
    state.proofs.entry(hub_mint.to_string()).or_default().extend(hub_all_proofs.clone());
    if !state.mints.contains(&hub_mint.to_string()) { state.mints.push(hub_mint.to_string()); }
    state.save_encrypted(wallet_path, passphrase)?;

    let mut entries = Vec::new();
    let mut proofs_idx = 0;

    let hub_main_len = Amount::from_sat(actual_allocations[0].1).split_into_powers_of_2().len();
    let hub_main_proofs = hub_all_proofs[0..hub_main_len].to_vec();
    entries.push(TokenEntry { mint: hub_mint.to_string(), proofs: hub_main_proofs });
    proofs_idx += hub_main_len;

    for (mint, amt, qid, inv, fee) in &other_quotes {
        let subset_len = Amount::from_sat(amt + fee).split_into_powers_of_2().len();
        let melt_proofs = hub_all_proofs[proofs_idx..proofs_idx + subset_len].to_vec();
        proofs_idx += subset_len;

        hub_client.melt_tokens(&melt_proofs, inv, None, None).await?;

        // ── 2. Remove melted tokens from state immediately ──
        if let Some(hub_proofs) = state.proofs.get_mut(hub_mint) {
            hub_proofs.retain(|p| !melt_proofs.iter().any(|mp| mp.id == p.id && mp.secret == p.secret));
        }
        state.save_encrypted(wallet_path, passphrase)?;

        let client = MintClient::new(mint);
        let keyset = client.fetch_keyset().await?;
        // Cache child mint keys in trusted_keys

        state.trusted_keys.insert(mint.to_string(), keyset.keys.clone());
        let denoms = Amount::from_sat(*amt).split_into_powers_of_2();

        let mut b_sess = Vec::new();
        let mut b_out = Vec::new();
        for &d in &denoms {
            let index = note_deriv.index;
            let secret = note_deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            b_out.push(serde_json::json!({"amount": d, "id": keyset.id, "B_": sess.b_prime_hex()}));
            b_sess.push((sess, index));
        }

        let b_sigs = client.mint_tokens(qid, b_out).await?;
        let mut b_proofs = Vec::new();
        for ((sess, index), sig) in b_sess.iter().zip(b_sigs.iter()) {
            let amount = sig["amount"].as_u64().unwrap();
            let sig_id = sig["id"].as_str().unwrap_or(&keyset.id);
            let c_prime = point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
            let mint_pk = point_from_hex(keyset.keys.get(&amount).unwrap()).unwrap();
            let dleq = parse_dleq(sig);
            let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
            proof.derivation_index = *index;
            b_proofs.push(proof);
        }

        // ── 3. Save newly minted tokens to state immediately ──
        state.proofs.entry(mint.to_string()).or_default().extend(b_proofs.clone());
        if !state.mints.contains(&mint.to_string()) { state.mints.push(mint.to_string()); }
        state.save_encrypted(wallet_path, passphrase)?;

        entries.push(TokenEntry { mint: mint.to_string(), proofs: b_proofs });
    }

    // ── 4. Remove all tokens from wallet since they move to the physical note ──
    for entry in &entries {
        if let Some(state_proofs) = state.proofs.get_mut(&entry.mint) {
            state_proofs.retain(|p| !entry.proofs.iter().any(|ep| ep.id == p.id && ep.secret == p.secret));
        }
    }
    state.save_encrypted(wallet_path, passphrase)?;

    let public_entries: Vec<_> = entries.iter().map(|e| e.to_public()).collect();
    let validation_hash = compute_validation_hash(&public_entries);
    let serial = serial_from_hash(&validation_hash);

    Ok(PhysicalNote {
        amount_sats: total_face_value,
        mint_urls: actual_allocations.iter().map(|a| a.0.to_string()).collect(),
        serial,
        validation_hash: validation_hash.clone(),
        issued_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
        public_data: PublicNoteData {
            entries: public_entries,
            validation_hash: validation_hash.clone(),
            face_value_sats: total_face_value,
        },
        private_data: PrivateNoteData { master_seed_hex: note_seed_hex },
    })
}

pub async fn reconstruct_token(public_data: &ecash_core::types::PublicNoteData, master_seed_hex: &str) -> Result<CashuToken> {
    let mut entries = Vec::new();
    let note_deriv = TokenDerivation::from_hex(master_seed_hex)?;

    for public_entry in &public_data.entries {
        let client = MintClient::new(&public_entry.mint);
        let mut keyset_cache = HashMap::new();

        let mut proofs = Vec::new();
        for p in &public_entry.proofs {
            if !keyset_cache.contains_key(&p.id) {
                let ks = client.fetch_keyset_by_id(&p.id).await?;
                keyset_cache.insert(p.id.clone(), ks);
            }
            let keyset = keyset_cache.get(&p.id).unwrap();

            let secret = note_deriv.secret_at(p.derivation_index);
            let sess = BlindingSession::new(&secret);

            let c_prime = point_from_hex(p.c_prime.as_ref().unwrap()).context("Invalid C_")?;
            let mint_pk = point_from_hex(keyset.keys.get(&p.amount).context("Unknown amount")?).context("Invalid mint pk")?;

            let mut reconstructed_proof = sess.unblind(&c_prime, &mint_pk, p.amount, &p.id, p.dleq.clone());
            reconstructed_proof.derivation_index = p.derivation_index;
            proofs.push(reconstructed_proof);
        }
        entries.push(TokenEntry { mint: public_entry.mint.clone(), proofs });
    }

    let reconstructed_entries: Vec<_> = entries.iter().map(|e| e.to_public()).collect();
    let reconstructed_hash = compute_validation_hash(&reconstructed_entries);
    if reconstructed_hash != public_data.validation_hash {
        return Err(anyhow!("Incorrect scratch-off secret! The reconstructed note does not match the physical note."));
    }

    Ok(CashuToken { token: entries, unit: "sat".into(), memo: None })
}

pub async fn redeem_note(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, public_data: &ecash_core::types::PublicNoteData, master_seed_hex: &str, external_invoice: &str) -> Result<u64> {
    let token = reconstruct_token(public_data, master_seed_hex).await?;
    if token.token.is_empty() { return Err(anyhow!("Empty token")); }

    let hub_mint = &token.token[0].mint;
    let hub_client = MintClient::new(hub_mint);
    let hub_keyset = hub_client.fetch_keyset().await?;

    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let mut hub_proofs = token.token[0].proofs.clone();

    if let Some(existing_proofs) = state.proofs.get_mut(&hub_mint.to_string()) {
        hub_proofs.extend(existing_proofs.drain(..));
    }

    for entry in &token.token[1..] {
        if entry.proofs.is_empty() { continue; }
        let amt: u64 = entry.proofs.iter().map(|p| p.amount).sum();

        let (_, dummy_inv) = hub_client.request_mint_quote(amt).await?;
        let (fee_estimate, _) = estimate_melt_fee(&entry.mint, &dummy_inv).await.unwrap_or((10, "".into()));

        // Add a buffer to the fee estimate to prevent "inputs != outputs + fee" errors.
        let safe_fee = std::cmp::max(10, fee_estimate * 2);
        let transfer_amt = amt.saturating_sub(safe_fee);
        if transfer_amt == 0 { continue; }

        let (qid, inv) = hub_client.request_mint_quote(transfer_amt).await?;

        // Prepare change outputs to absorb the safe_fee buffer
        let entry_client = MintClient::new(&entry.mint);
        let entry_keyset = entry_client.fetch_keyset().await?;
        
        let change_denoms = ecash_core::Amount::from_sat(safe_fee).split_into_powers_of_2();
        let mut change_sessions = Vec::new();
        let mut change_outputs = Vec::new();
        
        for &d in &change_denoms {
            let secret = deriv.next_secret();
            let sess = ecash_core::dhke::BlindingSession::new(&secret);
            change_outputs.push(serde_json::json!({"amount": d, "id": entry_keyset.id, "B_": sess.b_prime_hex()}));
            change_sessions.push((sess, deriv.index));
            deriv.index += 1;
        }

        let (paid, change_sigs) = entry_client.melt_tokens(&entry.proofs, &inv, None, Some(change_outputs)).await?;
        
        if paid {
            // Reclaim any change left over from the fee buffer
            let mut reclaimed_proofs = Vec::new();
            for (sess_info, sig) in change_sessions.iter().zip(change_sigs.iter()) {
                let (sess, idx) = sess_info;
                let amount = sig["amount"].as_u64().unwrap();
                let sig_id = sig["id"].as_str().unwrap_or(&entry_keyset.id);
                let c_prime = ecash_core::dhke::point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
                let mint_pk = ecash_core::dhke::point_from_hex(entry_keyset.keys.get(&amount).unwrap()).unwrap();
                let dleq = parse_dleq(sig);
                let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
                proof.derivation_index = *idx;
                reclaimed_proofs.push(proof);
            }
            if !reclaimed_proofs.is_empty() {
                state.proofs.entry(entry.mint.clone()).or_default().extend(reclaimed_proofs);
            }
        }

        if paid {
            let denoms = Amount::from_sat(transfer_amt).split_into_powers_of_2();
            let mut sessions = Vec::new();
            let mut outputs = Vec::new();
            for &d in &denoms {
                let index = deriv.index;
                let secret = deriv.next_secret();
                let sess = BlindingSession::new(&secret);
                outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
                sessions.push((sess, index));
            }
            let sigs = hub_client.mint_tokens(&qid, outputs).await?;
            for ((sess, index), sig) in sessions.iter().zip(sigs.iter()) {
                let amount = sig["amount"].as_u64().unwrap();
                let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id);
                let c_prime = point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
                let mint_pk = point_from_hex(hub_keyset.keys.get(&amount).unwrap()).unwrap();
                let dleq = parse_dleq(sig);
                let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
                proof.derivation_index = *index;
                hub_proofs.push(proof);
            }
        }
    }

    state.derivation_index = deriv.index;

    let total_hub_sats: u64 = hub_proofs.iter().map(|p| p.amount).sum();
    println!("Total consolidated proofs available at Hub: {} sats", total_hub_sats);

    let payment_result = async {
        let qv: serde_json::Value = hub_client.http.post(format!("{}/v1/melt/quote/bolt11", hub_client.url))
            .json(&serde_json::json!({ "request": external_invoice, "unit": "sat" })).send().await?.json().await?;
        if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
        if let Some(err) = qv.get("detail") { return Err(anyhow!("Melt quote error (detail): {}", err)); }

        let required_amt = qv["amount"].as_u64().unwrap_or(0);
        let fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
        println!("Mint requires: {} sats (amount) + {} sats (fee reserve) = {} sats", required_amt, fee_reserve, required_amt + fee_reserve);

        if total_hub_sats < required_amt + fee_reserve {
            return Err(anyhow!("Insufficient consolidated funds. Have {}, Need {}", total_hub_sats, required_amt + fee_reserve));
        }

        let max_change = total_hub_sats.saturating_sub(required_amt);
        let change_denoms = Amount::from_sat(max_change).split_into_powers_of_2();
        let mut sessions = Vec::new();
        let mut outputs = Vec::new();
        for &d in &change_denoms {
            let secret = deriv.next_secret();
            let sess = BlindingSession::new(&secret);
            outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
            sessions.push(sess);
        }

        let (paid, change_sigs) = hub_client.melt_tokens(&hub_proofs, external_invoice, None, Some(outputs)).await?;

        let mut new_proofs = Vec::new();
        for (sess, sig) in sessions.iter().zip(change_sigs.iter()) {
            let amount = sig["amount"].as_u64().unwrap();
            let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id);
            let c_prime = point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
            let mint_pk = point_from_hex(hub_keyset.keys.get(&amount).unwrap()).unwrap();
            let dleq = parse_dleq(sig);
            let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
            proof.derivation_index = deriv.index;
            new_proofs.push(proof);
        }
        state.proofs.entry(hub_mint.to_string()).or_default().extend(new_proofs);

        Ok((paid, required_amt))
    }.await;

    match payment_result {
        Ok((true, amt)) => {
            state.save_encrypted(wallet_path, passphrase).ok();
            Ok(amt)
        }
        Ok((false, _)) => {
            state.save_encrypted(wallet_path, passphrase).ok();
            Err(anyhow!("Lightning Network payment failed. The mint tried to pay but couldn't find a route or the invoice expired. Your funds have been refunded to your wallet dashboard."))
        }
        Err(e) => {
            state.proofs.entry(hub_mint.to_string()).or_default().extend(hub_proofs);
            state.save_encrypted(wallet_path, passphrase).ok();
            Err(anyhow!("{}\n(Your funds were safely routed to your local wallet dashboard. You can retry sending to Lightning from there).", e))
        }
    }
}

pub async fn pay_invoice(state: &mut WalletState, wallet_path: &PathBuf, passphrase: &str, invoice: &str) -> Result<u64> {
    let mut selected_mint = None;
    let mut required_amt = 0;
    let mut fee_reserve;

    for mint in state.proofs.keys() {
        let client = MintClient::new(mint);
        let resp = client.http.post(format!("{}/v1/melt/quote/bolt11", client.url))
            .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await;

        if let Ok(resp) = resp {
            if let Ok(qv) = resp.json::<serde_json::Value>().await {
                if qv.get("error").is_none() && qv.get("detail").is_none() {
                    required_amt = qv["amount"].as_u64().unwrap_or(0);
                    fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);

                    let balance: u64 = state.proofs.get(mint).unwrap().iter().map(|p| p.amount).sum();
                    if balance >= required_amt + fee_reserve {
                        selected_mint = Some(mint.clone());
                        break;
                    }
                }
            }
        }
    }

    let hub_mint = selected_mint.ok_or_else(|| anyhow!("No single mint in your wallet has enough balance to pay this invoice."))?;
    let hub_proofs = state.proofs.get(&hub_mint).unwrap().clone();
    let hub_client = MintClient::new(&hub_mint);
    let hub_keyset = hub_client.fetch_keyset().await?;

    let mut deriv = TokenDerivation::from_hex(&state.seed_hex)?;
    deriv.index = state.derivation_index;

    let total_hub_sats: u64 = hub_proofs.iter().map(|p| p.amount).sum();
    let max_change = total_hub_sats.saturating_sub(required_amt);
    let change_denoms = Amount::from_sat(max_change).split_into_powers_of_2();

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for &d in &change_denoms {
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({"amount": d, "id": hub_keyset.id, "B_": sess.b_prime_hex()}));
        sessions.push(sess);
    }

    // Advance and persist the derivation index BEFORE calling melt.
    // This ensures that if the mint signs our change outputs but the Lightning
    // payment fails (or the process crashes), a retry will always generate
    // fresh B_ blinding factors and never hit "outputs already signed".
    state.derivation_index = deriv.index;
    state.save_encrypted(wallet_path, passphrase).ok();

    let (paid, change_sigs) = hub_client.melt_tokens(&hub_proofs, invoice, None, Some(outputs)).await?;

    state.proofs.remove(&hub_mint);

    let mut new_proofs = Vec::new();
    for (sess, sig) in sessions.iter().zip(change_sigs.iter()) {
        let amount = sig["amount"].as_u64().unwrap();
        let sig_id = sig["id"].as_str().unwrap_or(&hub_keyset.id);
        let c_prime = point_from_hex(sig["C_"].as_str().unwrap()).unwrap();
        let mint_pk = point_from_hex(hub_keyset.keys.get(&amount).unwrap()).unwrap();
        let dleq = parse_dleq(sig);
        let mut proof = sess.unblind(&c_prime, &mint_pk, amount, sig_id, dleq);
        proof.derivation_index = deriv.index;
        new_proofs.push(proof);
    }

    if !new_proofs.is_empty() {
        state.proofs.insert(hub_mint.clone(), new_proofs);
    }

    state.save_encrypted(wallet_path, passphrase).ok();

    if !paid {
        return Err(anyhow!("Lightning Network payment failed. The mint could not find a route or the invoice expired. Your refund has been saved to your wallet."));
    }

    Ok(required_amt)
}
