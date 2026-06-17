//! Physical note encoder: `PhysicalNote` → printable SVG.
//!
//! Produces a 1024 × 518 px SVG with:
//!  • Front face: amount, mint info, serial, public QR (scan to verify)
//!  • Scratch area: private QR hidden under a tamper-evident sticker
//!
//! Open the generated `.svg` in any browser to view/print at full quality.

use base64::Engine;
use ecash_core::types::PhysicalNote;
use qrcode::render::svg;
use qrcode::QrCode;

const BLANK_NOTE_JPG: &[u8] = include_bytes!("../assets/blank-note.jpg");

/// Generate a printable SVG for `note`.
///
/// The **public QR** encodes a compact binary payload (see `ecash_core::compact`).
/// The **private QR** encodes the JSON private seed (unchanged).
pub fn generate_note_svg(note: &PhysicalNote) -> String {
    let public_bin = ecash_core::compact::encode_public_data(&note.public_data, note.amount_sats, note.issued_at);
    let full_note_bin = ecash_core::compact::encode_full_note(note);

    let pub_qr = qr_bin(&public_bin);
    let priv_qr = qr_bin(&full_note_bin);

    let bg_b64 = base64::engine::general_purpose::STANDARD.encode(BLANK_NOTE_JPG);

    let issued = fmt_ts(note.issued_at);
    let (amount_num, amount_unit) = fmt_amount(note.amount_sats);
    let full_hash = &note.validation_hash;

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

    let strategy = note.fee_strategy.to_lowercase();
    let amt_color = if strategy == "static" {
        "#793D1B" // RGB(121,61,27) for Static strategy
    } else {
        "#33691E" // Green for Dynamic strategy
    };

    build_svg(
        &bg_b64,
        &amount_num,
        &amount_unit,
        &mint_display,
        &note.serial,
        &keyset_display,
        &issued,
        full_hash,
        &pub_qr,
        &priv_qr,
        amt_color,
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;

fn qr_bin(data: &[u8]) -> String {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data).expect("compression failed");
    let compressed_data = encoder.finish().expect("compression finish failed");

    let b45 = base45::encode(&compressed_data);
    let final_payload = format!("ECASHZ:{}", b45);

    let code = QrCode::with_error_correction_level(final_payload.as_bytes(), qrcode::EcLevel::M)
        .unwrap_or_else(|_| QrCode::with_error_correction_level(b"Payload too large.", qrcode::EcLevel::L).unwrap());

    let svg_str = code
        .render::<svg::Color<'_>>()
        .quiet_zone(true)
        .min_dimensions(144, 144)
        .build();
    base64::engine::general_purpose::STANDARD.encode(svg_str.as_bytes())
}

fn fmt_amount(sats: u64) -> (String, String) {
    if sats >= 100_000_000 {
        (format!("{:.8}", sats as f64 / 1e8), "BITCOIN".to_string())
    } else if sats >= 1_000 {
        (format!("{},{:03}", sats / 1_000, sats % 1_000), "SATOSHIS".to_string())
    } else {
        (format!("{}", sats), "SATOSHIS".to_string())
    }
}

fn fmt_ts(ts: u64) -> String {
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

fn build_svg(
    bg_b64: &str,
    amount_num: &str,
    amount_unit: &str,
    mint_url: &str,
    serial: &str,
    keyset_id: &str,
    issued: &str,
    full_hash: &str,
    pub_qr: &str,
    priv_qr: &str,
    amt_color: &str,
) -> String {
    format!(
        r##"<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1024 518" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>
    .hd  {{ font: bold 32px 'Georgia', serif; fill:#3E2723; }}
    .sub {{ font: 14px 'Georgia', serif; fill:#5D4037; letter-spacing:1px; }}
    .amt-num {{ font: bold 68px 'Georgia', serif; fill:{amt_color}; }}
    .amt-txt {{ font: bold 36px 'Georgia', serif; fill:{amt_color}; letter-spacing:2px; }}
    .lbl {{ font: 12px 'Courier New', monospace; fill:#424242; font-weight:bold; letter-spacing:1px; }}
    .val {{ font: bold 16px 'Courier New', monospace; fill:#212121; }}
    .ser {{ font: bold 22px 'Courier New', monospace; fill:#B71C1C; letter-spacing:4px; }}
    .link{{ font: 14px 'Courier New', monospace; fill:#1565C0; text-decoration:none; }}
    .wlbl{{ font: bold 18px 'Courier New', monospace; fill:#FFECB3; letter-spacing:1px; }}
    .wsub{{ font: bold 10px 'Courier New', monospace; fill:#5D4037; }}
    .warn{{ font: bold 12px 'Courier New', monospace; fill:#B71C1C; }}
  </style>
</defs>

<image href="data:image/jpeg;base64,{bg_b64}" x="0" y="0" width="1024" height="518" />

<!-- Vector Overlays on Background Circles -->
<defs>
  <path id="rightCirclePath" d="M 645 106 A 24 24 0 1 1 645 58 A 24 24 0 1 1 645 106" />
</defs>

<!-- Left Circle: Diamond & RBE -->
<polygon points="118,50 146,82 118,114 88,82" fill="none" stroke="#33691E" stroke-width="1.5"/>
<g transform="translate(118, 82)">
  <!-- E -->
  <text x="14" y="8" font-size="28" font-family="'Times New Roman', Times, serif" font-weight="bold" fill="none" stroke="#33691E" stroke-width="1" text-anchor="middle" transform="scale(0.7, 1.2)">E</text>
  <!-- R -->
  <text x="-14" y="8" font-size="28" font-family="'Times New Roman', Times, serif" font-weight="bold" fill="none" stroke="#33691E" stroke-width="1" text-anchor="middle" transform="scale(0.7, 1.2)">R</text>
  <!-- B -->
  <text x="0" y="12" font-size="38" font-family="'Times New Roman', Times, serif" font-weight="bold" fill="none" stroke="#33691E" stroke-width="1.5" text-anchor="middle" transform="scale(0.75, 1.2)">B</text>
</g>

<!-- Right Circle: B icon & Curved Text -->
<g transform="translate(627, 43) scale(2)">
  <path fill="#3E2723" d="M28.4,15.7c-0.2-1.3-1-2.1-2.7-2.6v-3.2h-2.5v3.1c-0.6-0.1-1.3-0.3-2-0.5v-3h-2.5v3.1 c-0.6-0.1-1.1-0.3-1.6-0.4l0-0.1h-3.4l0.7,2.8c0.4,0.1,0.7,0.2,1,0.3c0.3,0.1,0.5,0.4,0.4,0.8l-1.3,5.4c-0.1,0.1-0.2,0.1-0.4,0.1 c-0.3-0.1-0.6-0.2-1-0.3l-0.7,2.8h3.3c0.6,0.2,1.2,0.3,1.8,0.5v3.1h2.5v-3.2c0.7,0.2,1.3,0.3,2,0.5v3.1h2.5v-3.3 c2.3-0.5,3.9-1.4,4.2-3.7c0.2-1.8-0.5-2.8-1.7-3.4C28,20,28.6,18.8,28.4,15.7z M25.1,22.8c-0.3,2-2.4,1.4-3.1,1.2v-4.8 C22.7,19.3,25.4,19.9,25.1,22.8z M24.6,16c-0.3,1.8-2.1,1.3-2.6,1.1v-4.2C22.6,13,25,13.6,24.6,16z"/>
</g>
<g transform="translate(27, 0)">
  <text font-size="7" font-weight="bold" fill="#3E2723" font-family="'Courier New', monospace" letter-spacing="1">
    <textPath href="#rightCirclePath" startOffset="50%" text-anchor="middle">DECENTRALIZED &#183; SOUND &#183; MONEY</textPath>
  </text>
</g>

<!-- Title & Header -->
<text x="175" y="85" class="hd">RESERVE BANK OF ECASH</text>
<text x="175" y="105" class="sub">BEARER TOKEN &#183; REDEEMABLE FOR BITCOIN</text>

<!-- Amount Display -->
<text x="95" y="195" class="amt-num">{amount_num}</text>
<text x="95" y="240" class="amt-txt">{amount_unit}</text>

<!-- Info Grid -->
<text x="100" y="290" class="lbl">SERIAL NUMBER</text>
<text x="100" y="310" class="ser">{serial}</text>

<text x="100" y="340" class="lbl">ISSUED DATE</text>
<text x="100" y="355" class="val">{issued}</text>

<text x="215" y="340" class="lbl">KEYSET ID</text>
<text x="215" y="355" class="val">{keyset_id}</text>

<text x="100" y="385" class="lbl">MINT ENDPOINT</text>
<text x="100" y="400" class="link">{mint_url}</text>

<!-- Public QR Code -->
<image href="data:image/svg+xml;base64,{pub_qr}" x="483" y="200" width="144" height="144"/>
<text x="555" y="375" text-anchor="middle" class="lbl">SCAN TO VERIFY</text>

<!-- Vertical Hash -->
<text x="695" y="555" class="lbl" font-size="7" fill="#5D4037" transform="rotate(-90 695 535)">HASH: {full_hash}</text>

<!-- Right Stub (x > 750) -->
<!-- Red Box for SECRETS BELOW -->
<g transform="translate(785, 56)">
  <path d="M 0 12 L 7 -2 L 14 12 Z" fill="none" stroke="#FFECB3" stroke-width="1.5" />
  <text x="7" y="10" font-size="10" font-family="monospace" font-weight="bold" fill="#FFECB3" text-anchor="middle">!</text>
</g>
<g transform="translate(950, 56)">
  <path d="M 0 12 L 7 -2 L 14 12 Z" fill="none" stroke="#FFECB3" stroke-width="1.5" />
  <text x="7" y="10" font-size="10" font-family="monospace" font-weight="bold" fill="#FFECB3" text-anchor="middle">!</text>
</g>
<text x="875" y="67" text-anchor="middle" class="wlbl">SECRETS BELOW</text>

<text x="875" y="85" text-anchor="middle" class="wsub">SCRATCH TO REVEAL</text>
<text x="875" y="95" text-anchor="middle" class="wsub">REDEMPTION KEY</text>

<!-- Private QR Code -->
<image href="data:image/svg+xml;base64,{priv_qr}" x="810" y="200" width="144" height="144"/>

<text x="880" y="375" text-anchor="middle" class="warn">DO NOT SHARE THIS CODE.</text>
<text x="880" y="390" text-anchor="middle" class="warn">IT CONTROLS THE FUNDS.</text>

</svg>"##,
        bg_b64 = bg_b64,
        amount_num = amount_num,
        amount_unit = amount_unit,
        mint_url = mint_url,
        serial = serial,
        keyset_id = keyset_id,
        issued = issued,
        full_hash = full_hash,
        pub_qr = pub_qr,
        priv_qr = priv_qr,
        amt_color = amt_color,
    )
}
