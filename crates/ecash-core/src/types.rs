use serde::{Deserialize, Serialize};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Split an amount in satoshis into power-of-2 denominations (Cashu standard).
pub fn split_into_powers_of_2(amount: u64) -> Vec<u64> {
    let mut result = Vec::new();
    let mut v = amount;
    let mut bit = 1u64;
    while v > 0 {
        if v & 1 == 1 {
            result.push(bit);
        }
        v >>= 1;
        bit <<= 1;
    }
    result
}

// ─── Cashu proof (NUT-00) ────────────────────────────────────────────────────

/// A Cashu proof: the bearer credential for a specific denomination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proof {
    /// Amount in satoshis.
    pub amount: u64,
    /// Keysets id (hex).
    pub id: String,
    /// The token secret `x` (random string, hash-to-curved before signing).
    pub secret: String,
    /// Unblinded mint signature `C` (compressed SEC1 hex, 66 chars).
    #[serde(rename = "C")]
    pub c: String,
    /// Blinded signature `C_` (needed for offline verification).
    #[serde(rename = "C_", skip_serializing_if = "Option::is_none")]
    pub c_prime: Option<String>,
    /// Blinded message `B_` (needed for offline verification).
    #[serde(rename = "B_", skip_serializing_if = "Option::is_none")]
    pub b_prime: Option<String>,
    /// DLEQ Proof (NUT-12).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dleq: Option<Dleq>,
    /// The deterministic derivation index used to generate the secret.
    #[serde(default)]
    pub derivation_index: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dleq {
    pub e: String,
    pub s: String,
}

// ─── Wire types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicProof {
    pub amount: u64,
    pub id: String,
    #[serde(rename = "C")]
    pub c: String,
    #[serde(rename = "C_", skip_serializing_if = "Option::is_none")]
    pub c_prime: Option<String>,
    #[serde(rename = "B_", skip_serializing_if = "Option::is_none")]
    pub b_prime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dleq: Option<Dleq>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<String>,
    #[serde(default)]
    pub derivation_index: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicTokenEntry {
    pub mint: String,
    pub proofs: Vec<PublicProof>,
}

/// The data encoded in the PUBLIC QR (outside the tamper-evident seal).
/// Anyone can scan this to verify authenticity without redeeming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicNoteData {
    pub entries: Vec<PublicTokenEntry>,
    pub validation_hash: String,
    /// Face value of the note in satoshis (what it is worth to the holder).
    /// Proofs include extra fee reserves, so the proof sum is always ≥ this value.
    #[serde(default)]
    pub face_value_sats: u64,
}

/// The data hidden UNDER the tamper-evident seal.
/// Reveals the Cashu token needed to redeem funds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateNoteData {
    pub master_seed_hex: String,
}

/// Cashu token v3 format (https://github.com/cashubtc/nuts/blob/main/00.md).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashuToken {
    pub token: Vec<TokenEntry>,
    pub unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEntry {
    pub mint: String,
    pub proofs: Vec<Proof>,
}

impl TokenEntry {
    pub fn to_public(&self) -> PublicTokenEntry {
        PublicTokenEntry {
            mint: self.mint.clone(),
            proofs: self.proofs.iter().map(|p| PublicProof {
                amount: p.amount,
                id: p.id.clone(),
                c: p.c.clone(),
                c_prime: p.c_prime.clone(),
                b_prime: p.b_prime.clone(),
                dleq: p.dleq.clone(),
                y: Some(crate::dhke::point_to_hex(&crate::dhke::hash_to_curve(p.secret.as_bytes()))),
                derivation_index: p.derivation_index,
            }).collect(),
        }
    }
}

impl CashuToken {
    pub fn total_amount(&self) -> u64 {
        self.token
            .iter()
            .flat_map(|e| e.proofs.iter())
            .map(|p| p.amount)
            .sum()
    }

    /// Encode as a `cashuA…` token string (base64url-encoded JSON).
    pub fn encode(&self) -> String {
        use base64::Engine;
        let json = serde_json::to_string(self).unwrap();
        let b64 =
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        format!("cashuA{}", b64)
    }
}

// ─── Physical note ───────────────────────────────────────────────────────────

/// A complete physical note, combining front-facing and sealed data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalNote {
    /// Total redeemable amount in satoshis.
    pub amount_sats: u64,
    /// Issuing mint URLs.
    pub mint_urls: Vec<String>,
    /// Human-readable serial number (e.g. `A1B2-C3D4-E5F6`).
    pub serial: String,
    /// SHA-256 integrity hash (displayed on front of note).
    pub validation_hash: String,
    /// Bitcoin block height when issued (replaces timestamp).
    #[serde(alias = "issued_at", default)]
    pub block_height: u64,
    /// Strategy used for the fee reserve ('static' or 'dynamic').
    #[serde(default)]
    pub fee_strategy: String,
    /// Publicly visible data (outside the seal).
    pub public_data: PublicNoteData,
    pub private_data: PrivateNoteData,
}

// ─── Transaction History ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransactionStatus {
    Pending,
    Success,
    Failed,
    FailedMintError, // Proofs spent but invoice unpaid
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintTransactionData {
    pub quote_id: String,
    pub outputs: Vec<serde_json::Value>,
    /// We need the blinding sessions to unblind the tokens when retrying
    pub blinding_sessions_hex: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeltTransactionData {
    pub quote_id: String,
    pub proofs: Vec<Proof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueTransactionData {
    pub note: Option<PhysicalNote>,
    #[serde(default)]
    pub allocations: Vec<(String, u64)>, // (mint_url, amount)
    #[serde(default)]
    pub hub_mint: String,
    #[serde(default)]
    pub quote_id: String,
    #[serde(default)]
    pub master_seed_hex: String,
    #[serde(default)]
    pub fee_strategy: String,
    // Store necessary blinding secrets to resume the issuance if interrupted
    #[serde(default)]
    pub hub_blinding_sessions_hex: Vec<String>,
    #[serde(default)]
    pub hub_outputs: Vec<serde_json::Value>,
    // Store child mint quotes: (mint, amt, qid, inv, fee)
    #[serde(default)]
    pub child_quotes: Vec<(String, u64, String, String, u64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemTransactionData {
    pub public_data: PublicNoteData,
    pub master_seed_hex: String,
    pub external_invoice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendTransactionData {
    pub token_string: String,
    pub proofs: Vec<Proof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiveEcashTransactionData {
    pub token_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiveLightningTransactionData {
    pub quote_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionType {
    Mint(MintTransactionData),
    Melt(MeltTransactionData),
    Issue(IssueTransactionData),
    Redeem(RedeemTransactionData),
    Send(SendTransactionData),
    ReceiveEcash(ReceiveEcashTransactionData),
    ReceiveLightning(ReceiveLightningTransactionData),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub tx_type: TransactionType,
    pub amount: u64,
    pub fee: u64,
    pub status: TransactionStatus,
    pub timestamp: u64,
    pub mint_url: String,
}
