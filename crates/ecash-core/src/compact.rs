//! Compact binary codec for `PublicNoteData`.
//!
//! ## Wire format
//!
//! ```text
//! [HEADER — 44 bytes]
//!   magic:            2 bytes   (0xEC, 0xA5)
//!   version:          1 byte    (0x01)
//!   face_value_sats:  4 bytes   (u32 LE)
//!   issued_at:        4 bytes   (u32 LE)
//!   validation_hash:  32 bytes  (raw SHA-256)
//!   num_mints:        1 byte
//!
//! [FOR EACH MINT GROUP]
//!   mint_url_len:     1 byte
//!   mint_url:         N bytes   (UTF-8)
//!   num_proofs:       1 byte
//!
//!   [FOR EACH PROOF]
//!     amount:         4 bytes   (u32 LE)
//!     id:             8 bytes   (keyset-id hex decoded — 16 hex chars → 8 bytes)
//!     derivation_idx: 4 bytes   (u32 LE)
//!     C:              33 bytes  (compressed secp256k1 point)
//!     C_:             33 bytes
//!     B_:             33 bytes
//!     y:              33 bytes
//!     dleq_e:         32 bytes  (scalar)
//!     dleq_s:         32 bytes
//! ```
//!
//! Per-proof size: 212 bytes (vs ~600 bytes of JSON → 65% smaller).

use crate::types::{Dleq, PublicNoteData, PublicProof, PublicTokenEntry};

const MAGIC: [u8; 2] = [0xEC, 0xA5];
const VERSION: u8 = 0x01;

// ─── Encode ──────────────────────────────────────────────────────────────────

/// Encode `PublicNoteData` to compact binary.
///
/// # Panics
/// Panics if any hex field is not valid hex or not the expected length (these
/// are all internal invariants guaranteed when a note is issued).
pub fn encode_public_data(data: &PublicNoteData, face_value_sats: u64, issued_at: u64) -> Vec<u8> {
    let mut buf = Vec::with_capacity(256);

    // Header
    buf.extend_from_slice(&MAGIC);
    buf.push(VERSION);
    buf.extend_from_slice(&(face_value_sats as u32).to_le_bytes());
    buf.extend_from_slice(&(issued_at as u32).to_le_bytes());
    buf.extend_from_slice(&hex_to_bytes32(&data.validation_hash));
    buf.push(data.entries.len() as u8);

    for entry in &data.entries {
        let url_bytes = entry.mint.as_bytes();
        buf.push(url_bytes.len() as u8);
        buf.extend_from_slice(url_bytes);
        buf.push(entry.proofs.len() as u8);

        for proof in &entry.proofs {
            // amount (4 bytes)
            buf.extend_from_slice(&(proof.amount as u32).to_le_bytes());
            // keyset id (8 bytes — id is 16 hex chars)
            buf.extend_from_slice(&hex_to_bytes8(&proof.id));
            // derivation index (4 bytes)
            buf.extend_from_slice(&(proof.derivation_index as u32).to_le_bytes());
            // secp256k1 points (33 bytes each)
            buf.extend_from_slice(&hex_to_bytes33(&proof.c));
            buf.extend_from_slice(&hex_to_bytes33(proof.c_prime.as_deref().unwrap_or(&"00".repeat(33))));
            buf.extend_from_slice(&hex_to_bytes33(proof.b_prime.as_deref().unwrap_or(&"00".repeat(33))));
            buf.extend_from_slice(&hex_to_bytes33(proof.y.as_deref().unwrap_or(&"00".repeat(33))));
            // DLEQ scalars (32 bytes each)
            if let Some(dleq) = &proof.dleq {
                buf.extend_from_slice(&hex_to_bytes32(&dleq.e));
                buf.extend_from_slice(&hex_to_bytes32(&dleq.s));
            } else {
                buf.extend_from_slice(&[0u8; 32]);
                buf.extend_from_slice(&[0u8; 32]);
            }
        }
    }

    buf
}

// ─── Decode ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum DecodeError {
    TooShort,
    BadMagic,
    UnsupportedVersion(u8),
    InvalidUtf8,
    TrailingData,
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::TooShort => write!(f, "binary payload too short"),
            DecodeError::BadMagic => write!(f, "not a valid ecash binary (wrong magic bytes)"),
            DecodeError::UnsupportedVersion(v) => write!(f, "unsupported binary version 0x{:02x}", v),
            DecodeError::InvalidUtf8 => write!(f, "mint URL is not valid UTF-8"),
            DecodeError::TrailingData => write!(f, "unexpected trailing data in binary payload"),
        }
    }
}

pub struct DecodedPublicData {
    pub data: PublicNoteData,
    pub face_value_sats: u64,
    pub issued_at: u64,
}

pub fn decode_public_data(bytes: &[u8]) -> Result<DecodedPublicData, DecodeError> {
    let mut r = Reader::new(bytes);

    // Header
    let magic = r.read(2)?;
    if magic != MAGIC {
        return Err(DecodeError::BadMagic);
    }
    let version = r.read(1)?[0];
    if version != VERSION {
        return Err(DecodeError::UnsupportedVersion(version));
    }
    let face_value_sats = u32::from_le_bytes(r.read(4)?.try_into().unwrap()) as u64;
    let issued_at = u32::from_le_bytes(r.read(4)?.try_into().unwrap()) as u64;
    let validation_hash = hex::encode(r.read(32)?);
    let num_mints = r.read(1)?[0] as usize;

    let mut entries = Vec::with_capacity(num_mints);

    for _ in 0..num_mints {
        let url_len = r.read(1)?[0] as usize;
        let url_bytes = r.read(url_len)?;
        let mint = std::str::from_utf8(url_bytes)
            .map_err(|_| DecodeError::InvalidUtf8)?
            .to_string();
        let num_proofs = r.read(1)?[0] as usize;

        let mut proofs = Vec::with_capacity(num_proofs);
        for _ in 0..num_proofs {
            let amount = u32::from_le_bytes(r.read(4)?.try_into().unwrap()) as u64;
            let id = hex::encode(r.read(8)?);
            let derivation_index = u32::from_le_bytes(r.read(4)?.try_into().unwrap()) as u64;

            let c = hex::encode(r.read(33)?);
            let c_prime = hex::encode(r.read(33)?);
            let b_prime = hex::encode(r.read(33)?);
            let y = hex::encode(r.read(33)?);
            let dleq_e = hex::encode(r.read(32)?);
            let dleq_s = hex::encode(r.read(32)?);

            proofs.push(PublicProof {
                amount,
                id,
                c,
                c_prime: Some(c_prime),
                b_prime: Some(b_prime),
                y: Some(y),
                dleq: Some(Dleq { e: dleq_e, s: dleq_s }),
                derivation_index,
            });
        }

        entries.push(PublicTokenEntry { mint, proofs });
    }

    if !r.is_empty() {
        return Err(DecodeError::TrailingData);
    }

    Ok(DecodedPublicData {
        data: PublicNoteData {
            entries,
            validation_hash,
            face_value_sats,
        },
        face_value_sats,
        issued_at,
    })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn read(&mut self, n: usize) -> Result<&'a [u8], DecodeError> {
        if self.pos + n > self.data.len() {
            return Err(DecodeError::TooShort);
        }
        let slice = &self.data[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn is_empty(&self) -> bool {
        self.pos >= self.data.len()
    }
}

fn hex_to_bytes32(s: &str) -> [u8; 32] {
    let v = hex::decode(s).expect("invalid hex in proof field (expected 32 bytes)");
    v.try_into().expect("hex field is not 32 bytes")
}

fn hex_to_bytes33(s: &str) -> [u8; 33] {
    let v = hex::decode(s).expect("invalid hex in proof field (expected 33 bytes)");
    v.try_into().expect("hex field is not 33 bytes")
}

fn hex_to_bytes8(s: &str) -> [u8; 8] {
    let v = hex::decode(s).expect("invalid hex in keyset id (expected 8 bytes)");
    v.try_into().expect("keyset id is not 8 bytes")
}
