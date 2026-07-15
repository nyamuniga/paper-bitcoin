// src/bin/gen_note.rs
use ecash_core::types::*;
use ecash_encoder::generate_note_svg;
use std::fs;

const DUMMY_JSON: &str = r#"{
    "amount_sats": 10,
    "mint_urls": ["https://mint.28waves.com"],
    "serial": "1BE2-D916-DB60",
    "validation_hash": "1be2d916db60bdd0501d64d206fa91997d5696bac96c13394b65baed99ebe13a",
    "block_height": 955153,
    "fee_strategy": "dynamic",
    "public_data": {
        "entries": [{
            "mint": "https://mint.28waves.com",
            "proofs": [
                {
                    "amount": 4,
                    "id": "00165586c61bb726",
                    "C": "03ce74e21e141a36eb7a49df47551646ba1331bf4d8f3ccccc7beb28668814274d",
                    "C_": "03c1e58db7526880728d423d4b95407c6cabe7e88f1cda82f137107e5481f695c6",
                    "B_": "0362a0fe612576f4460053aa16656b74c850e8a0dbcd060c0f2b807e4da47771c6",
                    "dleq": {
                        "e": "0379be8c4a2fd08337f0ee76c77db442c57c3c8826f1f5c6e3167257c6b037bc",
                        "s": "9bec444c41a35681bb357fa5c69a8b9f982285b65ccbf0aa017c81be7917a856"
                    },
                    "y": "02026c40497f6378387ecbb562b3a367a37c89044d5e883d0a09919d7a9781586e",
                    "derivation_index": 0
                },
                {
                    "amount": 16,
                    "id": "00165586c61bb726",
                    "C": "026134e4e1bceb1db25c2c5123c217c126a745e456b6c634e7c42ad1e3410f30b0",
                    "C_": "03f08e687b72f2edda79967a25d7ab086d6921d8aaebbccd4f373b0251cf0963c3",
                    "B_": "02bcd17c6a5895cdfc85162f6e4b586038aa0eb6fa79067aecb018d31c5c5fd7c5",
                    "dleq": {
                        "e": "6445154f42607065f88aeba040909b6eb2947f2452ddce228b09a523a4a923bc",
                        "s": "eaa1ef7e338b9841faaf1992fd6624a083e91f467368177251f7c162d484bbbe"
                    },
                    "y": "029683f50e3b96a73e418abb50a08f81a5055402185c12a6394a84ebd6bbb32d2b",
                    "derivation_index": 1
                }
            ]
        }],
        "validation_hash": "1be2d916db60bdd0501d64d206fa91997d5696bac96c13394b65baed99ebe13a",
        "face_value_sats": 10
    },
    "private_data": {
        "master_seed_hex": "d414f022f0369f1b82f52fc60422afe91a47e2004cc292c68e3aa0cfdc5d8b2d"
    }
}"#;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use embedded JSON by default, or accept a file path as first argument
    let json = if let Some(path) = std::env::args().nth(1) {
        fs::read_to_string(path)?
    } else {
        DUMMY_JSON.to_string()
    };

    let note: PhysicalNote = serde_json::from_str(&json)?;

    let svg = generate_note_svg(&note)?;

    fs::write("note.svg", svg)?;

    println!("✅ SVG generated: note.svg");
    println!("Open it in your browser, then print to PDF (or use rsvg-convert).");
    Ok(())
}