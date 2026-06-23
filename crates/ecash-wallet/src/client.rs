use std::collections::HashMap;
use anyhow::{anyhow, Result};
use ecash_core::types::Proof;


// ─── Mint Client (internal) ───────────────────────────────────────────────────

pub struct MintClient {
    pub http: reqwest::Client,
    pub url: String,
}

impl MintClient {
    pub fn new(mint_url: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .pool_max_idle_per_host(0)
                .build()
                .unwrap_or_default(),
            url: mint_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn fetch_keyset(&self) -> Result<KeysetInfo> {
        let v: serde_json::Value = self.http.get(format!("{}/v1/keys", self.url)).send().await?.json().await?;
        if let Some(err) = v.get("error") { return Err(anyhow!("Mint error: {}", err)); }
        if let Some(err) = v.get("detail") { return Err(anyhow!("Mint error (detail): {}", err)); }
        
        let ks_array = v.get("keysets").and_then(|k| k.as_array()).ok_or_else(|| anyhow!("Missing keysets in response: {:?}", v))?;
        if ks_array.is_empty() { return Err(anyhow!("Mint returned empty keysets")); }
        let ks = &ks_array[0];
        
        let id = ks.get("id").and_then(|i| i.as_str()).ok_or_else(|| anyhow!("Missing keyset id"))?.to_string();
        let mut keys = HashMap::new();
        let keys_obj = ks.get("keys").and_then(|k| k.as_object()).ok_or_else(|| anyhow!("Missing keys in keyset"))?;
        for (amt_str, pk) in keys_obj {
            keys.insert(amt_str.parse()?, pk.as_str().ok_or_else(|| anyhow!("Invalid pubkey"))?.to_string());
        }
        Ok(KeysetInfo { id, keys })
    }

    pub async fn fetch_keyset_by_id(&self, keyset_id: &str) -> Result<KeysetInfo> {
        // 1. ALWAYS request the specific keyset. DO NOT fall back to /v1/keys.
        let resp = self.http.get(format!("{}/v1/keys/{}", self.url, keyset_id)).send().await?;
        
        if !resp.status().is_success() {
            return Err(anyhow!("Mint does not have keyset {}", keyset_id));
        }

        let v: serde_json::Value = resp.json().await?;
        if let Some(err) = v.get("error") {
            return Err(anyhow!("Mint error: {}", err));
        }

        // 2. Handle BOTH response formats:
        //    - Array format: { "keysets": [ { "id": "...", "keys": {...} } ] }
        //    - Single object format: { "id": "...", "keys": {...} }
        let ks_obj = if let Some(ks_arr) = v.get("keysets").and_then(|k| k.as_array()) {
            // Find the matching keyset in the array, then convert it to a Map
            ks_arr.iter()
                .find(|k| k.get("id").and_then(|i| i.as_str()) == Some(keyset_id))
                .ok_or_else(|| anyhow!("Keyset {} not found in response", keyset_id))?
                .as_object()
                .ok_or_else(|| anyhow!("Keyset entry is not a JSON object"))?
        } else {
            // Assume the response itself is the keyset object
            v.as_object().ok_or_else(|| anyhow!("Invalid keyset response"))?
        };

        // Now `ks_obj` is a `&serde_json::Map`, so `.get()` works perfectly.
        let id = ks_obj.get("id")
            .and_then(|i| i.as_str())
            .ok_or_else(|| anyhow!("Missing keyset id"))?
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

        if let Some(err) = v.get("error") { return Err(anyhow!("Mint error: {}", err)); }
        if let Some(err) = v.get("detail") { return Err(anyhow!("Mint error (detail): {}", err)); }
        
        let quote = v.get("quote").and_then(|q| q.as_str()).ok_or_else(|| anyhow!("Missing quote in response: {:?}", v))?;
        let request = v.get("request").and_then(|r| r.as_str()).unwrap_or("");
        
        Ok((quote.to_string(), request.to_string()))
    }

    pub async fn wait_for_quote_paid(&self, quote_id: &str) -> Result<()> {
        for _ in 0..300 {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            
            // Ignore transient network errors (e.g. OS suspending the socket while switching apps)
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
        if let Some(err) = v.get("error") { return Err(anyhow!("Mint error: {}", err)); }
        if let Some(err) = v.get("detail") { return Err(anyhow!("Mint error (detail): {}", err)); }
        
        let sigs = v.get("signatures").and_then(|s| s.as_array())
            .ok_or_else(|| anyhow!("Mint response missing signatures: {:?}", v))?;
        Ok(sigs.clone())
    }

    pub async fn melt_tokens(&self, proofs: &[Proof], invoice: &str, quote_id: Option<&str>, outputs: Option<Vec<serde_json::Value>>) -> Result<(bool, Vec<serde_json::Value>)> {
        let qid = if let Some(q) = quote_id {
            q.to_string()
        } else {
            let qv: serde_json::Value = self.http.post(format!("{}/v1/melt/quote/bolt11", self.url))
                .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
            if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
            if let Some(err) = qv.get("detail") { return Err(anyhow!("Melt quote error (detail): {}", err)); }
            qv["quote"].as_str().ok_or_else(|| anyhow!("No quote returned"))?.to_string()
        };

        let mut inputs = Vec::new();
        for p in proofs {
            let mut val = serde_json::to_value(p)?;
            if let Some(obj) = val.as_object_mut() {
                obj.remove("derivation_index");
                obj.remove("B_");
                obj.remove("C_");
                obj.remove("dleq");
            }
            inputs.push(val);
        }
        let mut req = serde_json::json!({ "quote": qid, "inputs": inputs });
        if let Some(outs) = outputs {
            req["outputs"] = serde_json::Value::Array(outs);
        }


        let mv: serde_json::Value = self.http.post(format!("{}/v1/melt/bolt11", self.url))
            .json(&req).send().await?.json().await?;

        if let Some(err) = mv.get("error") { return Err(anyhow!("Melt error: {}", err)); }
        if let Some(err) = mv.get("detail") { return Err(anyhow!("Melt error (detail): {}", err)); }

        let paid = mv["paid"].as_bool().unwrap_or(false);

        let change = mv.get("change")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        Ok((paid, change))
    }

    pub async fn check_state(&self, ys: &[String]) -> Result<HashMap<String, String>> {
        let v: serde_json::Value = self.http.post(format!("{}/v1/checkstate", self.url))
            .json(&serde_json::json!({ "Ys": ys })).send().await?.json().await?;
        if let Some(err) = v.get("error") { return Err(anyhow!("Checkstate error: {}", err)); }
        
        let mut results = HashMap::new();
        if let Some(states) = v.get("states").and_then(|s| s.as_array()) {
            for state_obj in states {
                if let (Some(y), Some(state_val)) = (state_obj.get("Y").and_then(|y| y.as_str()), state_obj.get("state").and_then(|s| s.as_str())) {
                    results.insert(y.to_string(), state_val.to_string());
                }
            }
        }
        Ok(results)
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
}

pub async fn estimate_melt_fee(mint_url: &str, invoice: &str) -> Result<(u64, String)> {
    let client = MintClient::new(mint_url);
    let qv: serde_json::Value = client.http.post(format!("{}/v1/melt/quote/bolt11", client.url))
        .json(&serde_json::json!({ "request": invoice, "unit": "sat" })).send().await?.json().await?;
    if let Some(err) = qv.get("error") { return Err(anyhow!("Melt quote error: {}", err)); }
    let fee = qv["fee_reserve"].as_u64().unwrap_or(0);
    let quote = qv["quote"].as_str().unwrap_or("").to_string();
    Ok((fee, quote))
}

pub async fn estimate_routing_fee_from_info(mint_url: &str, amount_sats: u64) -> u64 {
    let client = MintClient::new(mint_url);
    let mut base_msat = 1000; // default 1 sat
    let mut proportional_millionths = 1000; // default 0.1%

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

#[derive(Clone)]
pub struct KeysetInfo { pub id: String, pub keys: HashMap<u64, String> }

