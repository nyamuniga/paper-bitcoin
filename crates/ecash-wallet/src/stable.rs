//! Durable conversion journal, encrypted with the Cashu wallet.
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StableOperation {
    pub id: String,
    pub direction: String,
    pub stage: String,
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
            || self.stage != "quoted"
            || candidate.stage != "quoted"
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
        if self.protection_bps != 300 || self.stage != "converting"
            || self.conversion_request_version != 1 || self.payment_id.is_some()
            || !matches!(self.direction.as_str(), "toUsd" | "toSats") {
            return false;
        }
        self.stage = if self.direction == "toUsd" {"funded"} else {"quoted"}.into();
        true
    }
    pub fn active(&self) -> bool {
        !matches!(self.stage.as_str(), "complete" | "cancelled" | "refunded")
    }
    /// The original client always supplied a key on AMM sends. The SDK rejects that
    /// combination before dispatching any conversion. Never apply this reset to
    /// a compatible request or a request with a recorded payment result.
    pub fn recover_legacy_idempotency_rejection(&mut self) -> bool {
        if self.stage != "converting"
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
            "funded"
        } else {
            "quoted"
        }
        .into();
        self.conversion_request_version = 1;
        true
    }
    pub fn can_transition(&self, next: &str) -> bool {
        matches!(
            (self.stage.as_str(), next),
            ("quoted", "cancelled")
                | ("quoted", "converting")
                | ("funded", "converting")
                | ("converting", "settling")
                | ("converting", "refunded")
                | ("converting", "complete")
                | ("settling", "complete")
                | ("funded", "returnQuoted")
                | ("returnQuoted", "funded")
                | ("returnQuoted", "returning")
                | ("returning", "complete")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn op(stage: &str) -> StableOperation {
        StableOperation {
            id: "test".into(),
            direction: "toUsd".into(),
            stage: stage.into(),
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
        let original = op("quoted");
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
        for stage in ["funding", "funded", "converting", "complete", "cancelled"] {
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
        let mut saved = op("converting");
        assert!(!saved.recover_unsubmitted_protected());
        saved.protection_bps = 300;
        assert!(!saved.recover_unsubmitted_protected());
        saved.conversion_request_version = 1;
        assert!(saved.recover_unsubmitted_protected());
        assert_eq!(saved.stage, "funded");
        assert!(!saved.recover_unsubmitted_protected());
        saved.stage = "converting".into();saved.payment_id = Some("recorded".into());
        assert!(!saved.recover_unsubmitted_protected());
    }
    #[test]
    fn protected_review_cannot_change_floor_cap_or_expiry() {
        let mut saved = op("quoted");
        saved.protection_bps = 300;
        let mut next = saved.clone();
        next.expires_at = 60;
        assert!(!saved.refresh_review(&next, "", 0));
        next.protection_bps = 0;
        assert!(!saved.refresh_review(&next, "", 0));
    }
    #[test]
    fn irreversible_stages_cannot_be_cancelled_or_retried() {
        for stage in ["funding", "funded", "converting", "settling"] {
            assert!(!op(stage).can_transition("cancelled"));
            assert!(!op(stage).can_transition("quoted"));
            assert!(op(stage).active());
        }
        assert!(op("quoted").can_transition("cancelled"));
        assert!(!op("complete").active());
        assert!(!op("cancelled").active());
    }
    #[test]
    fn rejected_legacy_conversion_can_resume_without_refunding_or_repaying() {
        for (direction, conversion_type, expected_stage) in [
            ("toUsd", "fromBitcoin", "funded"),
            ("toSats", "toBitcoin", "quoted"),
        ] {
            let mut operation = op("converting");
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
        let mut operation = op("converting");
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
        let mut saved = serde_json::to_value(op("converting")).unwrap();
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
}
