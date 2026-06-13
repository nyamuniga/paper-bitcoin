//! Physical note encoder: `PhysicalNote` → printable SVG.
//!
//! Produces a 600 × 920 px SVG with:
//!  • Front face: amount, mint info, serial, public QR (scan to verify)
//!  • Scratch area: private QR hidden under a tamper-evident sticker
//!
//! Open the generated `.svg` in any browser to view/print at full quality.

use base64::Engine;
use ecash_core::types::PhysicalNote;
use qrcode::render::svg;
use qrcode::QrCode;

/// Generate a printable SVG for `note`.
///
/// The **public QR** encodes a compact binary payload (see `ecash_core::compact`).
/// The **private QR** encodes the JSON private seed (unchanged).
pub fn generate_note_svg(note: &PhysicalNote) -> String {
    let public_bin = bincode::serialize(&note.public_data).unwrap();
    let full_note_bin = bincode::serialize(note).unwrap();

    let pub_qr = qr_bin(&public_bin);
    let priv_qr = qr_bin(&full_note_bin);

    let issued = fmt_ts(note.issued_at);
    let amount_str = fmt_amount(note.amount_sats);
    let hash_short = &note.validation_hash[..16];

    let mint_display = if note.mint_urls.len() > 1 {
        format!("MULTIPLE MINTS ({})", note.mint_urls.len())
    } else if let Some(first) = note.mint_urls.first() {
        truncate(first, 45)
    } else {
        "UNKNOWN".to_string()
    };

    let keyset_display = if note.mint_urls.len() > 1 {
        "MULTIPLE".to_string()
    } else if let Some(entry) = note.public_data.entries.first() {
        if let Some(proof) = entry.proofs.first() {
            proof.id.clone()
        } else {
            "UNKNOWN".to_string()
        }
    } else {
        "UNKNOWN".to_string()
    };

    build_svg(
        &amount_str,
        &mint_display,
        &note.serial,
        &keyset_display,
        &issued,
        hash_short,
        &pub_qr,
        &priv_qr,
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;

fn qr_bin(data: &[u8]) -> String {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data).unwrap();
    let compressed = encoder.finish().unwrap();
    let b64 = base64::engine::general_purpose::STANDARD.encode(compressed);
    let final_data = format!("eCashZ:{}", b64);

    let code = QrCode::with_error_correction_level(final_data.as_bytes(), qrcode::EcLevel::L)
        .unwrap_or_else(|_| QrCode::with_error_correction_level(b"Payload too large.", qrcode::EcLevel::L).unwrap());

    let svg_str = code
        .render::<svg::Color<'_>>()
        .quiet_zone(true)
        .min_dimensions(260, 260)
        .build();
    base64::engine::general_purpose::STANDARD.encode(svg_str.as_bytes())
}

fn qr_b64(data: &str) -> String {
    let code_result = QrCode::with_error_correction_level(data.as_bytes(), qrcode::EcLevel::L);
    
    let code = match code_result {
        Ok(c) => c,
        Err(_) => {
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
            encoder.write_all(data.as_bytes()).unwrap();
            let compressed = encoder.finish().unwrap();
            let b64 = base64::engine::general_purpose::STANDARD.encode(compressed);
            let final_data = format!("eCashZ:{}", b64);
            
            match QrCode::with_error_correction_level(final_data.as_bytes(), qrcode::EcLevel::L) {
                Ok(c) => c,
                Err(_) => QrCode::with_error_correction_level(b"Payload too large. Use JSON.", qrcode::EcLevel::L).unwrap(),
            }
        }
    };

    let svg_str = code
        .render::<svg::Color<'_>>()
        .quiet_zone(true)
        .min_dimensions(260, 260)
        .build();
    base64::engine::general_purpose::STANDARD.encode(svg_str.as_bytes())
}

fn fmt_amount(sats: u64) -> String {
    if sats >= 100_000_000 {
        format!("{:.8} BTC", sats as f64 / 1e8)
    } else if sats >= 1_000 {
        format!("{},{:03} SATS", sats / 1_000, sats % 1_000)
    } else {
        format!("{} SATS", sats)
    }
}

fn fmt_ts(ts: u64) -> String {
    // Approximate calendar date without extra deps
    let days_since_epoch = ts / 86400;
    let year = 1970 + days_since_epoch / 365;
    let doy = days_since_epoch % 365;
    let month = doy / 30 + 1;
    let day = doy % 30 + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}…", &s[..n])
    }
}

// ─── SVG template ────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn build_svg(
    amount: &str,
    mint_url: &str,
    serial: &str,
    keyset_id: &str,
    issued: &str,
    hash_short: &str,
    pub_qr: &str,
    priv_qr: &str,
) -> String {
    format!(
        r##"<?xml version="1.0" encoding="UTF-8"?>
<svg width="920" height="420" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>
    .hd  {{ font: bold 26px 'Georgia', serif; fill:#d97706; letter-spacing: 2px; }}
    .sub {{ font: 12px 'Georgia', serif; fill:#a1a1aa; letter-spacing:1px; }}
    .amt {{ font: bold 54px 'Georgia', serif; fill:#fcd34d; }}
    .lbl {{ font: 10px 'Courier New', monospace; fill:#64748b; letter-spacing:1px; }}
    .val {{ font: bold 14px 'Courier New', monospace; fill:#e2e8f0; }}
    .ser {{ font: bold 22px 'Courier New', monospace; fill:#ef4444; letter-spacing:4px; }}
    .link{{ font: 12px 'Courier New', monospace; fill:#60a5fa; }}
    .wlbl{{ font: bold 14px 'Courier New', monospace; fill:#92400e; }}
    .wsub{{ font: 10px 'Courier New', monospace; fill:#78350f; }}
    .ft  {{ font: 9px 'Courier New', monospace; fill:#475569; }}
    .watermark {{ font: bold 80px 'Georgia', serif; fill:rgba(217, 119, 6, 0.05); letter-spacing: 15px; }}
  </style>
  <pattern id="mp" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke="rgba(217, 119, 6, 0.1)" stroke-width="1"/>
    <circle cx="20" cy="20" r="10" fill="none" stroke="rgba(217, 119, 6, 0.05)" stroke-width="1"/>
  </pattern>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#064e3b" />
    <stop offset="50%" stop-color="#022c22" />
    <stop offset="100%" stop-color="#064e3b" />
  </linearGradient>
</defs>

<!-- Background -->
<rect width="920" height="420" fill="url(#bg)" rx="16"/>
<rect width="920" height="420" fill="url(#mp)" rx="16"/>

<!-- ═══ AFRICAN CONTINENT WATERMARK ═══ -->
<g transform="translate(180, 20) scale(0.9)">
  <path d="M 60 20 C 120 10, 160 30, 200 40 C 230 50, 260 90, 280 120 C 260 160, 220 250, 180 320 C 160 360, 140 380, 120 380 C 100 360, 90 320, 80 260 C 70 240, 120 220, 100 180 C 50 160, 0 140, 10 100 C 20 60, 40 30, 60 20 Z" fill="rgba(217, 119, 6, 0.08)" stroke="rgba(217, 119, 6, 0.15)" stroke-width="3"/>
  <path d="M 240 220 C 250 200, 260 190, 270 210 C 280 230, 270 260, 250 280 C 240 260, 230 240, 240 220 Z" fill="rgba(217, 119, 6, 0.08)" stroke="rgba(217, 119, 6, 0.15)" stroke-width="3"/>
</g>
<text x="325" y="235" text-anchor="middle" class="watermark">AFRICA</text>

<!-- ═══ BANKNOTE BORDER ═══ -->
<rect x="16" y="16" width="628" height="388" fill="none" stroke="#d97706" stroke-width="3" stroke-dasharray="10, 4" rx="8"/>
<rect x="24" y="24" width="612" height="372" fill="none" stroke="#fcd34d" stroke-width="1" rx="4"/>

<!-- ═══ MAIN FRONT (Left side) ═══ -->
<!-- Title & Header -->
<text x="50" y="65" class="hd">RESERVE BANK OF ECASH</text>
<text x="50" y="85" class="sub">BEARER VOUCHER · REDEEMABLE FOR BITCOIN</text>
<circle cx="590" cy="55" r="22" fill="#f59e0b"/>
<text x="590" y="62" text-anchor="middle" font-size="22" fill="#0f172a" font-family="monospace" font-weight="bold">₿</text>

<!-- Amount Display -->
<text x="50" y="160" class="amt">{amount}</text>
<text x="50" y="180" class="sub">POWERED BY THE LIGHTNING NETWORK</text>

<!-- Info Grid -->
<rect x="40" y="220" width="350" height="150" fill="rgba(15, 23, 42, 0.6)" rx="8" stroke="#334155" stroke-width="1"/>
<text x="56" y="245" class="lbl">SERIAL NUMBER</text>
<text x="56" y="265" class="ser">{serial}</text>

<text x="56" y="295" class="lbl">ISSUED DATE</text>
<text x="56" y="310" class="val">{issued}</text>
<text x="210" y="295" class="lbl">KEYSET ID</text>
<text x="210" y="310" class="val">{keyset_id}</text>

<text x="56" y="335" class="lbl">MINT ENDPOINT</text>
<text x="56" y="350" class="link">{mint_url}</text>

<!-- Public QR Code -->
<rect x="420" y="120" width="190" height="190" fill="white" rx="6" stroke="#d97706" stroke-width="2"/>
<image href="data:image/svg+xml;base64,{pub_qr}" x="425" y="125" width="180" height="180"/>
<text x="515" y="330" text-anchor="middle" class="lbl">SCAN TO VERIFY</text>
<text x="515" y="345" text-anchor="middle" font-size="10" fill="#a1a1aa" font-family="monospace">HASH: {hash_short}…</text>

<!-- ═══ PERFORATION SEPARATOR ═══ -->
<line x1="660" y1="0" x2="660" y2="420" stroke="#334155" stroke-width="2" stroke-dasharray="10,8"/>
<!-- Scissors icon -->
<text x="652" y="20" font-size="16" fill="#64748b">✂</text>
<text x="652" y="415" font-size="16" fill="#64748b">✂</text>

<!-- ═══ SCRATCH AREA (Right side) ═══ -->
<rect x="676" y="16" width="228" height="388" fill="#fffbeb" rx="8" stroke="#d97706" stroke-width="2" stroke-dasharray="5,4"/>

<!-- Warning Header -->
<rect x="676" y="16" width="228" height="44" fill="#d97706" rx="8"/>
<rect x="676" y="44" width="228" height="16" fill="#d97706"/>
<text x="790" y="40" text-anchor="middle" class="wlbl">⚠ SECRETS BELOW ⚠</text>

<!-- Instructions -->
<text x="790" y="80" text-anchor="middle" class="wsub">SCRATCH TO REVEAL</text>
<text x="790" y="95" text-anchor="middle" class="wsub">REDEMPTION KEY</text>

<!-- Private QR -->
<rect x="700" y="120" width="180" height="180" fill="white" rx="6" stroke="#d97706" stroke-width="1"/>
<image href="data:image/svg+xml;base64,{priv_qr}" x="705" y="125" width="170" height="170"/>

<text x="790" y="330" text-anchor="middle" font-size="9" font-family="monospace" fill="#92400e">DO NOT SHARE THIS CODE.</text>
<text x="790" y="345" text-anchor="middle" font-size="9" font-family="monospace" fill="#92400e">IT CONTROLS THE FUNDS.</text>

<!-- Footer -->
<text x="460" y="405" text-anchor="middle" class="ft">Physical Ecash Prototype · github.com/cashubtc/nuts · Not Legal Tender</text>
</svg>"##,
        amount = amount,
        mint_url = mint_url,
        serial = serial,
        keyset_id = keyset_id,
        issued = issued,
        hash_short = hash_short,
        pub_qr = pub_qr,
        priv_qr = priv_qr,
    )
}
