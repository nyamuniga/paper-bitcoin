use base64::Engine;
use std::io::Read;

const MAX_DECOMPRESSED_QR_BYTES: usize = 256 * 1024;

fn decompress_zlib_bounded(compressed: &[u8]) -> anyhow::Result<Vec<u8>> {
    let decoder = flate2::read::ZlibDecoder::new(compressed);
    let mut limited = decoder.take((MAX_DECOMPRESSED_QR_BYTES + 1) as u64);
    let mut decompressed = Vec::new();
    limited.read_to_end(&mut decompressed)?;
    if decompressed.len() > MAX_DECOMPRESSED_QR_BYTES {
        anyhow::bail!(
            "Decompressed QR payload exceeds {} KiB limit",
            MAX_DECOMPRESSED_QR_BYTES / 1024
        );
    }
    Ok(decompressed)
}

pub fn decode_qr_payload(payload: &str) -> anyhow::Result<Vec<u8>> {
    let payload_upper = payload.to_uppercase();
    if payload_upper.starts_with("ECASHZ:") {
        // Some scanners or OCR might mangle the case of the prefix.
        // If it starts with ECASHZ (case-insensitive), try decoding as base45 first.
        let data_part = &payload[7..];

        // Base45 decode
        if let Ok(compressed) = base45::decode(data_part) {
            if let Ok(decompressed) = decompress_zlib_bounded(&compressed) {
                return Ok(decompressed);
            }
        }

        // If base45 fails, try base64 (eCashZ fallback)
        let compressed = base64::engine::general_purpose::STANDARD.decode(data_part)?;
        decompress_zlib_bounded(&compressed)
    } else {
        // Fallback for older notes or raw base64
        let decoded = base64::engine::general_purpose::STANDARD.decode(payload)?;
        if decoded.len() > MAX_DECOMPRESSED_QR_BYTES {
            anyhow::bail!(
                "Decoded QR payload exceeds {} KiB limit",
                MAX_DECOMPRESSED_QR_BYTES / 1024
            );
        }
        Ok(decoded)
    }
}


