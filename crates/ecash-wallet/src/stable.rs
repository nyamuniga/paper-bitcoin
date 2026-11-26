//! Durable conversion journal, encrypted with the Cashu wallet.
use serde::{Deserialize, Serialize};

/// Persisted journal and native-command values. Preserve their camelCase spelling.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StableStage {
    Quoted,
    Funding,
    Funded,
    Converting,
    Settling,
    ReturnQuoted,
    Returning,
    Complete,
    Cancelled,
    Refunded,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StableOperation {
    pub id: String,
    pub direction: String,
    pub stage: StableStage,
    pub mint_url: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub output_amount: String,
    pub max_debit: String,
    /// 0: legacy live review; 300: immutable minimum receive / maximum spend.
    #[serde(default)]
    pub protection_bps: u16,
    pub funding_invoice: String,
    pub funding_sats: u64,
    pub mint_quote_id: String,
    pub quote_json: String,
    pub payment_id: Option<String>,
    /// 0: legacy AMM call with an unsupported idempotency key; 1: key omitted.
    #[serde(default)]
    pub conversion_request_version: u8,
    pub prior_payment_ids: Vec<String>,
    #[serde(default)]
    pub return_quote_id: String,
    #[serde(default)]
    pub return_quote_json: String,
    #[serde(default)]
    pub return_amount: u64,
}
impl StableOperation {
    /// Only unconfirmed reviews may replace pricing. Preserve the original debit
    /// ceiling and recovery identity, and reject stale refreshes after confirmation.
    pub fn refresh_review(
        &mut self,
        candidate: &Self,
        expected_quote: &str,
        expected_expiry: u64,
    ) -> bool {
        if self.protection_bps != 0
            || candidate.protection_bps != 0
            || self.stage != StableStage::Quoted
            || candidate.stage != StableStage::Quoted
            || self.quote_json != expected_quote
            || self.expires_at != expected_expiry
            || self.id != candidate.id
            || self.direction != candidate.direction
            || self.mint_url != candidate.mint_url
            || candidate
                .max_debit
                .parse::<u64>()
                .ok()
                .zip(self.max_debit.parse::<u64>().ok())
                .is_none_or(|(next, cap)| next > cap || next == 0)
            || candidate
                .output_amount
                .parse::<u64>()
                .ok()
                .is_none_or(|amount| amount == 0)
        {
            return false;
        }
        self.expires_at = candidate.expires_at;
        self.output_amount = candidate.output_amount.clone();
        self.funding_invoice = candidate.funding_invoice.clone();
        self.funding_sats = candidate.funding_sats;
        self.mint_quote_id = candidate.mint_quote_id.clone();
        self.quote_json = candidate.quote_json.clone();
        true
    }
    /// Caller must hold live proof that the SDK observer rejected before any
    /// source payment approval. Never use this for a timeout or after a restart.
    pub fn recover_unsubmitted_protected(&mut self) -> bool {
        if self.protection_bps != 300
            || self.stage != StableStage::Converting
            || self.conversion_request_version != 1
            || self.payment_id.is_some()
            || !matches!(self.direction.as_str(), "toUsd" | "toSats")
        {
            return false;
        }
        self.stage = if self.direction == "toUsd" {
            StableStage::Funded
        } else {
            StableStage::Quoted
        };
        true
    }
    pub fn active(&self) -> bool {
        !matches!(
            self.stage,
            StableStage::Complete | StableStage::Cancelled | StableStage::Refunded
        )
    }
    /// The original client always supplied a key on AMM sends. The SDK rejects that
    /// combination before dispatching any conversion. Never apply this reset to
    /// a compatible request or a request with a recorded payment result.
    pub fn recover_legacy_idempotency_rejection(&mut self) -> bool {
        if self.stage != StableStage::Converting
            || self.conversion_request_version != 0
            || self.payment_id.is_some()
        {
            return false;
        }
        let expected_type = match self.direction.as_str() {
            "toUsd" => "fromBitcoin",
            "toSats" => "toBitcoin",
            _ => return false,
        };
        let Ok(quote) = serde_json::from_str::<serde_json::Value>(&self.quote_json) else {
            return false;
        };
        if quote
            .pointer("/conversionEstimate/options/conversionType/type")
            .and_then(|v| v.as_str())
            != Some(expected_type)
        {
            return false;
        }
        self.stage = if self.direction == "toUsd" {
            StableStage::Funded
        } else {
            StableStage::Quoted
        };
        self.conversion_request_version = 1;
        true
    }
    pub fn can_transition(&self, next: StableStage) -> bool {
        use StableStage::*;

        matches!(
            (self.stage, next),
            (Quoted, Cancelled)
                | (Quoted, Converting)
                | (Funded, Converting)
                | (Converting, Settling)
                | (Converting, Refunded)
                | (Converting, Complete)
                | (Settling, Complete)
                | (Funded, ReturnQuoted)
                | (ReturnQuoted, Funded)
                | (ReturnQuoted, Returning)
                | (Returning, Complete)
        )
    }
}

/// Estimate the Cashu funding debit matching `pay_invoice_capped`'s ascending coin
/// selection and active-keyset power-of-2 melt proof count, instead of taxing all
/// proofs in the wallet and 64 proofs at the highest historical keyset fee.
pub fn estimate_funding_debit(
    base_melt_needed: u64,
    proofs: &[ecash_core::types::Proof],
    keysets: &[crate::client::KeysetSummary],
) -> Option<u64> {
    let active_ppk = keysets
        .iter()
        .filter(|ks| ks.active && ks.unit == "sat")
        .map(|ks| ks.input_fee_ppk)
        .max()
        .unwrap_or_else(|| {
            keysets
                .iter()
                .filter(|ks| ks.active)
                .map(|ks| ks.input_fee_ppk)
                .max()
                .unwrap_or_else(|| keysets.iter().map(|ks| ks.input_fee_ppk).max().unwrap_or(0))
        });

    let mut total_melt_needed = base_melt_needed;
    if active_ppk > 0 {
        for _ in 0..3 {
            let denoms = ecash_core::types::split_into_powers_of_2(total_melt_needed);
            let fee_ppk_sum = (denoms.len() as u64).checked_mul(active_ppk)?;
            let melt_input_fee = fee_ppk_sum.checked_add(999)? / 1000;
            total_melt_needed = base_melt_needed.checked_add(melt_input_fee)?;
        }
    }

    let mut sorted_proofs: Vec<&ecash_core::types::Proof> = proofs.iter().collect();
    sorted_proofs.sort_by_key(|p| p.amount);

    let mut selected = Vec::new();
    let mut selected_total: u64 = 0;
    for p in sorted_proofs {
        selected.push(p.clone());
        selected_total = selected_total.checked_add(p.amount)?;
        let swap_fee = crate::client::calculate_input_fee(&selected, keysets);
        let needed = total_melt_needed.checked_add(swap_fee)?;
        if selected_total >= needed {
            return Some(needed);
        }
    }

    let swap_fee = crate::client::calculate_input_fee(&selected, keysets);
    total_melt_needed.checked_add(swap_fee)
}

#[cfg(test)]
mod tests {
    use super::*;
    use StableStage::*;

    // Synthetic journal data with no funded proofs, private keys or live invoices.
    fn saved_operation() -> serde_json::Value {
        serde_json::from_str(include_str!("../tests/fixtures/stable-operation.json")).unwrap()
    }

    #[test]
    fn saved_conversion_stages_keep_their_existing_json_values() {
        for (stage, expected_stage) in [
            ("quoted", Quoted),
            ("funding", Funding),
            ("funded", Funded),
            ("converting", Converting),
            ("settling", Settling),
            ("returnQuoted", ReturnQuoted),
            ("returning", Returning),
            ("complete", Complete),
            ("cancelled", Cancelled),
            ("refunded", Refunded),
        ] {
            let mut saved = saved_operation();
            saved["stage"] = serde_json::json!(stage);
            let operation: StableOperation = serde_json::from_value(saved.clone()).unwrap();
            assert_eq!(operation.stage, expected_stage);
            assert_eq!(serde_json::to_value(operation).unwrap(), saved);

            let wallet: crate::WalletState = serde_json::from_value(serde_json::json!({
                "seed_hex": "00", "mnemonic": null, "derivation_index": 0,
                "proofs": {}, "stable_operations": [saved],
            }))
            .unwrap();
            assert_eq!(wallet.stable_operations.len(), 1);
            assert_eq!(wallet.stable_operations[0].stage, expected_stage);
            assert_eq!(
                serde_json::to_value(&wallet.stable_operations[0]).unwrap()["stage"],
                stage
            );
        }
    }

    #[test]
    fn invalid_conversion_stages_are_rejected_in_operations_and_wallets() {
        for stage in [
            serde_json::json!(""),
            serde_json::json!("unknown"),
            serde_json::json!("Quoted"),
            serde_json::json!("return_quoted"),
            serde_json::json!("returnquoted"),
            serde_json::json!("completed"),
            serde_json::Value::Null,
            serde_json::json!(7),
            serde_json::json!({}),
        ] {
            let mut saved = saved_operation();
            saved["stage"] = stage.clone();
            assert!(
                serde_json::from_value::<StableOperation>(saved.clone()).is_err(),
                "accepted invalid operation stage: {stage}"
            );
            assert!(
                serde_json::from_value::<crate::WalletState>(serde_json::json!({
                    "seed_hex": "00", "mnemonic": null, "derivation_index": 0,
                    "proofs": {}, "stable_operations": [saved],
                }))
                .is_err(),
                "accepted invalid wallet stage: {stage}"
            );
        }
    }

    #[test]
    fn missing_conversion_stage_is_rejected() {
        let mut saved = saved_operation();
        saved.as_object_mut().unwrap().remove("stage");
        assert!(serde_json::from_value::<StableOperation>(saved).is_err());
    }

    fn op(stage: StableStage) -> StableOperation {
        StableOperation {
            id: "test".into(),
            direction: "toUsd".into(),
            stage,
            mint_url: "mint".into(),
            created_at: 0,
            expires_at: 0,
            output_amount: "1000000".into(),
            max_debit: "1000".into(),
            protection_bps: 0,
            funding_invoice: String::new(),
            funding_sats: 0,
            mint_quote_id: String::new(),
            quote_json: String::new(),
            payment_id: None,
            conversion_request_version: 0,
            prior_payment_ids: vec![],
            return_quote_id: String::new(),
            return_quote_json: String::new(),
            return_amount: 0,
        }
    }
    #[test]
    fn review_refresh_preserves_identity_and_cap_and_stops_after_confirmation() {
        let original = op(Quoted);
        let mut updated = original.clone();
        updated.expires_at = 60;
        updated.quote_json = "new quote".into();
        updated.output_amount = "950000".into();
        updated.max_debit = "990".into();
        let mut saved = original.clone();
        assert!(saved.refresh_review(&updated, &original.quote_json, original.expires_at));
        assert_eq!(saved.id, original.id);
        assert_eq!(saved.max_debit, "1000");
        assert_eq!(saved.output_amount, "950000");
        for stage in [Funding, Funded, Converting, Complete, Cancelled] {
            let mut started = op(stage);
            assert!(!started.refresh_review(&updated, &original.quote_json, original.expires_at));
        }
        let mut raised = updated.clone();
        raised.max_debit = "1001".into();
        assert!(!original.clone().refresh_review(
            &raised,
            &original.quote_json,
            original.expires_at
        ));
        let mut foreign = updated.clone();
        foreign.mint_url = "other-mint".into();
        assert!(!original.clone().refresh_review(
            &foreign,
            &original.quote_json,
            original.expires_at
        ));
        assert!(!saved.refresh_review(&updated, &original.quote_json, original.expires_at));
    }
    #[test]
    fn only_unrecorded_protected_conversions_can_restore_after_live_guard_rejection() {
        let mut saved = op(Converting);
        assert!(!saved.recover_unsubmitted_protected());
        saved.protection_bps = 300;
        assert!(!saved.recover_unsubmitted_protected());
        saved.conversion_request_version = 1;
        assert!(saved.recover_unsubmitted_protected());
        assert_eq!(saved.stage, Funded);
        assert!(!saved.recover_unsubmitted_protected());
        saved.stage = Converting;
        saved.payment_id = Some("recorded".into());
        assert!(!saved.recover_unsubmitted_protected());
    }
    #[test]
    fn protected_review_cannot_change_floor_cap_or_expiry() {
        let mut saved = op(Quoted);
        saved.protection_bps = 300;
        let mut next = saved.clone();
        next.expires_at = 60;
        assert!(!saved.refresh_review(&next, "", 0));
        next.protection_bps = 0;
        assert!(!saved.refresh_review(&next, "", 0));
    }
    #[test]
    fn irreversible_stages_cannot_be_cancelled_or_retried() {
        for stage in [Funding, Funded, Converting, Settling] {
            assert!(!op(stage).can_transition(Cancelled));
            assert!(!op(stage).can_transition(Quoted));
            assert!(op(stage).active());
        }
        assert!(op(Quoted).can_transition(Cancelled));
        assert!(!op(Complete).active());
        assert!(!op(Cancelled).active());
    }
    #[test]
    fn rejected_legacy_conversion_can_resume_without_refunding_or_repaying() {
        for (direction, conversion_type, expected_stage) in [
            ("toUsd", "fromBitcoin", Funded),
            ("toSats", "toBitcoin", Quoted),
        ] {
            let mut operation = op(Converting);
            operation.direction = direction.into();
            operation.quote_json = serde_json::json!({"conversionEstimate":{"options":{"conversionType":{"type":conversion_type}}}}).to_string();
            assert!(operation.recover_legacy_idempotency_rejection());
            assert_eq!(operation.stage, expected_stage);
            assert_eq!(operation.conversion_request_version, 1);
            assert!(!operation.recover_legacy_idempotency_rejection());
        }
    }
    #[test]
    fn compatible_or_recorded_conversion_cannot_be_reset_as_legacy() {
        let mut operation = op(Converting);
        operation.quote_json =
            r#"{"conversionEstimate":{"options":{"conversionType":{"type":"fromBitcoin"}}}}"#
                .into();
        operation.conversion_request_version = 1;
        assert!(!operation.recover_legacy_idempotency_rejection());
        operation.conversion_request_version = 0;
        operation.payment_id = Some("already-submitted".into());
        assert!(!operation.recover_legacy_idempotency_rejection());
        operation.payment_id = None;
        operation.quote_json = "{}".into();
        assert!(!operation.recover_legacy_idempotency_rejection());
    }
    #[test]
    fn saved_legacy_operation_defaults_to_legacy_request_version() {
        let mut saved = serde_json::to_value(op(Converting)).unwrap();
        saved
            .as_object_mut()
            .unwrap()
            .remove("conversion_request_version");
        saved.as_object_mut().unwrap().remove("protection_bps");
        let operation: StableOperation = serde_json::from_value(saved).unwrap();
        assert_eq!(operation.conversion_request_version, 0);
        assert_eq!(operation.protection_bps, 0);
    }
    #[test]
    fn old_wallet_without_journal_still_loads() {
        let wallet: crate::WalletState = serde_json::from_value(serde_json::json!({
            "seed_hex": "00", "mnemonic": null, "derivation_index": 0, "proofs": {}
        }))
        .unwrap();
        assert!(wallet.stable_operations.is_empty());
    }

    #[test]
    fn estimate_funding_debit_only_taxes_selected_proofs_and_active_keyset() {
        let keysets = vec![
            crate::client::KeysetSummary {
                id: "active-sat".into(),
                unit: "sat".into(),
                active: true,
                input_fee_ppk: 100,
            },
            crate::client::KeysetSummary {
                id: "retired-expensive".into(),
                unit: "sat".into(),
                active: false,
                input_fee_ppk: 50_000,
            },
        ];
        // Ascending selection for base_melt_needed = 1000 picks the 10 small proofs (1000 sats)
        // plus 1 large proof (1000 sats) = 11 proofs, NOT all 510 proofs in the wallet.
        let mut proofs = Vec::new();
        for i in 0..10 {
            proofs.push(ecash_core::types::Proof {
                id: "active-sat".into(),
                amount: 100,
                secret: format!("small-{i}"),
                c: "02".into(),
                witness: None,
                dleq: None,
                b_prime: None,
                c_prime: None,
                derivation_index: 0,
            });
        }
        for i in 0..500 {
            proofs.push(ecash_core::types::Proof {
                id: "active-sat".into(),
                amount: 1000,
                secret: format!("large-{i}"),
                c: "02".into(),
                witness: None,
                dleq: None,
                b_prime: None,
                c_prime: None,
                derivation_index: 0,
            });
        }

        // base_melt_needed = 1000 sats:
        // split_into_powers_of_2(1000) = 6 proofs -> melt_input_fee = ceil(6 * 100 / 1000) = 1 sat -> total_melt_needed = 1001.
        // Ascending selection picks 10 * 100 (1000) + 1 * 1000 (2000) = 11 proofs -> swap_fee = ceil(11 * 100 / 1000) = 2 sats.
        // Total = 1001 + 2 = 1003 sats (old logic would have added 51 sats for all 510 proofs + 3200 sats for 64 * 50_000 ppk!).
        let debit = estimate_funding_debit(1000, &proofs, &keysets).unwrap();
        assert_eq!(debit, 1003);
    }
}
