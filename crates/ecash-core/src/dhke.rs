//! Cashu NUT-00 Blind Diffie-Hellman Key Exchange (DHKE).
//!
//! Reference: <https://github.com/cashubtc/nuts/blob/main/00.md>
//!
//! Protocol summary
//! ────────────────
//!   Y  = hash_to_curve(secret)          // deterministic point from secret
//!   r  = random scalar (blinding factor)
//!   B' = Y + r·G                        // blinded message (wallet → mint)
//!   C' = k·B'                           // blind signature (mint → wallet)
//!   C  = C' − r·K   where K = k·G      // unblind (wallet-side)
//!   Verify: C == k·Y                    // mint checks this on redemption

use k256::{
    AffinePoint, EncodedPoint, ProjectivePoint, SecretKey,
    elliptic_curve::{group::GroupEncoding, sec1::FromEncodedPoint, Field},
};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};
use crate::types::{Proof, Dleq};

// ─── Domain separator (NUT-00) ────────────────────────────────────────────────

const H2C_DOMAIN: &[u8] = b"Secp256k1_HashToCurve_Cashu_";

// ─── hash_to_curve ───────────────────────────────────────────────────────────

/// Hash an arbitrary byte string to a secp256k1 point (NUT-00 spec).
///
/// ```text
/// pre_hash = SHA256(H2C_DOMAIN || message)
/// loop counter = 0, 1, 2, …:
///     x_bytes = SHA256(pre_hash || counter_le32)
///     try to parse (0x02 || x_bytes) as a compressed secp256k1 point
///     if valid → return the point
/// ```
pub fn hash_to_curve(message: &[u8]) -> ProjectivePoint {
    let pre: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(H2C_DOMAIN);
        h.update(message);
        h.finalize().into()
    };

    for counter in 0u32.. {
        let x: [u8; 32] = {
            let mut h = Sha256::new();
            h.update(&pre);
            h.update(&counter.to_le_bytes());
            h.finalize().into()
        };

        let mut buf = [0u8; 33];
        buf[0] = 0x02; // even-y compressed prefix
        buf[1..].copy_from_slice(&x);

        if let Ok(ep) = EncodedPoint::from_bytes(&buf) {
            let aff = AffinePoint::from_encoded_point(&ep);
            if bool::from(aff.is_some()) {
                return ProjectivePoint::from(aff.unwrap());
            }
        }
    }
    unreachable!("hash_to_curve: ran out of counter space")
}

// ─── Point encoding helpers ───────────────────────────────────────────────────

/// Encode a `ProjectivePoint` as a 66-char compressed hex string.
pub fn point_to_hex(p: &ProjectivePoint) -> String {
    hex::encode(&p.to_bytes()[..])
}

/// Decode a `ProjectivePoint` from a compressed hex string.
pub fn point_from_hex(s: &str) -> Result<ProjectivePoint> {
    let bytes = hex::decode(s)?;
    let ep = EncodedPoint::from_bytes(&bytes).map_err(|_| Error::InvalidPoint)?;
    let aff = AffinePoint::from_encoded_point(&ep);
    if bool::from(aff.is_some()) {
        Ok(ProjectivePoint::from(aff.unwrap()))
    } else {
        Err(Error::InvalidPoint)
    }
}

// ─── Mint keypair ────────────────────────────────────────────────────────────

/// The mint's keypair: private scalar `k`, public point `K = k·G`.
pub struct MintKeypair {
    inner: SecretKey,
}

impl MintKeypair {
    /// Generate a fresh random keypair.
    pub fn generate() -> Self {
        Self {
            inner: SecretKey::random(&mut OsRng),
        }
    }

    /// Reconstruct from 32 raw secret bytes.
    pub fn from_secret_bytes(bytes: [u8; 32]) -> Result<Self> {
        SecretKey::from_bytes(&bytes.into())
            .map(|inner| Self { inner })
            .map_err(|e| Error::Key(e.to_string()))
    }

    /// Export 32 secret bytes (for deterministic re-derivation).
    pub fn secret_bytes(&self) -> [u8; 32] {
        self.inner.to_bytes().into()
    }

    /// Public key `K = k·G` as a `ProjectivePoint`.
    pub fn public_point(&self) -> ProjectivePoint {
        ProjectivePoint::from(self.inner.public_key().as_affine())
    }

    /// Public key as a 66-char compressed hex string.
    pub fn public_key_hex(&self) -> String {
        point_to_hex(&self.public_point())
    }

    /// Cashu NUT-02 keyset ID: `"00"` + first 14 hex chars of SHA-256(pubkey).
    pub fn keyset_id(&self) -> String {
        let bytes = self.public_point().to_bytes();
        let hash = Sha256::digest(&bytes[..]);
        format!("00{}", hex::encode(&hash[..7]))
    }

    /// Blind-sign a blinded point: `C' = k · B'`.
    pub fn blind_sign(&self, b_prime: &ProjectivePoint) -> ProjectivePoint {
        let k = *self.inner.to_nonzero_scalar();
        *b_prime * k
    }

    /// Server-side proof verification: `C == k · hash_to_curve(secret)`.
    pub fn verify_proof(&self, proof: &Proof) -> bool {
        let y = hash_to_curve(proof.secret.as_bytes());
        let k = *self.inner.to_nonzero_scalar();
        let expected = y * k;
        if let Ok(c) = point_from_hex(&proof.c) {
            if c != expected {
                println!("verify_proof FAILED! Expected: {}, Got: {}", point_to_hex(&expected), proof.c);
                false
            } else {
                true
            }
        } else {
            false
        }
    }

    /// Blind-sign and attach a NUT-12 DLEQ proof.
    pub fn blind_sign_with_dleq(&self, b_prime: &ProjectivePoint) -> (ProjectivePoint, Dleq) {
        let c_prime = self.blind_sign(b_prime);
        
        let r = <k256::Scalar as Field>::random(&mut OsRng);
        let r1 = ProjectivePoint::GENERATOR * r;
        let r2 = *b_prime * r;
        
        let a = self.public_point();
        let e = hash_e(&r1, &r2, &a, &c_prime);
        let k = *self.inner.to_nonzero_scalar();
        let s = r + e * k;
        
        (c_prime, Dleq {
            e: hex::encode(e.to_bytes()),
            s: hex::encode(s.to_bytes()),
        })
    }
}

// ─── NUT-12 DLEQ Helpers ─────────────────────────────────────────────────────

/// Hash elements to a scalar for the DLEQ challenge `e`.
/// `hash_e = SHA256(R1 || R2 || A || C_)`
pub fn hash_e(
    r1: &ProjectivePoint,
    r2: &ProjectivePoint,
    a: &ProjectivePoint,
    c_prime: &ProjectivePoint,
) -> k256::Scalar {
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    let to_uncompressed_hex = |p: &ProjectivePoint| -> String {
        let ep = p.to_affine().to_encoded_point(false);
        hex::encode(ep.as_bytes())
    };

    let mut e_str = String::new();
    e_str.push_str(&to_uncompressed_hex(r1));
    e_str.push_str(&to_uncompressed_hex(r2));
    e_str.push_str(&to_uncompressed_hex(a));
    e_str.push_str(&to_uncompressed_hex(c_prime));

    let hash = Sha256::digest(e_str.as_bytes());
    use k256::elliptic_curve::ops::Reduce;
    <k256::Scalar as Reduce<k256::U256>>::reduce_bytes(&hash)
}

/// Offline DLEQ verification.
pub fn verify_dleq(
    mint_pubkey: &ProjectivePoint,
    c_prime: &ProjectivePoint,
    b_prime: &ProjectivePoint,
    dleq: &Dleq,
) -> bool {
    let e_bytes = hex::decode(&dleq.e).unwrap_or_default();
    let s_bytes = hex::decode(&dleq.s).unwrap_or_default();

    if e_bytes.len() != 32 || s_bytes.len() != 32 {
        return false;
    }

    use k256::elliptic_curve::ops::Reduce;
    let e_arr: [u8; 32] = e_bytes.try_into().unwrap_or([0u8; 32]);
    let s_arr: [u8; 32] = s_bytes.try_into().unwrap_or([0u8; 32]);
    let e = <k256::Scalar as Reduce<k256::U256>>::reduce_bytes(&e_arr.into());
    let s = <k256::Scalar as Reduce<k256::U256>>::reduce_bytes(&s_arr.into());

    let r1 = (ProjectivePoint::GENERATOR * s) - (*mint_pubkey * e);
    let r2 = (*b_prime * s) - (*c_prime * e);

    let e_check = hash_e(&r1, &r2, mint_pubkey, c_prime);
    e == e_check
}

// ─── Wallet blinding session ─────────────────────────────────────────────────

/// Wallet-side blinding for one token secret.
///
/// Create with `BlindingSession::new(secret)`, send `b_prime_hex()` to
/// the mint, then call `unblind()` on the returned signature.
pub struct BlindingSession {
    r: k256::Scalar,
    pub b_prime: ProjectivePoint,
    pub secret: String,
}

impl BlindingSession {
    /// `B' = hash_to_curve(secret) + r·G`
    pub fn new(secret: &str) -> Self {
        // Derive `r` deterministically from `secret` so we can reconstruct the note later!
        let mut h = Sha256::new();
        h.update(b"physical-ecash-blinding-factor-");
        h.update(secret.as_bytes());
        let r_bytes = h.finalize();
        
        use k256::elliptic_curve::ops::Reduce;
        let r_arr: [u8; 32] = r_bytes.into();
        let r = <k256::Scalar as Reduce<k256::U256>>::reduce_bytes(&r_arr.into());
        
        let y = hash_to_curve(secret.as_bytes());
        let b_prime = y + ProjectivePoint::GENERATOR * r;
        Self {
            r,
            b_prime,
            secret: secret.to_string(),
        }
    }

    /// The blinded message as hex (send this to the mint).
    pub fn b_prime_hex(&self) -> String {
        point_to_hex(&self.b_prime)
    }

    /// `C = C' − r·K` → final `Proof`.
    pub fn unblind(
        &self,
        c_prime: &ProjectivePoint,
        mint_pubkey: &ProjectivePoint,
        amount: u64,
        keyset_id: &str,
        dleq: Option<Dleq>,
    ) -> Proof {
        let c = *c_prime - *mint_pubkey * self.r;
        Proof {
            amount,
            id: keyset_id.to_string(),
            secret: self.secret.clone(),
            c: point_to_hex(&c),
            c_prime: Some(point_to_hex(c_prime)),
            b_prime: Some(self.b_prime_hex()),
            dleq,
            derivation_index: 0,
        }
    }
}

// ─── Validation hash ─────────────────────────────────────────────────────────

/// Compute a SHA-256 integrity hash over a set of token entries.
/// Used to detect physical tampering of the note (front-side hash display).
pub fn compute_validation_hash(entries: &[crate::types::PublicTokenEntry]) -> String {
    let mut h = Sha256::new();
    for entry in entries {
        h.update(entry.mint.as_bytes());
        for p in &entry.proofs {
            h.update(p.c.as_bytes());
            h.update(p.amount.to_le_bytes());
            h.update(p.id.as_bytes());
        }
    }
    hex::encode(h.finalize())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_to_curve_is_deterministic() {
        assert_eq!(hash_to_curve(b"hello"), hash_to_curve(b"hello"));
        assert_ne!(hash_to_curve(b"hello"), hash_to_curve(b"world"));
    }

    #[test]
    fn point_roundtrip() {
        let p = ProjectivePoint::GENERATOR;
        assert_eq!(p, point_from_hex(&point_to_hex(&p)).unwrap());
    }

    #[test]
    fn blind_sign_unblind_verify() {
        let mint = MintKeypair::generate();
        let session = BlindingSession::new("my-secret-token");

        // Mint blind-signs
        let c_prime = mint.blind_sign(&session.b_prime);

        // Wallet unblinds
        let proof = session.unblind(&c_prime, &mint.public_point(), 1024, "00aabbcc", None);

        // Mint verifies on redemption
        assert!(mint.verify_proof(&proof));
    }

    #[test]
    fn tampered_proof_rejected() {
        let mint = MintKeypair::generate();
        let session = BlindingSession::new("real-secret");
        let c_prime = mint.blind_sign(&session.b_prime);
        let mut proof = session.unblind(&c_prime, &mint.public_point(), 64, "00aabbcc", None);
        proof.secret = "fake-secret".to_string();
        assert!(!mint.verify_proof(&proof));
    }
}
