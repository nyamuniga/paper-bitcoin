use base64::Engine;
use std::io::Read;

pub fn decode_qr_payload(payload: &str) -> anyhow::Result<Vec<u8>> {
    if let Some(b45) = payload.strip_prefix("ECASHZ:") {
        let compressed = base45::decode(b45).map_err(|_| anyhow::anyhow!("Invalid base45 payload"))?;
        let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else if let Some(b64) = payload.strip_prefix("eCashZ:") {
        let compressed = base64::engine::general_purpose::STANDARD.decode(b64)?;
        let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else {
        // Fallback for older notes
        let decoded = base64::engine::general_purpose::STANDARD.decode(payload)?;
        Ok(decoded)
    }
}
