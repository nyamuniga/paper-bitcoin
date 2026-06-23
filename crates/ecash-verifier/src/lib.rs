//! Offline cryptographic verifier for physical ecash notes.
//!
//! Simulates what would run on an ESP32 hardware device:
//! pre-loaded mint public keys, no network required at verification time.
//!
//! ## What this verifies (offline)
//! 1. **Format** — every proof contains a valid secp256k1 point as `C`.
//! 2. **Integrity** — the SHA-256 validation hash matches the proof set.
//! 3. **Trust** — the mint URL appears in the pre-loaded trusted list.
//!
//! ## What requires online (redemption)
//! Full Chaumian blind-signature verification (`C == k·Y`) happens server-side
//! at the mint when the token is melted. Offline DLEQ proofs (NUT-12) are a
//! future upgrade that would enable full offline verification.

use std::collections::HashMap;

use ecash_core::{
    dhke::{compute_validation_hash, point_from_hex},
    types::PublicNoteData,
};

// ─── Verifier ─────────────────────────────────────────────────────────────────

/// Pre-loaded offline verifier.
///
/// In production (ESP32) the trusted mint keys are flashed at provisioning time.
/// On macOS (this simulator) they are fetched once and stored in memory.
#[derive(Default)]
pub struct OfflineVerifier {
    trusted: HashMap<String, String>, // mint_url → friendly name
    mint_keys: HashMap<String, HashMap<u64, String>>, // mint_url → (amount → pubkey)
}

impl OfflineVerifier {
    pub fn new() -> Self {
        Self::default()
    }

    /// Trust a mint URL and load its public keys (simulating ESP32 factory provisioning).
    pub fn trust_mint(&mut self, url: impl Into<String>, name: impl Into<String>, keys: HashMap<u64, String>) {
        let u = url.into();
        self.trusted.insert(u.clone(), name.into());
        self.mint_keys.insert(u, keys);
    }

    /// Verify from a `PublicNoteData` JSON string (the public QR payload).
    pub fn verify_json(&self, json_str: &str) -> VerificationResult {
        match serde_json::from_str::<PublicNoteData>(json_str) {
            Ok(data) => self.verify(&data),
            Err(e) => VerificationResult::InvalidFormat {
                reason: format!("JSON parse error: {}", e),
            },
        }
    }

    /// Verify a `PublicNoteData` struct directly.
    pub fn verify(&self, data: &PublicNoteData) -> VerificationResult {
        let mut total_sats = 0;
        let mut all_mints = Vec::new();
        let mut all_trusted = true;

        if data.entries.is_empty() {
            return VerificationResult::InvalidFormat {
                reason: "No entries in token".into(),
            };
        }

        for entry in &data.entries {
            // ── 1. Trusted mint check ─────────────────────────────────────
            if !self.trusted.contains_key(&entry.mint) {
                all_trusted = false;
            }
            if !all_mints.contains(&entry.mint) {
                all_mints.push(entry.mint.clone());
            }

            // ── 2. Non-empty proofs ───────────────────────────────────────────
            if entry.proofs.is_empty() {
                return VerificationResult::InvalidFormat {
                    reason: format!("Empty proofs for mint {}", entry.mint),
                };
            }

            // ── 3. DLEQ Verification (NUT-12) if trusted ──────────────────────
            if self.trusted.contains_key(&entry.mint) {
                let mint_key_map = match self.mint_keys.get(&entry.mint) {
                    Some(m) => m,
                    None => return VerificationResult::InvalidFormat { reason: format!("Trusted mint {} has no loaded keys", entry.mint) },
                };
                for (i, proof) in entry.proofs.iter().enumerate() {
                    let c_prime = match &proof.c_prime {
                        Some(cp_hex) => match point_from_hex(cp_hex) {
                            Ok(p) => p,
                            Err(_) => return VerificationResult::InvalidProofPoint { index: i },
                        },
                        None => return VerificationResult::InvalidFormat { reason: format!("Missing C_ point for proof {}", i) },
                    };
                    
                    // Get the mint public key for this denomination
                    let pubkey_hex = match mint_key_map.get(&proof.amount) {
                        Some(pk) => pk,
                        None => return VerificationResult::InvalidFormat { reason: format!("No known public key for denomination {}", proof.amount) },
                    };
                    let mint_pubkey = match point_from_hex(pubkey_hex) {
                        Ok(pk) => pk,
                        Err(_) => return VerificationResult::InvalidFormat { reason: format!("Invalid mint pubkey for denomination {}", proof.amount) },
                    };

                    // Get B_ and DLEQ
                    if let (Some(b_prime_hex), Some(dleq)) = (&proof.b_prime, &proof.dleq) {
                        if let Ok(b_prime) = point_from_hex(b_prime_hex) {
                            if !ecash_core::dhke::verify_dleq(&mint_pubkey, &c_prime, &b_prime, dleq) {
                                return VerificationResult::InvalidFormat { reason: format!("Cryptographic DLEQ Proof failed for proof {}", i) };
                            }
                        } else {
                            return VerificationResult::InvalidFormat { reason: format!("Invalid B_ point for proof {}", i) };
                        }
                    } else {
                        return VerificationResult::InvalidFormat { reason: format!("Missing DLEQ proof or B_ for proof {}", i) };
                    }

                    total_sats += proof.amount;
                }
            } else {
                // Untrusted mint, just sum up the sats from proofs
                for proof in &entry.proofs {
                    total_sats += proof.amount;
                }
            }
        }

        // ── 4. Integrity hash ─────────────────────────────────────────────
        let expected = compute_validation_hash(&data.entries);
        if expected != data.validation_hash {
            return VerificationResult::IntegrityMismatch;
        }

        // ── All checks passed ─────────────────────────────────────────────
        if all_trusted {
            VerificationResult::Valid {
                face_value_sats: if data.face_value_sats > 0 { data.face_value_sats } else { total_sats },
                proof_total_sats: total_sats,
                mint_urls: all_mints,
            }
        } else {
            VerificationResult::ValidUntrusted {
                face_value_sats: if data.face_value_sats > 0 { data.face_value_sats } else { total_sats },
                proof_total_sats: total_sats,
                mint_urls: all_mints,
            }
        }
    }
}

// ─── Result ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum SpentStatus {
    Unspent,
    Spent,
}

#[derive(Debug, PartialEq, Eq)]
pub enum VerificationResult {
    /// Note is cryptographically valid and signed by trusted mint(s).
    Valid {
        /// What the note is worth to the holder (face value).
        face_value_sats: u64,
        /// Sum of all proof amounts, which includes fee reserves (always ≥ face value).
        proof_total_sats: u64,
        mint_urls: Vec<String>,
    },
    /// Note format and hash are valid, but mint is untrusted (DLEQ skipped).
    ValidUntrusted {
        face_value_sats: u64,
        proof_total_sats: u64,
        mint_urls: Vec<String>,
    },
    /// Mint URL not in trusted list.
    UntrustedMint { url: String },
    /// Integrity hash does not match proof contents (tampered).
    IntegrityMismatch,
    /// Unparseable JSON or missing required fields.
    InvalidFormat { reason: String },
    /// A proof's `C` field is not a valid secp256k1 point (counterfeit).
    InvalidProofPoint { index: usize },
}

impl OfflineVerifier {
    pub async fn check_spend_state(data: &PublicNoteData) -> Result<SpentStatus, String> {
        for entry in &data.entries {
            let mut y_values = Vec::new();
            for p in &entry.proofs {
                if let Some(y) = &p.y {
                    y_values.push(y.clone());
                }
            }
            if y_values.is_empty() { continue; }
            
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .unwrap_or_default();
            
            let clean = entry.mint.trim_end_matches('/');
            let clean_mint_url = if let Ok(parsed) = reqwest::Url::parse(clean) {
                parsed.to_string().trim_end_matches('/').to_string()
            } else {
                clean.to_lowercase()
            };
            
            let resp = client.post(format!("{}/v1/checkstate", clean_mint_url))
                .json(&serde_json::json!({ "Ys": y_values }))
                .send()
                .await;
                
            if let Ok(r) = resp {
                if r.status().is_success() {
                    if let Ok(json) = r.json::<serde_json::Value>().await {
                        if let Some(states) = json.get("states").and_then(|s| s.as_array()) {
                            for state in states {
                                if state.get("state").and_then(|s| s.as_str()) == Some("SPENT") {
                                    return Ok(SpentStatus::Spent);
                                }
                            }
                            continue; // Successfully checked this mint, none were SPENT
                        }
                    }
                }
                return Err(format!("Mint {} returned an invalid or error response", entry.mint));
            } else {
                return Err(format!("Could not connect to mint {}", entry.mint));
            }
        }
        Ok(SpentStatus::Unspent)
    }
}

/// Human-readable one-line summary for terminal output.
pub fn fmt_result(r: &VerificationResult) -> String {
    match r {
        VerificationResult::Valid { face_value_sats, proof_total_sats, mint_urls } => {
            let mints = mint_urls.join(", ");
            if *proof_total_sats > *face_value_sats {
                format!(
                    "✅  VALID — {} sats face value  ({} sats in proofs, {} sats fee reserves) @ {}",
                    face_value_sats,
                    proof_total_sats,
                    proof_total_sats - face_value_sats,
                    mints
                )
            } else {
                format!("✅  VALID — {} sats @ {}", face_value_sats, mints)
            }
        }
        VerificationResult::ValidUntrusted { face_value_sats, mint_urls, .. } => {
            let mints = mint_urls.join(", ");
            format!("✅  VALID FORMAT — {} sats @ {}\n    ⚠️ MINT NOT TRUSTED/KEYS NOT LOADED", face_value_sats, mints)
        }
        VerificationResult::UntrustedMint { url } => format!(
            "⚠️   UNTRUSTED MINT — {}\n    Add this mint to your trusted list before accepting.",
            url
        ),
        VerificationResult::IntegrityMismatch => {
            "❌  INTEGRITY FAILURE — hash mismatch, note may be tampered.".into()
        }
        VerificationResult::InvalidFormat { reason } => {
            format!("❌  INVALID FORMAT — {}", reason)
        }
        VerificationResult::InvalidProofPoint { index } => format!(
            "❌  INVALID PROOF #{} — not a valid curve point (possible counterfeit).",
            index
        ),
    }
}
