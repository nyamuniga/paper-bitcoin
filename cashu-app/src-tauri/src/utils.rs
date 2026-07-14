use base64::Engine;
use std::io::Read;

pub fn decode_qr_payload(payload: &str) -> anyhow::Result<Vec<u8>> {
    let payload_upper = payload.to_uppercase();
    if payload_upper.starts_with("ECASHZ:") {
        // Some scanners or OCR might mangle the case of the prefix.
        // If it starts with ECASHZ (case-insensitive), try decoding as base45 first.
        let data_part = &payload[7..];
        
        // Base45 decode
        if let Ok(compressed) = base45::decode(data_part) {
            let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
            let mut decompressed = Vec::new();
            if decoder.read_to_end(&mut decompressed).is_ok() {
                return Ok(decompressed);
            }
        }
        
        // If base45 fails, try base64 (eCashZ fallback)
        let compressed = base64::engine::general_purpose::STANDARD.decode(data_part)?;
        let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else {
        // Fallback for older notes or raw base64
        let decoded = base64::engine::general_purpose::STANDARD.decode(payload)?;
        Ok(decoded)
    }
}
