use ecash_core::types::*;
use ecash_encoder::generate_note_svg;
use std::collections::HashMap;

fn main() {
    let note = PhysicalNote {
        serial: "abcdef1234567890".to_string(),
        amount_sats: 100,
        issued_at: 1234567890,
        validation_hash: "hash0000hash0000hash0000hash0000".to_string(),
        mint_urls: vec!["https://mint.minibits.cash/Bitcoin".to_string()],
        fee_strategy: "dynamic".to_string(),
        public_data: PublicNoteData {
            entries: vec![],
            face_value_sats: 100,
            validation_hash: "hash0000hash0000hash0000hash0000".to_string(),
        },
        private_data: PrivateNoteData {
            master_seed_hex: "seed0000".to_string(),
        },
    };

    println!("Generating SVG...");
    let svg = generate_note_svg(&note);
    println!("SVG generated successfully! Length: {}", svg.len());
}
