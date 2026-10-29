//! Deterministic token-secret derivation.
//!
//! Each token's secret is derived from a 32-byte master seed + index via
//! HMAC-SHA256, allowing full wallet recovery from a single backup.
//!
//! # Production upgrade path
//! Replace the flat HMAC derivation with BIP-32/BIP-44 extended key
//! derivation for hardware-wallet compatibility.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub struct TokenDerivation {
    seed: [u8; 32],
    pub index: u64,
}

impl TokenDerivation {
    // ─── Constructors ──────────────────────────────────────────────────────

    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self { seed, index: 0 }
    }

    /// Parse a hex-encoded 32-byte seed (64 hex chars).
    pub fn from_hex(seed_hex: &str) -> std::result::Result<Self, hex::FromHexError> {
        let bytes = hex::decode(seed_hex)?;
        if bytes.len() != 32 {
            return Err(hex::FromHexError::InvalidStringLength);
        }
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&bytes);
        Ok(Self { seed, index: 0 })
    }

    /// Generate a fresh random seed. Returns `(derivation, seed_hex)`.
    pub fn generate() -> (Self, String) {
        use rand::RngCore;
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let hex = hex::encode(seed);
        (Self { seed, index: 0 }, hex)
    }

    // ─── Derivation ────────────────────────────────────────────────────────

    /// Derive and advance: returns the secret for the current index,
    /// then increments the index.
    pub fn next_secret(&mut self) -> String {
        let s = self.secret_at(self.index);
        self.index += 1;
        s
    }

    /// Derive a token secret at a fixed index without changing state.
    ///
    /// `secret = hex(HMAC-SHA256(seed, "physical-ecash-v1-" || index_le64))`
    pub fn secret_at(&self, index: u64) -> String {
        let mut mac =
            HmacSha256::new_from_slice(&self.seed).expect("HMAC accepts any key size");
        mac.update(b"physical-ecash-v1-");
        mac.update(&index.to_le_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    /// Derive a 32-byte blinding factor seed at a fixed index without changing state.
    ///
    /// `r_bytes = HMAC-SHA256(seed, "physical-ecash-r-v1-" || index_le64)`
    /// This keeps the blinding factor `r` independent of `secret` so the mint
    /// cannot recompute `r` or `B'` when `secret` is revealed upon spending.
    pub fn blinding_factor_at(&self, index: u64) -> [u8; 32] {
        let mut mac =
            HmacSha256::new_from_slice(&self.seed).expect("HMAC accepts any key size");
        mac.update(b"physical-ecash-r-v1-");
        mac.update(&index.to_le_bytes());
        mac.finalize().into_bytes().into()
    }

    /// Derive both secret and blinding factor at `self.index`, advance `self.index`,
    /// and return a `BlindingSession`.
    pub fn next_session(&mut self) -> crate::dhke::BlindingSession {
        let idx = self.index;
        self.index += 1;
        self.session_at(idx)
    }

    /// Derive a `BlindingSession` at a fixed index using the seed-derived blinding factor.
    pub fn session_at(&self, index: u64) -> crate::dhke::BlindingSession {
        let secret = self.secret_at(index);
        let r_bytes = self.blinding_factor_at(index);
        crate::dhke::BlindingSession::with_blinding_factor(&secret, &r_bytes)
    }

    /// Legacy `BlindingSession` derivation where `r` was derived directly from `secret`.
    /// Retained strictly as a fallback for recovering or verifying pre-v0.1.13 notes/proofs.
    pub fn session_at_legacy(&self, index: u64) -> crate::dhke::BlindingSession {
        let secret = self.secret_at(index);
        crate::dhke::BlindingSession::new_legacy(&secret)
    }


}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derivation_is_deterministic() {
        let d = TokenDerivation::from_seed([7u8; 32]);
        assert_eq!(d.secret_at(0), d.secret_at(0));
        assert_ne!(d.secret_at(0), d.secret_at(1));
    }

    #[test]
    fn next_secret_advances_index() {
        let mut d = TokenDerivation::from_seed([1u8; 32]);
        let s0 = d.next_secret();
        let s1 = d.next_secret();
        assert_ne!(s0, s1);
        assert_eq!(d.index, 2);
    }

    #[test]
    fn hex_roundtrip() {
        let (d, hex) = TokenDerivation::generate();
        let d2 = TokenDerivation::from_hex(&hex).unwrap();
        assert_eq!(d.secret_at(42), d2.secret_at(42));
    }


}
