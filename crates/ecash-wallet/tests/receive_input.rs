use ecash_wallet::decode_token_string;
use ecash_wallet::{
    client::KeysetSummary,
    receive_input::{decode_receive_token, prepare_receive_input, validate_receive_constraints},
};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Fixture {
    name: String,
    token: String,
    expected: Option<Value>,
    error: Option<String>,
    error_prefix: Option<String>,
}

fn fixtures() -> Vec<Fixture> {
    serde_json::from_str(include_str!("fixtures/receive_inputs.json")).unwrap()
}

const MINT: &str = "https://synthetic-mint.invalid/Bitcoin";

fn fixture(name: &str) -> Fixture {
    fixtures()
        .into_iter()
        .find(|fixture| fixture.name == name)
        .unwrap()
}

fn keyset(id: &str, fee: u64) -> KeysetSummary {
    KeysetSummary {
        id: id.into(),
        unit: "sat".into(),
        active: true,
        input_fee_ppk: fee,
    }
}

#[test]
fn receive_decoder_preserves_fixtures_and_the_parse_error_prefix() {
    for fixture in fixtures() {
        let decoded = decode_receive_token(&fixture.token);
        if let Some(expected) = fixture.expected {
            let decoded = decoded.unwrap();
            assert_eq!(
                json!({"mint_url": decoded.mint_url, "input_proofs": decoded.input_proofs, "total_amount": decoded.total_amount}),
                expected,
                "{}",
                fixture.name
            );
        } else {
            let original = decode_token_string(&fixture.token).unwrap_err();
            assert_eq!(
                decoded.unwrap_err().to_string(),
                format!("Failed to parse token: {original}"),
                "{}",
                fixture.name
            );
        }
    }
}

#[test]
fn invoice_constraints_require_all_three_fields_or_none() {
    let token = fixture("v3").token;
    for mask in 0..8 {
        let mint = (mask & 1 != 0).then_some(MINT);
        let amount = (mask & 2 != 0).then_some(7);
        let id = (mask & 4 != 0).then_some("synthetic-invoice");
        let result = validate_receive_constraints(&token, mint, amount, id);
        match mask {
            0 => assert_eq!(result.unwrap(), None),
            7 => assert_eq!(result.unwrap(), Some((MINT, 7))),
            _ => assert_eq!(
                result.unwrap_err().to_string(),
                "Incomplete invoice payment constraints"
            ),
        }
    }
}

#[test]
fn invoice_limits_count_bytes_and_do_not_limit_ordinary_receives() {
    let token = fixture("v3").token;
    for (id, valid) in [
        (String::new(), false),
        ("a".repeat(64), true),
        ("a".repeat(65), false),
        ("é".repeat(32), true),
        ("é".repeat(33), false),
    ] {
        let result = validate_receive_constraints(&token, Some(MINT), Some(7), Some(&id));
        assert_eq!(result.is_ok(), valid);
        if !valid {
            assert_eq!(
                result.unwrap_err().to_string(),
                "Incomplete invoice payment constraints"
            );
        }
    }
    let at_limit = format!("{}{}", token, " ".repeat(100000 - token.len()));
    assert!(validate_receive_constraints(&at_limit, Some(MINT), Some(7), Some("invoice")).is_ok());
    let oversized = at_limit + " ";
    assert_eq!(
        validate_receive_constraints(&oversized, Some(MINT), Some(7), Some("invoice"))
            .unwrap_err()
            .to_string(),
        "Invoice payment is too large"
    );
    assert_eq!(
        validate_receive_constraints(&oversized, None, None, None).unwrap(),
        None
    );
    assert_eq!(
        validate_receive_constraints(&oversized, Some(MINT), None, None)
            .unwrap_err()
            .to_string(),
        "Incomplete invoice payment constraints"
    );
}

#[test]
fn invoice_preflight_preserves_mint_amount_and_raw_parse_errors() {
    let token = fixture("v3").token;
    for (mint, amount) in [("https://other-mint.invalid", 7), (MINT, 9), (MINT, 0)] {
        assert_eq!(
            validate_receive_constraints(&token, Some(mint), Some(amount), Some("invoice"))
                .unwrap_err()
                .to_string(),
            "Payment does not cover this invoice at the selected mint"
        );
    }
    assert_eq!(
        validate_receive_constraints("not-a-token", Some(MINT), Some(7), Some("invoice"))
            .unwrap_err()
            .to_string(),
        "Invalid token: must start with cashuA or cashuB"
    );
}

#[test]
fn preparation_resolves_legacy_and_v2_ids_without_changing_credentials() {
    for (name, full_id) in [
        ("legacy_short_keyset", "0000000000000000".to_string()),
        ("v4_short_v2_keyset", format!("01{}", "ab".repeat(32))),
    ] {
        let decoded = decode_receive_token(&fixture(name).token).unwrap();
        let mut expected = serde_json::to_value(&decoded.input_proofs).unwrap();
        expected[0]["id"] = json!(full_id);
        let prepared = prepare_receive_input(decoded, &[keyset(&full_id, 1000)], None).unwrap();
        assert_eq!(prepared.mint_url, MINT);
        assert_eq!(
            serde_json::to_value(prepared.input_proofs).unwrap(),
            expected
        );
        assert_eq!(prepared.fee, 1);
        assert_eq!(prepared.net_amount, 7);
    }
}

#[test]
fn ordinary_resolution_keeps_first_match_and_missing_fee_fallback() {
    let first = format!("01{}{}", "ab".repeat(7), "11".repeat(25));
    let second = format!("01{}{}", "ab".repeat(7), "22".repeat(25));
    let token = fixture("v4_short_v2_keyset").token;
    let prepared = prepare_receive_input(
        decode_receive_token(&token).unwrap(),
        &[keyset(&first, 1000), keyset(&second, 2000)],
        None,
    )
    .unwrap();
    assert_eq!(prepared.input_proofs[0].id, first);
    assert_eq!(prepared.fee, 1);
    let prepared = prepare_receive_input(decode_receive_token(&token).unwrap(), &[], None).unwrap();
    assert_eq!(prepared.input_proofs[0].id, format!("01{}", "ab".repeat(7)));
    assert_eq!(prepared.fee, 0);
    assert_eq!(prepared.net_amount, 8);
}

#[test]
fn invoice_resolution_requires_a_unique_sat_keyset_and_net_coverage() {
    let token = fixture("v4_short_v2_keyset").token;
    let first = format!("01{}{}", "ab".repeat(7), "11".repeat(25));
    let second = format!("01{}{}", "ab".repeat(7), "22".repeat(25));
    let mut non_sat = keyset(&first, 1000);
    non_sat.unit = "usd".into();
    for keysets in [
        Vec::new(),
        vec![non_sat],
        vec![keyset(&first, 1000), keyset(&second, 1000)],
    ] {
        assert_eq!(
            prepare_receive_input(
                decode_receive_token(&token).unwrap(),
                &keysets,
                Some((MINT, 7))
            )
            .unwrap_err()
            .to_string(),
            "Unable to uniquely resolve the payment's mint keyset"
        );
    }
    assert!(prepare_receive_input(
        decode_receive_token(&token).unwrap(),
        &[keyset(&first, 1000)],
        Some((MINT, 7))
    )
    .is_ok());
    assert_eq!(
        prepare_receive_input(
            decode_receive_token(&token).unwrap(),
            &[keyset(&first, 1000)],
            Some((MINT, 8))
        )
        .unwrap_err()
        .to_string(),
        "Payment does not cover this invoice at the selected mint"
    );
}

#[test]
fn receive_fee_rounding_aggregates_all_inputs_before_rounding() {
    for (second_fee, expected_fee) in [(0, 1), (1, 1), (2, 2)] {
        let mut decoded = decode_receive_token(&fixture("v3").token).unwrap();
        let mut second = decoded.input_proofs[0].clone();
        second.id = "1111111111111111".into();
        decoded.input_proofs.push(second);
        decoded.total_amount = 16;
        let prepared = prepare_receive_input(
            decoded,
            &[
                keyset("0000000000000000", 999),
                keyset("1111111111111111", second_fee),
            ],
            None,
        )
        .unwrap();
        assert_eq!(prepared.fee, expected_fee);
        assert_eq!(prepared.net_amount, 16 - expected_fee);
    }
}

#[test]
fn receive_fees_reject_overflow_and_tokens_without_net_value() {
    for fee in [8000, 9000] {
        let error = prepare_receive_input(
            decode_receive_token(&fixture("v3").token).unwrap(),
            &[keyset("0000000000000000", fee)],
            None,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            format!(
                "Token amount (8 sat) cannot cover the mint input fee ({} sat)",
                fee / 1000
            )
        );
    }
    for count in [1, 2] {
        let mut decoded = decode_receive_token(&fixture("v3").token).unwrap();
        if count == 2 {
            decoded.input_proofs.push(decoded.input_proofs[0].clone());
            decoded.total_amount = 16;
        }
        assert_eq!(
            prepare_receive_input(decoded, &[keyset("0000000000000000", u64::MAX)], None)
                .unwrap_err()
                .to_string(),
            "Mint fee overflow"
        );
    }
}

#[test]
fn original_decoder_matches_valid_receive_fixtures() {
    for fixture in fixtures()
        .into_iter()
        .filter(|fixture| fixture.expected.is_some())
    {
        let (mint_url, input_proofs, total_amount) = decode_token_string(&fixture.token).unwrap();
        assert_eq!(
            json!({"mint_url": mint_url, "input_proofs": input_proofs, "total_amount": total_amount}),
            fixture.expected.unwrap(),
            "{}",
            fixture.name
        );
    }
}

#[test]
fn original_decoder_matches_malformed_receive_fixtures() {
    for fixture in fixtures()
        .into_iter()
        .filter(|fixture| fixture.expected.is_none())
    {
        let error = decode_token_string(&fixture.token).unwrap_err().to_string();
        if let Some(expected) = fixture.error {
            assert_eq!(error, expected, "{}", fixture.name);
        } else {
            assert!(
                error.starts_with(fixture.error_prefix.as_ref().unwrap()),
                "{}: {}",
                fixture.name,
                error
            );
        }
    }
}
