//! Compact binary codec for `PublicNoteData`.
//!
//! ## Wire format
//!
//! ```text
//! [HEADER — 44 bytes]
//!   magic:            2 bytes   (0xEC, 0xA5)
//!   version:          1 byte    (0x01)
//!   face_value_sats:  4 bytes   (u32 LE)
//!   block_height:     4 bytes   (u32 LE)
//!   validation_hash:  32 bytes  (raw SHA-256)
//!   num_mints:        1 byte
//!
//! [FOR EACH MINT GROUP]
//!   mint_url_len:     1 byte
//!   mint_url:         N bytes   (UTF-8)
//!   num_proofs:       1 byte
//!
//!   [FOR EACH PROOF]
//!     amount:         varint
//!     id:             8 bytes   (keyset-id hex decoded — 16 hex chars → 8 bytes)
//!     derivation_idx: varint
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
const VERSION: u8 = 0x03;

// ─── Encode ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum EncodeError {
    InvalidHex,
    InvalidLength,
}

impl std::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EncodeError::InvalidHex => write!(f, "invalid hex string"),
            EncodeError::InvalidLength => write!(f, "hex string has invalid length"),
        }
    }
}

impl std::error::Error for EncodeError {}

/// Encode `PublicNoteData` to compact binary.
pub fn encode_public_data(data: &PublicNoteData, face_value_sats: u64, block_height: u64) -> Result<Vec<u8>, EncodeError> {
    let mut buf = Vec::with_capacity(256);

    // Header
    buf.extend_from_slice(&MAGIC);
    buf.push(VERSION);
    buf.extend_from_slice(&(face_value_sats as u32).to_le_bytes());
    buf.extend_from_slice(&(block_height as u32).to_le_bytes());
    buf.extend_from_slice(&hex_to_bytes32(&data.validation_hash)?);
    buf.push(data.entries.len() as u8);

    for entry in &data.entries {
        let url_bytes = entry.mint.as_bytes();
        buf.push(url_bytes.len() as u8);
        buf.extend_from_slice(url_bytes);
        buf.push(entry.proofs.len() as u8);

        for proof in &entry.proofs {
            // amount (varint)
            write_varint(&mut buf, proof.amount);
            // keyset id (variable length: 1 byte length + bytes)
            let id_bytes = hex::decode(&proof.id).map_err(|_| EncodeError::InvalidHex)?;
            buf.push(id_bytes.len() as u8);
            buf.extend_from_slice(&id_bytes);
            // derivation index (varint)
            write_varint(&mut buf, proof.derivation_index);
            // secp256k1 points (33 bytes each)
            buf.extend_from_slice(&hex_to_bytes33(&proof.c)?);
            buf.extend_from_slice(&hex_to_bytes33(proof.c_prime.as_deref().unwrap_or(&"00".repeat(33)))?);
            buf.extend_from_slice(&hex_to_bytes33(proof.b_prime.as_deref().unwrap_or(&"00".repeat(33)))?);
            buf.extend_from_slice(&hex_to_bytes33(proof.y.as_deref().unwrap_or(&"00".repeat(33)))?);
            // DLEQ scalars (32 bytes each)
            if let Some(dleq) = &proof.dleq {
                buf.extend_from_slice(&hex_to_bytes32(&dleq.e)?);
                buf.extend_from_slice(&hex_to_bytes32(&dleq.s)?);
            } else {
                buf.extend_from_slice(&[0u8; 32]);
                buf.extend_from_slice(&[0u8; 32]);
            }
        }
    }

    Ok(buf)
}

// ─── Decode ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum DecodeError {
    TooShort,
    BadMagic,
    UnsupportedVersion(u8),
    InvalidUtf8,
    TrailingData,
    VarintTooLarge,
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::TooShort => write!(f, "binary payload too short"),
            DecodeError::BadMagic => write!(f, "not a valid ecash binary (wrong magic bytes)"),
            DecodeError::UnsupportedVersion(v) => write!(f, "unsupported binary version 0x{:02x}", v),
            DecodeError::InvalidUtf8 => write!(f, "mint URL is not valid UTF-8"),
            DecodeError::TrailingData => write!(f, "unexpected trailing data in binary payload"),
            DecodeError::VarintTooLarge => write!(f, "varint is too large"),
        }
    }
}

impl std::error::Error for DecodeError {}

pub struct DecodedPublicData {
    pub data: PublicNoteData,
    pub face_value_sats: u64,
    pub block_height: u64,
}

fn decode_public_internal<'a>(r: &mut Reader<'a>) -> Result<DecodedPublicData, DecodeError> {
    // Header
    let magic = r.read(2)?;
    if magic != MAGIC {
        return Err(DecodeError::BadMagic);
    }
    let version = r.read(1)?[0];
    if version != 0x02 && version != 0x03 {
        return Err(DecodeError::UnsupportedVersion(version));
    }
    let face_bytes: [u8; 4] = r.read(4)?.try_into().map_err(|_| DecodeError::TooShort)?;
    let face_value_sats = u32::from_le_bytes(face_bytes) as u64;
    let block_bytes: [u8; 4] = r.read(4)?.try_into().map_err(|_| DecodeError::TooShort)?;
    let block_height = u32::from_le_bytes(block_bytes) as u64;
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
            let amount = r.read_varint()?;
            let id = if version >= 0x03 {
                let id_len = r.read(1)?[0] as usize;
                hex::encode(r.read(id_len)?)
            } else {
                hex::encode(r.read(8)?)
            };
            let derivation_index = r.read_varint()?;

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

    Ok(DecodedPublicData {
        data: PublicNoteData {
            entries,
            validation_hash,
            face_value_sats,
        },
        face_value_sats,
        block_height,
    })
}

pub fn decode_public_data(bytes: &[u8]) -> Result<DecodedPublicData, DecodeError> {
    let mut r = Reader::new(bytes);
    let res = decode_public_internal(&mut r)?;
    if !r.is_empty() {
        return Err(DecodeError::TrailingData);
    }
    Ok(res)
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

    fn read_varint(&mut self) -> Result<u64, DecodeError> {
        let mut result = 0u64;
        let mut shift = 0;
        loop {
            if self.is_empty() {
                return Err(DecodeError::TooShort);
            }
            let byte = self.data[self.pos];
            self.pos += 1;
            result |= ((byte & 0x7F) as u64) << shift;
            if byte & 0x80 == 0 {
                break;
            }
            shift += 7;
            if shift >= 64 {
                return Err(DecodeError::VarintTooLarge);
            }
        }
        Ok(result)
    }

    fn is_empty(&self) -> bool {
        self.pos >= self.data.len()
    }
}

fn write_varint(buf: &mut Vec<u8>, mut v: u64) {
    loop {
        let mut byte = (v & 0x7F) as u8;
        v >>= 7;
        if v != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if v == 0 {
            break;
        }
    }
}

fn hex_to_bytes32(s: &str) -> Result<[u8; 32], EncodeError> {
    let v = hex::decode(s).map_err(|_| EncodeError::InvalidHex)?;
    v.try_into().map_err(|_| EncodeError::InvalidLength)
}

fn hex_to_bytes33(s: &str) -> Result<[u8; 33], EncodeError> {
    let v = hex::decode(s).map_err(|_| EncodeError::InvalidHex)?;
    v.try_into().map_err(|_| EncodeError::InvalidLength)
}



// ─── Full Note Codec ─────────────────────────────────────────────────────────

use crate::types::{PhysicalNote, PrivateNoteData};

pub fn encode_full_note(note: &PhysicalNote) -> Result<Vec<u8>, EncodeError> {
    let mut buf = encode_public_data(&note.public_data, note.amount_sats, note.block_height)?;
    buf.push(note.serial.len() as u8);
    buf.extend_from_slice(note.serial.as_bytes());
    buf.extend_from_slice(&hex_to_bytes32(&note.private_data.master_seed_hex)?);
    
    // Encode fee_strategy string
    buf.push(note.fee_strategy.len() as u8);
    buf.extend_from_slice(note.fee_strategy.as_bytes());
    Ok(buf)
}

pub fn decode_full_note(bytes: &[u8]) -> Result<PhysicalNote, DecodeError> {
    let mut r = Reader::new(bytes);
    let DecodedPublicData { data, face_value_sats, block_height } = decode_public_internal(&mut r)?;
    
    let serial_len = r.read(1)?[0] as usize;
    let serial = String::from_utf8(r.read(serial_len)?.to_vec()).map_err(|_| DecodeError::InvalidUtf8)?;
    let master_seed_hex = hex::encode(r.read(32)?);

    // Decode fee_strategy string
    let fee_strat_len = r.read(1)?[0] as usize;
    let fee_strategy = String::from_utf8(r.read(fee_strat_len)?.to_vec()).map_err(|_| DecodeError::InvalidUtf8)?;

    if !r.is_empty() {
        return Err(DecodeError::TrailingData);
    }

    Ok(PhysicalNote {
        amount_sats: face_value_sats,
        block_height,
        serial,
        mint_urls: data.entries.iter().map(|e| e.mint.clone()).collect(),
        validation_hash: data.validation_hash.clone(),
        fee_strategy,
        public_data: data,
        private_data: PrivateNoteData { master_seed_hex },
    })
}


