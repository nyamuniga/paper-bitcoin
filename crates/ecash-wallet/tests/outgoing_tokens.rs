use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ciborium::Value;
use ecash_core::types::Proof;
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    name: String,
    mint_url: String,
    proofs: Vec<Proof>,
    token_v3: String,
    token_v4: String,
}

fn fixtures() -> Vec<Fixture> {
    serde_json::from_str(include_str!("fixtures/outgoing_tokens.json")).unwrap()
}

fn keyset_id(entry: &Value) -> &[u8] {
    let Value::Map(fields) = entry else {
        panic!("expected a keyset map");
    };
    fields
        .iter()
        .find_map(|(key, value)| match (key, value) {
            (Value::Text(key), Value::Bytes(id)) if key == "i" => Some(id.as_slice()),
            _ => None,
        })
        .expect("expected keyset ID")
}

fn normalized_v4(token: &str) -> Value {
    let bytes = URL_SAFE_NO_PAD
        .decode(token.strip_prefix("cashuB").unwrap())
        .unwrap();
    let mut value: Value = ciborium::from_reader(bytes.as_slice()).unwrap();
    let Value::Map(fields) = &mut value else {
        panic!("expected a token map");
    };
    for (key, value) in fields {
        if key == &Value::Text("t".into()) {
            let Value::Array(entries) = value else {
                panic!("expected keyset entries");
            };
            // Existing V4 encoding iterates a HashMap: only keyset order varies.
            entries.sort_by(|left, right| keyset_id(left).cmp(keyset_id(right)));
        }
    }
    value
}

fn assert_payloads(fixture: &Fixture, v3: &str, v4: &str) {
    assert_eq!(v3, fixture.token_v3, "{} V3 bytes", fixture.name);
    assert_eq!(
        normalized_v4(v4),
        normalized_v4(&fixture.token_v4),
        "{} V4 payload",
        fixture.name
    );
    if fixture.name != "multiple_keysets" {
        assert_eq!(v4, fixture.token_v4, "{} V4 bytes", fixture.name);
    }
}

#[test]
fn existing_encoders_match_frozen_outgoing_fixtures() {
    for fixture in fixtures() {
        let v3 =
            ecash_wallet::encode_token_v3(&fixture.mint_url, &fixture.proofs, Some("sat")).unwrap();
        let v4 =
            ecash_wallet::encode_token_v4(&fixture.mint_url, &fixture.proofs, Some("sat")).unwrap();
        assert_payloads(&fixture, &v3, &v4);
    }
}

#[test]
fn outgoing_builder_preserves_payloads_and_input_credentials() {
    for fixture in fixtures() {
        let before = serde_json::to_value(&fixture.proofs).unwrap();
        let tokens =
            ecash_wallet::outgoing::encode_outgoing_tokens(&fixture.mint_url, &fixture.proofs)
                .unwrap();

        assert_payloads(&fixture, &tokens.token_v3, &tokens.token_v4);
        assert_eq!(serde_json::to_value(&fixture.proofs).unwrap(), before);
    }
}

#[test]
fn outgoing_result_preserves_primary_v3_transaction_id_and_json_shape() {
    let fixture = fixtures().remove(0);
    let tokens =
        ecash_wallet::outgoing::encode_outgoing_tokens(&fixture.mint_url, &fixture.proofs).unwrap();
    let result = tokens.into_send_result("tx_send_synthetic-recovery-id".into());

    assert_eq!(
        serde_json::to_value(result).unwrap(),
        serde_json::json!({
            "token": fixture.token_v3,
            "token_v3": fixture.token_v3,
            "token_v4": fixture.token_v4,
            "tx_id": "tx_send_synthetic-recovery-id",
        })
    );
}
