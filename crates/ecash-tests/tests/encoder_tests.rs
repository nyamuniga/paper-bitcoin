use ecash_encoder::generate_note_svg;
use ecash_core::types::{PhysicalNote, PublicNoteData, PrivateNoteData};

#[test]
fn test_encoder_generates_svg_without_panic() {
    let note = PhysicalNote {
        amount_sats: 1000,
        mint_urls: vec!["https://mint.example.com".to_string()],
        serial: "TEST-1234".to_string(),
        validation_hash: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234".to_string(),
        block_height: 800000,
        fee_strategy: "dynamic".to_string(),
        public_data: PublicNoteData {
            entries: vec![],
            validation_hash: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234".to_string(),
            face_value_sats: 1000,
        },
        private_data: PrivateNoteData {
            master_seed_hex: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(),
        },
    };

    let svg = generate_note_svg(&note).expect("SVG generation should succeed");
    
    // Check that important elements are in the SVG
    assert!(svg.contains("<svg"));
    assert!(svg.contains("TEST-1234")); // Serial
    assert!(svg.contains("1,000")); // Amount
    assert!(svg.contains("SATOSHIS")); // Unit
    assert!(svg.contains("abcd1234")); // Hash
}
