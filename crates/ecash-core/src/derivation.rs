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
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&bytes[..32]);
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

    /// Derive a per-amount mint keypair seed.
    ///
    /// `key = HMAC-SHA256(seed, "mint-key-v1-" || amount_le64)`
    pub fn mint_amount_key(&self, amount: u64) -> [u8; 32] {
        let mut mac =
            HmacSha256::new_from_slice(&self.seed).expect("HMAC accepts any key size");
        mac.update(b"mint-key-v1-");
        mac.update(&amount.to_le_bytes());
        mac.finalize().into_bytes().into()
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

    #[test]
    fn mint_keys_are_stable() {
        let d = TokenDerivation::from_seed([0u8; 32]);
        assert_eq!(d.mint_amount_key(1), d.mint_amount_key(1));
        assert_ne!(d.mint_amount_key(1), d.mint_amount_key(2));
    }
}
