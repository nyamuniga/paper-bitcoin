use std::collections::HashMap;
use anyhow::{anyhow, Result};
use ecash_core::types::Proof;

// ─── Mint Client ──────────────────────────────────────────────────────────────

pub fn check_api_error(v: &serde_json::Value, prefix: &str) -> Result<()> {
    if let Some(err) = v.get("error") {
        if err.as_str() != Some("") && !err.is_null() && err.as_bool() != Some(false) {
            return Err(anyhow!("{} error: {}", prefix, err));
        }
    }
    if let Some(err) = v.get("detail") {
        if err.as_str() != Some("") && !err.is_null() && err.as_bool() != Some(false) {
            return Err(anyhow!("{} error (detail): {}", prefix, err));
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct MintClient {
    pub http: reqwest::Client,
    pub url: String,
}

impl MintClient {
    pub fn new(mint_url: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .pool_max_idle_per_host(0)
                .build()
                .unwrap_or_default(),
            url: crate::state::normalize_mint_url(mint_url),
        }
    }

    pub async fn fetch_keyset(&self) -> Result<KeysetInfo> {
        let v: serde_json::Value = self.http.get(format!("{}/v1/keys", self.url)).send().await?.json().await?;
        check_api_error(&v, "Mint")?;
        
        let ks_array = v.get("keysets").and_then(|k| k.as_array()).ok_or_else(|| anyhow!("Missing keysets in response: {:?}", v))?;
        if ks_array.is_empty() { return Err(anyhow!("Mint returned empty keysets")); }
        
        // Prioritize active keyset with unit "sat", then active keyset, then first keyset
        let ks = ks_array.iter()
            .find(|k| {
                let is_sat = k.get("unit").and_then(|u| u.as_str()).map(|u| u.eq_ignore_ascii_case("sat")).unwrap_or(true);
                let is_active = k.get("active").and_then(|a| a.as_bool()).unwrap_or(true);
                is_sat && is_active
            })
            .or_else(|| {
                ks_array.iter().find(|k| k.get("unit").and_then(|u| u.as_str()).map(|u| u.eq_ignore_ascii_case("sat")).unwrap_or(false))
            })
            .or_else(|| {
                ks_array.iter().find(|k| k.get("active").and_then(|a| a.as_bool()).unwrap_or(false))
            })
            .unwrap_or(&ks_array[0]);
        
        let id = ks.get("id").and_then(|i| i.as_str()).ok_or_else(|| anyhow!("Missing keyset id"))?.to_string();
        let mut keys = HashMap::new();
        let keys_obj = ks.get("keys").and_then(|k| k.as_object()).ok_or_else(|| anyhow!("Missing keys in keyset"))?;
        for (amt_str, pk) in keys_obj {
            keys.insert(amt_str.parse()?, pk.as_str().ok_or_else(|| anyhow!("Invalid pubkey"))?.to_string());
        }
        Ok(KeysetInfo { id, keys })
    }

    pub async fn fetch_keysets(&self) -> Result<Vec<KeysetSummary>> {
        let resp = self.http.get(format!("{}/v1/keysets", self.url)).send().await?;
        if !resp.status().is_success() {
            return Ok(Vec::new());
        }
        let v: serde_json::Value = resp.json().await?;
        check_api_error(&v, "Mint")?;

        let ks_array = match v.get("keysets").and_then(|k| k.as_array()) {
            Some(arr) => arr,
            None => return Ok(Vec::new()),
        };

        let mut summaries = Vec::new();
        for ks in ks_array {
            if let Some(id) = ks.get("id").and_then(|i| i.as_str()) {
                let unit = ks.get("unit").and_then(|u| u.as_str()).unwrap_or("sat").to_string();
                let active = ks.get("active").and_then(|a| a.as_bool()).unwrap_or(true);
                let input_fee_ppk = ks.get("input_fee_ppk").and_then(|f| f.as_u64()).unwrap_or(0);
                summaries.push(KeysetSummary {
                    id: id.to_string(),
                    unit,
                    active,
                    input_fee_ppk,
                });
            }
        }
        Ok(summaries)
    }

    pub async fn fetch_keyset_by_id(&self, keyset_id: &str) -> Result<KeysetInfo> {
        let mut actual_id = keyset_id.to_string();
        if (actual_id.starts_with("01") && actual_id.len() == 16) || actual_id.len() != 66 {
            if let Ok(keysets) = self.fetch_keysets().await {
                if let Some(matching) = keysets.iter().find(|ks| {
                    ks.id == actual_id || (actual_id.starts_with("01") && ks.id.starts_with(&actual_id))
                }) {
                    actual_id = matching.id.clone();
                }
            }
        }

        let resp = self.http.get(format!("{}/v1/keys/{}", self.url, actual_id)).send().await?;
        
        let v: serde_json::Value = if !resp.status().is_success() {
            // As fallback, query /v1/keysets and look for a matching keyset
            let mut found_val = None;
            if let Ok(keysets) = self.fetch_keysets().await {
                if let Some(matching) = keysets.iter().find(|ks| {
                    ks.id == keyset_id || ks.id.starts_with(keyset_id) || keyset_id.starts_with(&ks.id)
                }) {
                    if let Ok(r2) = self.http.get(format!("{}/v1/keys/{}", self.url, matching.id)).send().await {
                        if r2.status().is_success() {
                            actual_id = matching.id.clone();
                            found_val = r2.json().await.ok();
                        }
                    }
                }
            }
            found_val.ok_or_else(|| anyhow!("Mint does not have keyset {}", keyset_id))?
        } else {
            resp.json().await?
        };

        check_api_error(&v, "Mint")?;

        let ks_obj = if let Some(ks_arr) = v.get("keysets").and_then(|k| k.as_array()) {
            ks_arr.iter()
                .find(|k| {
                    let id_str = k.get("id").and_then(|i| i.as_str());
                    id_str == Some(&actual_id) || id_str == Some(keyset_id)
                })
                .or_else(|| ks_arr.first())
                .ok_or_else(|| anyhow!("Keyset {} not found in response", keyset_id))?
                .as_object()
                .ok_or_else(|| anyhow!("Keyset entry is not a JSON object"))?
        } else {
            v.as_object().ok_or_else(|| anyhow!("Invalid keyset response"))?
        };

        let id = ks_obj.get("id")
            .and_then(|i| i.as_str())
            .unwrap_or(&actual_id)
            .to_string();

        let mut keys = HashMap::new();
        let keys_obj = ks_obj.get("keys")
            .and_then(|k| k.as_object())
            .ok_or_else(|| anyhow!("Missing keys in keyset"))?;

        for (amt_str, pk) in keys_obj {
            let amt: u64 = amt_str.parse()?;
            let pk_str = pk.as_str().ok_or_else(|| anyhow!("Invalid pubkey"))?.to_string();
            keys.insert(amt, pk_str);
        }

        Ok(KeysetInfo { id, keys })
    }

    pub async fn request_mint_quote(&self, amount_sats: u64) -> Result<(String, String)> {
        let mut attempts = 0;
        let v: serde_json::Value = loop {
            attempts += 1;
            match self.http.post(format!("{}/v1/mint/quote/bolt11", self.url))
                .json(&serde_json::json!({ "amount": amount_sats, "unit": "sat" })).send().await {
                Ok(resp) => {
                    match resp.json().await {
                        Ok(json) => break json,
                        Err(e) if attempts >= 3 => return Err(anyhow!("Failed to parse quote response: {}", e)),
                        Err(_) => {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            continue;
                        }
                    }
                }
                Err(e) => {
                    if attempts >= 3 {
                        return Err(anyhow::Error::new(e).context("Failed to request mint quote after 3 attempts"));
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            }
        };

        check_api_error(&v, "Mint")?;
        
        let quote = v.get("quote").and_then(|q| q.as_str()).ok_or_else(|| anyhow!("Missing quote in response: {:?}", v))?;
        let request = v.get("request").and_then(|r| r.as_str()).unwrap_or("");
        
        Ok((quote.to_string(), request.to_string()))
    }

    pub async fn wait_for_quote_paid(&self, quote_id: &str) -> Result<()> {
        for _ in 0..300 {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            
            let resp = match self.http.get(format!("{}/v1/mint/quote/bolt11/{}", self.url, quote_id)).send().await {
                Ok(r) => r,
                Err(_) => continue,
            };
            
            if let Ok(check) = resp.json::<serde_json::Value>().await {
                if check["state"].as_str() == Some("PAID") { 
                    return Ok(()); 
                }
            }
        }
        Err(anyhow!("Invoice payment timeout after 5 minutes"))
    }

    pub async fn mint_tokens(&self, quote_id: &str, outputs: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let v: serde_json::Value = self.http.post(format!("{}/v1/mint/bolt11", self.url))
            .json(&serde_json::json!({ "quote": quote_id, "outputs": outputs })).send().await?.json().await?;
        check_api_error(&v, "Mint")?;
        
        let sigs = v.get("signatures").and_then(|s| s.as_array())
            .ok_or_else(|| anyhow!("Mint response missing signatures: {:?}", v))?;
        Ok(sigs.clone())
    }

    /// Send a melt request. If `quote_id` is provided, it uses that; otherwise it requests a new one.
    /// For NUT-15 MPP, all mints must use the SAME `quote_id`.
    pub async fn melt_tokens(
        &self,
        proofs: &[Proof],
        invoice: &str,
        quote_id: Option<&str>,
        outputs: Option<Vec<serde_json::Value>>,
    ) -> Result<(bool, Option<String>, Vec<serde_json::Value>)> {
        let qid = if let Some(q) = quote_id {
            q.to_string()
        } else {
            // Fallback: request a new quote (not recommended for MPP)
            let qv: serde_json::Value = self.http.post(format!("{}/v1/melt/quote/bolt11", self.url))
                .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
            check_api_error(&qv, "Melt quote")?;
            qv["quote"].as_str().ok_or_else(|| anyhow!("No quote returned"))?.to_string()
        };

        let keysets = self.fetch_keysets().await.unwrap_or_default();
        let id_mapping: HashMap<String, String> = keysets.into_iter()
            .filter(|ks| ks.id.starts_with("01") && ks.id.len() == 66)
            .map(|ks| (ks.id[..16].to_string(), ks.id))
            .collect();

        let mut inputs = Vec::new();
        for p in proofs {
            let mut val = serde_json::to_value(p)?;
            if let Some(obj) = val.as_object_mut() {
                obj.remove("derivation_index");
                obj.remove("B_");
                obj.remove("C_");
                obj.remove("dleq");
                if let Some(id_val) = obj.get("id").and_then(|i| i.as_str()) {
                    if let Some(full_id) = id_mapping.get(id_val) {
                        obj.insert("id".to_string(), serde_json::Value::String(full_id.clone()));
                    }
                }
            }
            inputs.push(val);
        }
        let mut req = serde_json::json!({ "quote": qid, "inputs": inputs });
        if let Some(outs) = outputs {
            req["outputs"] = serde_json::Value::Array(outs);
        }

        let mv: serde_json::Value = match self.http.post(format!("{}/v1/melt/bolt11", self.url))
            .timeout(std::time::Duration::from_secs(120))
            .json(&req).send().await
        {
            Ok(resp) => {
                let status = resp.status();
                if let Ok(v) = resp.json::<serde_json::Value>().await {
                    v
                } else {
                    return Err(anyhow!("Failed to parse JSON response from {} (status {})", self.url, status));
                }
            }
            Err(e) => {
                println!("[MintClient] POST /v1/melt/bolt11 error: {:?}. Checking quote {} status directly...", e, qid);
                let mut resolved_val = None;
                for attempt in 1..=6 {
                    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
                    if let Ok(resp) = self.http.get(format!("{}/v1/melt/quote/bolt11/{}", self.url, qid)).send().await {
                        if let Ok(qv) = resp.json::<serde_json::Value>().await {
                            let q_state = qv["state"].as_str().unwrap_or("").to_uppercase();
                            let q_paid = qv["paid"].as_bool().unwrap_or(false);
                            println!("[MintClient] Quote poll attempt {}/6: state='{}', paid={}", attempt, q_state, q_paid);
                            if q_state == "PAID" || q_paid {
                                resolved_val = Some(qv);
                                break;
                            } else if q_state == "UNPAID" || q_state == "FAILED" {
                                return Err(anyhow!("Melt payment failed on {}: Quote is {}", self.url, q_state));
                            }
                        }
                    }
                }
                match resolved_val {
                    Some(v) => v,
                    None => return Err(anyhow!("Melt request to {} failed: {}. Quote {} may still be pending at the mint.", self.url, e, qid)),
                }
            }
        };

        println!("[MintClient] /v1/melt/bolt11 response from {}: {:?}", self.url, mv);

        check_api_error(&mv, "Melt")?;

        let paid_bool = mv["paid"].as_bool().unwrap_or(false);
        let state_str = mv["state"].as_str().unwrap_or("");
        let is_paid_state = state_str.eq_ignore_ascii_case("paid");
        let is_pending_state = state_str.eq_ignore_ascii_case("pending");
        let mut preimage = mv.get("payment_preimage").and_then(|p| p.as_str()).map(|s| s.to_string());
        let has_preimage = preimage.as_ref().map(|p| !p.is_empty()).unwrap_or(false);

        let mut paid = paid_bool || is_paid_state || has_preimage;
        let mut change = mv.get("change")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        // If the payment is not yet confirmed (e.g. mint returned PENDING or in-flight routing),
        // poll the quote endpoint for up to 10 seconds to detect settlement.
        if !paid && (is_pending_state || (!paid_bool && !has_preimage)) {
            println!("[MintClient] Melt status is pending or unconfirmed. Polling quote {} on {}...", qid, self.url);
            for i in 1..=10 {
                tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                if let Ok(resp) = self.http.get(format!("{}/v1/melt/quote/bolt11/{}", self.url, qid)).send().await {
                    if let Ok(qv) = resp.json::<serde_json::Value>().await {
                        let q_state = qv["state"].as_str().unwrap_or("");
                        let q_paid = qv["paid"].as_bool().unwrap_or(false);
                        let q_preimage = qv.get("payment_preimage").and_then(|p| p.as_str()).map(|s| s.to_string());
                        let q_has_preimage = q_preimage.as_ref().map(|p| !p.is_empty()).unwrap_or(false);

                        println!("[MintClient] Poll attempt {}/10 for quote {}: state='{}', paid={}", i, qid, q_state, q_paid);

                        if q_state.eq_ignore_ascii_case("paid") || q_paid || q_has_preimage {
                            println!("[MintClient] Quote {} confirmed PAID via polling!", qid);
                            paid = true;
                            if preimage.is_none() {
                                preimage = q_preimage;
                            }
                            if change.is_empty() {
                                if let Some(ch) = qv.get("change").and_then(|c| c.as_array()) {
                                    change = ch.clone();
                                }
                            }
                            break;
                        } else if q_state.eq_ignore_ascii_case("failed") || q_state.eq_ignore_ascii_case("unpaid") {
                            println!("[MintClient] Quote {} resolved to state: {}", qid, q_state);
                            break;
                        }
                    }
                }
            }
        }
            
        Ok((paid, preimage, change))
    }

    /// Send a swap request (NUT-03).
    /// Used to exchange existing proofs for new proofs of desired denominations.
    pub async fn swap_tokens(
        &self,
        inputs: Vec<serde_json::Value>,
        outputs: Vec<serde_json::Value>,
    ) -> Result<Vec<serde_json::Value>> {
        let req = serde_json::json!({
            "inputs": inputs,
            "outputs": outputs
        });

        let v: serde_json::Value = self.http.post(format!("{}/v1/swap", self.url))
            .json(&req).send().await?.json().await?;

        check_api_error(&v, "Swap")?;

        let sigs = v.get("signatures").and_then(|s| s.as_array())
            .ok_or_else(|| anyhow!("Mint response missing signatures for swap: {:?}", v))?;
        Ok(sigs.clone())
    }

    /// Send a restore request (NUT-13).
    /// Used to fetch previously issued tokens using deterministic secrets.
    pub async fn restore_tokens(
        &self,
        outputs: Vec<serde_json::Value>,
    ) -> Result<(Vec<serde_json::Value>, Vec<serde_json::Value>)> {
        let req = serde_json::json!({
            "outputs": outputs
        });

        let mut backoff = std::time::Duration::from_millis(2000);
        for attempt in 0..2 {
            let resp = self.http.post(format!("{}/v1/restore", self.url))
                .json(&req).send().await?;

            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                let retry_after_secs = resp.headers()
                    .get("retry-after")
                    .and_then(|h| h.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let wait_time = if retry_after_secs > 0 {
                    std::time::Duration::from_secs(retry_after_secs + 1)
                } else {
                    backoff
                };

                println!(
                    "[MintClient] Rate limited (HTTP 429) on {} /v1/restore. Waiting {:?} (attempt {}/2)...",
                    self.url, wait_time, attempt + 1
                );
                tokio::time::sleep(wait_time).await;
                backoff *= 2;
                continue;
            }

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(anyhow!("Mint restore HTTP error {}: {}", status, text));
            }

            let v: serde_json::Value = resp.json().await?;
            check_api_error(&v, "Restore")?;

            let outputs_arr = v.get("outputs").and_then(|s| s.as_array()).cloned().unwrap_or_default();
            let sigs_arr = v.get("signatures").and_then(|s| s.as_array()).cloned().unwrap_or_default();
            
            if outputs_arr.is_empty() && sigs_arr.is_empty() {
                return Ok((vec![], vec![]));
            }

            return Ok((outputs_arr, sigs_arr));
        }

        Err(anyhow!("Rate limit exceeded on {} /v1/restore", self.url))
    }

    pub async fn check_state(&self, ys: &[String]) -> Result<HashMap<String, String>> {
        let req = serde_json::json!({ "Ys": ys });
        let mut backoff = std::time::Duration::from_millis(1500);
        for attempt in 0..4 {
            let resp = self.http.post(format!("{}/v1/checkstate", self.url))
                .json(&req).send().await?;

            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                let retry_after_secs = resp.headers()
                    .get("retry-after")
                    .and_then(|h| h.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let wait_time = if retry_after_secs > 0 {
                    std::time::Duration::from_secs(retry_after_secs + 1)
                } else {
                    backoff
                };

                println!(
                    "[MintClient] Rate limited (HTTP 429) on {} /v1/checkstate. Waiting {:?} (attempt {}/4)...",
                    self.url, wait_time, attempt + 1
                );
                tokio::time::sleep(wait_time).await;
                backoff *= 2;
                continue;
            }

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(anyhow!("Mint checkstate HTTP error {}: {}", status, text));
            }

            let v: serde_json::Value = resp.json().await?;
            check_api_error(&v, "Checkstate")?;
            
            let mut results = HashMap::new();
            if let Some(states) = v.get("states").and_then(|s| s.as_array()) {
                for state_obj in states {
                    if let (Some(y), Some(state_val)) = (state_obj.get("Y").and_then(|y| y.as_str()), state_obj.get("state").and_then(|s| s.as_str())) {
                        results.insert(y.to_string(), state_val.to_string());
                    }
                }
            }
            return Ok(results);
        }

        Err(anyhow!("Rate limit exceeded on {} /v1/checkstate after 4 attempts", self.url))
    }

    pub async fn fetch_info(&self) -> Result<serde_json::Value> {
        let mut attempts = 0;
        loop {
            attempts += 1;
            match self.http.get(format!("{}/v1/info", self.url)).send().await {
                Ok(resp) => {
                    match resp.json().await {
                        Ok(json) => return Ok(json),
                        Err(e) if attempts >= 3 => return Err(anyhow!("Failed to parse info response: {}", e)),
                        Err(_) => {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            continue;
                        }
                    }
                }
                Err(e) => {
                    if attempts >= 3 {
                        return Err(anyhow::Error::new(e).context("Failed to fetch mint info after 3 attempts"));
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            }
        }
    }

    /// Check if the mint supports NUT-15 (Multi-Path Payments).
    /// According to the Cashu spec, NUT-15 support is indicated by the presence
    /// of the `"15"` key in the `nuts` object of the `/info` response.
    pub async fn supports_nut15(&self) -> Result<bool> {
        let info = self.fetch_info().await?;
        if let Some(nuts) = info.get("nuts").and_then(|n| n.as_object()) {
            if let Some(nut15) = nuts.get("15") {
                if nut15.get("disabled").and_then(|d| d.as_bool()) == Some(true) {
                    return Ok(false);
                }
                if let Some(methods) = nut15.get("methods").and_then(|m| m.as_array()) {
                    let has_bolt11 = methods.iter().any(|m| {
                        m.get("method").and_then(|v| v.as_str()) == Some("bolt11")
                            && m.get("unit").and_then(|v| v.as_str()) == Some("sat")
                    });
                    return Ok(has_bolt11);
                }
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Request a melt quote. Returns (quote_id, fee_reserve, total_amount_sats).
    /// For NUT-15, this quote can be used by multiple mints.
    pub async fn request_melt_quote(&self, invoice: &str) -> Result<(String, u64, u64)> {
        let qv: serde_json::Value = self.http.post(format!("{}/v1/melt/quote/bolt11", self.url))
            .json(&serde_json::json!({ 
                "request": invoice, 
                "unit": "sat"
            })).send().await?.json().await?;
        check_api_error(&qv, "Melt quote")?;
        
        let quote = qv["quote"].as_str().ok_or_else(|| anyhow!("No quote returned"))?.to_string();
        let fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
        let amount = qv["amount"].as_u64().unwrap_or(0);
        Ok((quote, fee_reserve, amount + fee_reserve)) // total required
    }
    /// Request a melt quote for a specific amount (for MPP).
    /// Per NUT-15, options.mpp.amount is in millisatoshis (msat).
    /// Returns (quote_id, fee_reserve, total_required_for_this_amount).
    pub async fn request_melt_quote_with_amount(&self, invoice: &str, amount_sats: u64) -> Result<(String, u64, u64)> {
        let amount_msat = amount_sats.saturating_mul(1000);
        let qv: serde_json::Value = self.http.post(format!("{}/v1/melt/quote/bolt11", self.url))
            .json(&serde_json::json!({ 
                "request": invoice, 
                "unit": "sat",
                "options": {
                    "mpp": {
                        "amount": amount_msat
                    }
                }
            })).send().await?.json().await?;
        check_api_error(&qv, "Melt quote")?;
        
        let quote = qv["quote"].as_str().ok_or_else(|| anyhow!("No quote returned"))?.to_string();
        let fee_reserve = qv["fee_reserve"].as_u64().unwrap_or(0);
        let amount = qv["amount"].as_u64().unwrap_or(amount_sats);
        Ok((quote, fee_reserve, amount + fee_reserve))
    }
}


pub async fn estimate_melt_fee(mint_url: &str, invoice: &str) -> Result<(u64, String)> {
    let client = MintClient::new(mint_url);
    let qv: serde_json::Value = client.http.post(format!("{}/v1/melt/quote/bolt11", client.url))
        .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
    check_api_error(&qv, "Melt quote")?;
    let fee = qv["fee_reserve"].as_u64().unwrap_or(0);
    let quote = qv["quote"].as_str().unwrap_or("").to_string();
    Ok((fee, quote))
}

pub async fn estimate_routing_fee_from_info(mint_url: &str, amount_sats: u64) -> u64 {
    let client = MintClient::new(mint_url);
    let mut base_msat = 1000;
    let mut proportional_millionths = 1000;

    if let Ok(info) = client.fetch_info().await {
        if let Some(base) = extract_json_number(&info, "fee_base_msat") {
            base_msat = base;
        }
        if let Some(prop) = extract_json_number(&info, "fee_proportional_millionths") {
            proportional_millionths = prop;
        } else if let Some(prop) = extract_json_number(&info, "fee_proportional") {
            proportional_millionths = prop;
        }
    }

    let base_sats = base_msat / 1000;
    let proportional_sats = (amount_sats * proportional_millionths) / 1_000_000;
    base_sats + proportional_sats
}

fn extract_json_number(value: &serde_json::Value, key: &str) -> Option<u64> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(v) = map.get(key) {
                if let Some(n) = v.as_u64() {
                    return Some(n);
                }
            }
            for v in map.values() {
                if let Some(n) = extract_json_number(v, key) {
                    return Some(n);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let Some(n) = extract_json_number(v, key) {
                    return Some(n);
                }
            }
            None
        }
        _ => None,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KeysetSummary {
    pub id: String,
    pub unit: String,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub input_fee_ppk: u64,
}

#[derive(Clone)]
pub struct KeysetInfo { pub id: String, pub keys: HashMap<u64, String> }

/// Calculate total mint input fees in satoshis for a set of proofs according to NUT-02:
/// fee = ceil(sum(input_fee_ppk) / 1000) = (sum(input_fee_ppk) + 999) / 1000
pub fn calculate_input_fee(proofs: &[ecash_core::types::Proof], keysets: &[KeysetSummary]) -> u64 {
    let mut total_fee_ppk: u64 = 0;
    for p in proofs {
        let fee_ppk = keysets.iter()
            .find(|ks| ks.id == p.id || (p.id.len() < ks.id.len() && ks.id.starts_with(&p.id)) || (ks.id.len() < p.id.len() && p.id.starts_with(&ks.id)))
            .map(|ks| ks.input_fee_ppk)
            .unwrap_or(0);
        total_fee_ppk += fee_ppk;
    }
    if total_fee_ppk > 0 {
        (total_fee_ppk + 999) / 1000
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ecash_core::types::Proof;

    #[test]
    fn test_calculate_input_fee() {
        let keysets = vec![
            KeysetSummary {
                id: "009a1f293252f338".to_string(),
                unit: "sat".to_string(),
                active: true,
                input_fee_ppk: 100, // 100 ppk = 0.1 sat per proof
            },
            KeysetSummary {
                id: "01abcdef".to_string(),
                unit: "sat".to_string(),
                active: true,
                input_fee_ppk: 0,
            },
        ];

        let create_proof = |id: &str, amt: u64| Proof {
            id: id.to_string(),
            amount: amt,
            secret: "sec".to_string(),
            c: "c".to_string(),
            witness: None,
            dleq: None,
            b_prime: None,
            c_prime: None,
            derivation_index: 0,
        };

        // 0 proofs -> 0 fee
        assert_eq!(calculate_input_fee(&[], &keysets), 0);

        // 1 proof @ 100 ppk -> ceil(100/1000) = 1 sat
        let proofs_1 = vec![create_proof("009a1f293252f338", 500)];
        assert_eq!(calculate_input_fee(&proofs_1, &keysets), 1);

        // 10 proofs @ 100 ppk -> ceil(1000/1000) = 1 sat
        let proofs_10 = vec![create_proof("009a1f293252f338", 100); 10];
        assert_eq!(calculate_input_fee(&proofs_10, &keysets), 1);

        // 11 proofs @ 100 ppk -> ceil(1100/1000) = 2 sats
        let proofs_11 = vec![create_proof("009a1f293252f338", 100); 11];
        assert_eq!(calculate_input_fee(&proofs_11, &keysets), 2);

        // Proof from 0 fee keyset -> 0 fee
        let proofs_zero = vec![create_proof("01abcdef", 1000); 5];
        assert_eq!(calculate_input_fee(&proofs_zero, &keysets), 0);
    }
}