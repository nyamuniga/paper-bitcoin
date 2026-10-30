use tauri::{State, AppHandle, Manager};
use crate::commands::auth::AppState;
use ecash_core::derivation::TokenDerivation;
use ecash_core::types::{
    split_into_powers_of_2, ReceiveOnchainTransactionData, Transaction, TransactionStatus,
    TransactionType,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use std::str::FromStr;
use bitcoin::Network;
use anyhow::{Result, Context};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::Engine;
use rand::RngCore;
use cbc::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};

type HmacSha256 = Hmac<Sha256>;
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

#[derive(Default)]
pub struct FixedFloatState {
    pub api_key: Mutex<Option<String>>,
    pub api_secret: Mutex<Option<String>>,
    pub is_sending: std::sync::atomic::AtomicBool,
}

impl FixedFloatState {
    pub fn new() -> Self {
        Self {
            api_key: Mutex::new(None),
            api_secret: Mutex::new(None),
            is_sending: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

pub struct SendingGuard<'a>(pub &'a std::sync::atomic::AtomicBool);
impl<'a> Drop for SendingGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

fn load_credentials_from_env(app: &AppHandle, state: &FixedFloatState) -> (Option<String>, Option<String>) {
    // 1. Check in-memory state first
    let in_mem_key = state.api_key.lock().unwrap().clone();
    let in_mem_sec = state.api_secret.lock().unwrap().clone();
    if in_mem_key.is_some() && in_mem_sec.is_some() {
        return (in_mem_key, in_mem_sec);
    }

    // 2. Check environment variables
    let env_key = std::env::var("FIXEDFLOAT_API_KEY")
        .or_else(|_| std::env::var("VITE_FIXEDFLOAT_API_KEY"))
        .ok();
    let env_sec = std::env::var("FIXEDFLOAT_API_SECRET")
        .or_else(|_| std::env::var("VITE_FIXEDFLOAT_API_SECRET"))
        .ok();

    if env_key.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        && env_sec.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
    {
        return (env_key, env_sec);
    }

    // 3. Look for .env file in standard paths and directory ancestors
    let mut candidate_paths = vec![
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
        PathBuf::from("cashu-app/.env"),
        PathBuf::from("../cashu-app/.env"),
        app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join(".env"),
        app.path().resource_dir().unwrap_or_else(|_| PathBuf::from(".")).join(".env"),
    ];

    if let Ok(cwd) = std::env::current_dir() {
        let mut curr = Some(cwd.as_path());
        for _ in 0..5 {
            if let Some(dir) = curr {
                candidate_paths.push(dir.join(".env"));
                candidate_paths.push(dir.join("cashu-app").join(".env"));
                curr = dir.parent();
            } else {
                break;
            }
        }
    }

    for path in candidate_paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                let mut found_key = None;
                let mut found_sec = None;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with('#') || !trimmed.contains('=') {
                        continue;
                    }
                    let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
                    if parts.len() == 2 {
                        let k = parts[0].trim();
                        let v = parts[1].trim().trim_matches('"').trim_matches('\'').to_string();
                        if (k == "FIXEDFLOAT_API_KEY" || k == "VITE_FIXEDFLOAT_API_KEY") && !v.is_empty() {
                            found_key = Some(v);
                        } else if (k == "FIXEDFLOAT_API_SECRET" || k == "VITE_FIXEDFLOAT_API_SECRET") && !v.is_empty() {
                            found_sec = Some(v);
                        }
                    }
                }
                if found_key.is_some() && found_sec.is_some() {
                    *state.api_key.lock().unwrap() = found_key.clone();
                    *state.api_secret.lock().unwrap() = found_sec.clone();
                    return (found_key, found_sec);
                }
            }
        }
    }

    (None, None)
}

fn sign_payload(secret: &str, body: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC can take key of any size");
    mac.update(body.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

async fn call_fixedfloat_api(
    endpoint: &str,
    payload: &serde_json::Value,
    api_key: &str,
    api_secret: &str,
) -> Result<serde_json::Value> {
    let url = format!("https://ff.io/api/v2/{}", endpoint);
    let payload_str = serde_json::to_string(payload)?;
    let signature = sign_payload(api_secret, &payload_str);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json; charset=UTF-8")
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .header("X-API-KEY", api_key)
        .header("X-API-SIGN", signature)
        .body(payload_str)
        .send()
        .await
        .context("Failed to send request to FixedFloat API")?;

    let status = resp.status();
    let body_text = resp.text().await.context("Failed to read response body")?;

    let json_resp: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|_| anyhow::anyhow!("FixedFloat returned non-JSON response (HTTP {}): {}", status, body_text))?;

    let code = json_resp.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = json_resp.get("msg").and_then(|m| m.as_str()).unwrap_or("Unknown error");
        if code == 429 {
            anyhow::bail!("FixedFloat rate limit reached (cooling down 60s): {}", msg);
        }
        anyhow::bail!("FixedFloat API error (code {}): {}", code, msg);
    }

    Ok(json_resp["data"].clone())
}

const DEFAULT_PROXY_BASE_URL: &str = "https://payments-proxy.vercel.app/api";

fn get_proxy_base_url(app: &AppHandle) -> String {
    if let Ok(url) = std::env::var("VITE_MOMO_API_BASE_URL") {
        if !url.trim().is_empty() {
            return url.trim().trim_end_matches('/').to_string();
        }
    }

    let candidate_paths = vec![
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
        PathBuf::from("cashu-app/.env"),
        PathBuf::from("../cashu-app/.env"),
        app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join(".env"),
    ];

    for path in candidate_paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("VITE_MOMO_API_BASE_URL=") {
                        let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
                        if parts.len() == 2 {
                            let val = parts[1].trim().trim_matches('"').trim_matches('\'');
                            if !val.is_empty() {
                                return val.trim_end_matches('/').to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    DEFAULT_PROXY_BASE_URL.to_string()
}

fn get_encryption_key(app: &AppHandle) -> Option<String> {
    // 1. Check runtime environment variables
    if let Ok(key) = std::env::var("VITE_ENCRYPTION_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Ok(key) = std::env::var("ENCRYPTION_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    // 2. Check compile-time environment variable (if injected by build pipeline)
    if let Some(key) = option_env!("VITE_ENCRYPTION_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    // 3. Search local .env paths dynamically
    let candidate_paths = vec![
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
        PathBuf::from("cashu-app/.env"),
        PathBuf::from("../cashu-app/.env"),
        app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join(".env"),
    ];

    for path in candidate_paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("VITE_ENCRYPTION_KEY=") || trimmed.starts_with("ENCRYPTION_KEY=") {
                        let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
                        if parts.len() == 2 {
                            let val = parts[1].trim().trim_matches('"').trim_matches('\'');
                            if !val.is_empty() {
                                return Some(val.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn encrypt_transit_payload(payload: &serde_json::Value, key_b64: &str) -> Result<serde_json::Value> {
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(key_b64.trim())
        .context("Failed to base64-decode transit encryption key")?;

    if key_bytes.len() != 32 {
        anyhow::bail!("Invalid encryption key length: expected 32 bytes, got {}", key_bytes.len());
    }

    let mut iv = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut iv);

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Envelope structure expected by payment_backend (matching momo processor)
    let envelope = serde_json::json!({
        "payload": payload,
        "security": {
            "nonce": hex::encode(&iv[..8]),
            "timestamp": now_ms
        }
    });

    let plaintext = serde_json::to_string(&envelope)?;

    // Encrypt using AES-256-CBC with PKCS7 padding
    let cipher = Aes256CbcEnc::new_from_slices(&key_bytes, &iv)
        .map_err(|e| anyhow::anyhow!("Failed to initialize AES-256 cipher: {:?}", e))?;
    let ciphertext = cipher.encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes());
    let encrypted_b64 = base64::engine::general_purpose::STANDARD.encode(&ciphertext);

    // Compute HMAC-SHA256 over the plaintext string matching decryptRequest
    let mut mac = HmacSha256::new_from_slice(&key_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to initialize HMAC: {:?}", e))?;
    mac.update(plaintext.as_bytes());
    let hmac_hex = hex::encode(mac.finalize().into_bytes());

    Ok(serde_json::json!({
        "encrypted": encrypted_b64,
        "iv": hex::encode(iv),
        "hmac": hmac_hex,
        "timestamp": now_ms
    }))
}

async fn call_fixedfloat_proxy(
    app: &AppHandle,
    proxy_url: &str,
    endpoint: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value> {
    let url = format!("{}/fixedfloat/{}", proxy_url.trim_end_matches('/'), endpoint);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let req_builder = client.post(&url).header("Accept", "application/json");

    let maybe_key = get_encryption_key(app);
    let req_builder = if let Some(key) = maybe_key {
        let encrypted_payload = encrypt_transit_payload(payload, &key)?;
        req_builder
            .header("Content-Type", "application/json")
            .header("x-encrypted", "true")
            .json(&encrypted_payload)
    } else {
        req_builder
            .header("Content-Type", "application/json")
            .json(payload)
    };

    let resp = req_builder
        .send()
        .await
        .context("Failed to send request to FixedFloat backend proxy")?;

    let status = resp.status();
    let body_text = resp.text().await.context("Failed to read proxy response body")?;

    let json_resp: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|_| anyhow::anyhow!("Proxy returned non-JSON response (HTTP {}): {}", status, body_text))?;

    if !status.is_success() || json_resp.get("success").and_then(|s| s.as_bool()) == Some(false) {
        let err_msg = json_resp
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Backend proxy request failed");
        anyhow::bail!("{}: {}", status, err_msg);
    }

    Ok(json_resp.get("data").cloned().unwrap_or(json_resp))
}

async fn dispatch_fixedfloat_request(
    app: &AppHandle,
    state: &FixedFloatState,
    endpoint: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value> {
    let (api_key, api_secret) = load_credentials_from_env(app, state);
    if let (Some(k), Some(s)) = (api_key, api_secret) {
        // Direct call when user or local environment specifies direct API credentials
        call_fixedfloat_api(endpoint, payload, &k, &s).await
    } else {
        // Secure server-side proxy fallback (credentials held securely on server, zero secrets in binary)
        let proxy_url = get_proxy_base_url(app);
        call_fixedfloat_proxy(app, &proxy_url, endpoint, payload).await
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OnchainSendEstimate {
    pub amount: u64,
    pub ark_fee: u64, // Preserves same field name for seamless UI display (swap fee)
    pub cashu_fee: u64,
    pub total_cost: u64,
    pub bridging_invoice: String,
    pub order_id: Option<String>,
    pub order_token: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FixedFloatDepositResponse {
    pub address: String,
    pub amount_sats: u64,
    pub quote_id: String,
    pub order_id: String,
    pub order_token: String,
}

fn parse_json_f64(val: &serde_json::Value) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OnchainLimits {
    pub min_sats: u64,
    pub max_sats: u64,
}

#[tauri::command]
pub async fn fixedfloat_get_limits(
    app: AppHandle,
    state: State<'_, FixedFloatState>,
) -> Result<OnchainLimits, String> {
    let payload = serde_json::json!({
        "fromCcy": "BTCLN",
        "toCcy": "BTC",
        "amount": 0.001,
        "direction": "to",
        "type": "fixed"
    });

    match dispatch_fixedfloat_request(&app, &state, "price", &payload).await {
        Ok(data) => {
            let min_btc = parse_json_f64(&data["to"]["min"]).unwrap_or(0.000125);
            let max_btc = parse_json_f64(&data["to"]["max"]).unwrap_or(1.5);
            let min_sats = (min_btc * 100_000_000.0).round() as u64;
            let max_sats = (max_btc * 100_000_000.0).round() as u64;
            Ok(OnchainLimits { min_sats, max_sats })
        }
        Err(_) => {
            Ok(OnchainLimits {
                min_sats: 12_500,
                max_sats: 150_000_000,
            })
        }
    }
}

#[tauri::command]
pub async fn fixedfloat_get_credentials_status(app: AppHandle, state: State<'_, FixedFloatState>) -> Result<bool, String> {
    let (key, sec) = load_credentials_from_env(&app, &state);
    if key.is_some() && sec.is_some() {
        return Ok(true);
    }
    // Fully operational through secure server proxy when local keys are not set
    Ok(true)
}

#[tauri::command]
pub async fn fixedfloat_set_credentials(
    key: String,
    secret: String,
    state: State<'_, FixedFloatState>,
) -> Result<(), String> {
    *state.api_key.lock().unwrap() = Some(key.trim().to_string());
    *state.api_secret.lock().unwrap() = Some(secret.trim().to_string());
    Ok(())
}

#[tauri::command]
pub async fn fixedfloat_is_sending(state: State<'_, FixedFloatState>) -> Result<bool, String> {
    Ok(state.is_sending.load(std::sync::atomic::Ordering::SeqCst))
}

#[tauri::command]
pub async fn fixedfloat_estimate_onchain_send(
    address: String,
    amount_sats: u64,
    mint_url: String,
    app: AppHandle,
    state: State<'_, FixedFloatState>,
) -> Result<OnchainSendEstimate, String> {
    // Clean and validate bitcoin address
    let clean_addr = address.trim().strip_prefix("bitcoin:").unwrap_or(address.trim());
    let clean_addr = clean_addr.split('?').next().unwrap_or(clean_addr).trim();

    let btc_addr = match bitcoin::Address::from_str(clean_addr) {
        Ok(addr) => match addr.require_network(Network::Bitcoin) {
            Ok(checked_addr) => checked_addr,
            Err(_) => return Err("Swaps require a Bitcoin mainnet address (starting with 1, 3, or bc1)".to_string()),
        },
        Err(e) => return Err(format!("Invalid Bitcoin address: {}", e)),
    };

    let amount_btc = amount_sats as f64 / 100_000_000.0;

    // Call FixedFloat /api/v2/create with direction "to" (recipient gets exact amount)
    let payload = serde_json::json!({
        "fromCcy": "BTCLN",
        "toCcy": "BTC",
        "amount": amount_btc,
        "direction": "to",
        "toAddress": btc_addr.to_string(),
        "type": "fixed"
    });

    let data = dispatch_fixedfloat_request(&app, &state, "create", &payload)
        .await
        .map_err(|e| format!("FixedFloat create order failed: {}", e))?;

    let order_id = data["id"].as_str().map(|s| s.to_string());
    let order_token = data["token"].as_str().map(|s| s.to_string());
    let lightning_invoice = data["from"]["address"]
        .as_str()
        .ok_or_else(|| "FixedFloat did not return a Lightning invoice in from.address".to_string())?
        .to_string();

    let from_amount_btc = parse_json_f64(&data["from"]["amount"])
        .ok_or_else(|| format!("FixedFloat did not return a valid amount: {:?}", data["from"]["amount"]))?;

    let required_sats = (from_amount_btc * 100_000_000.0).round() as u64;
    let swap_fee = if required_sats > amount_sats {
        required_sats - amount_sats
    } else {
        0
    };

    // Get melt quote from Cashu mint
    let client = ecash_wallet::client::MintClient::new(&mint_url);
    let (_quote_id, fee_reserve, _total_melt) = client
        .request_melt_quote(&lightning_invoice)
        .await
        .map_err(|e| format!("Mint request_melt_quote failed: {}", e))?;

    let total_cost = required_sats + fee_reserve;

    Ok(OnchainSendEstimate {
        amount: amount_sats,
        ark_fee: swap_fee,
        cashu_fee: fee_reserve,
        total_cost,
        bridging_invoice: lightning_invoice,
        order_id,
        order_token,
    })
}

#[tauri::command]
pub async fn fixedfloat_execute_onchain_send(
    bridging_invoice: String,
    address: String,
    amount_sats: u64,
    mint_url: String,
    order_id: Option<String>,
    order_token: Option<String>,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, FixedFloatState>,
) -> Result<String, String> {
    state.is_sending.store(true, std::sync::atomic::Ordering::SeqCst);
    let _guard = SendingGuard(&state.is_sending);

    let tx_id = format!(
        "tx_onchain_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    // Phase 1: Hold wallet lock while melting proofs and recording the Pending SendOnchain transaction
    {
        let (mut wallet_guard, path, passphrase) = app_state
            .lock_and_get_wallet()
            .await
            .map_err(|e| e.0)?;
        let w_state = wallet_guard.as_mut().unwrap();

        let (sats_paid, _preimage) = ecash_wallet::pay_invoice(
            w_state,
            &path,
            &passphrase,
            &bridging_invoice,
            Some(mint_url.clone()),
        )
        .await
        .map_err(|e| format!("Failed to pay on-chain swap invoice from Cashu: {}", e))?;

        let cashu_fee = if let Some(last_tx) = w_state.transactions.last() {
            last_tx.fee
        } else {
            0
        };
        let swap_fee = if sats_paid > amount_sats {
            sats_paid - amount_sats
        } else {
            0
        };

        // Remove the generic Melt transaction added by pay_invoice to avoid misleading "Sent Lightning"
        if let Some(pos) = w_state
            .transactions
            .iter()
            .rposition(|t| matches!(t.tx_type, ecash_core::types::TransactionType::Melt(_)))
        {
            w_state.transactions.remove(pos);
        }

        // Add proper SendOnchain transaction with Pending status
        let pending_onchain_tx = ecash_core::types::Transaction {
            id: tx_id.clone(),
            tx_type: ecash_core::types::TransactionType::SendOnchain(
                ecash_core::types::SendOnchainTransactionData {
                    txid: None,
                    address: address.clone(),
                    amount: amount_sats,
                    ark_fee: swap_fee,
                    cashu_fee,
                    bridging_invoice: bridging_invoice.clone(),
                },
            ),
            amount: amount_sats,
            fee: swap_fee + cashu_fee,
            status: ecash_core::types::TransactionStatus::Pending,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url: mint_url.clone(),
        };
        w_state.transactions.insert(0, pending_onchain_tx);
        w_state
            .save_encrypted(&path, &passphrase)
            .map_err(|e| e.to_string())?;
    }

    // Phase 2: Poll FixedFloat order status WITHOUT holding the wallet lock
    let mut final_txid = None;

    if let (Some(id), Some(token)) = (order_id.clone(), order_token.clone()) {
        let poll_payload = serde_json::json!({ "id": id, "token": token });

        for _attempt in 1..=15 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            if let Ok(order_data) = dispatch_fixedfloat_request(&app, &state, "order", &poll_payload).await {
                let status = order_data["status"].as_str().unwrap_or("UNKNOWN");

                if let Some(txid_str) = order_data["to"]["tx"]["id"].as_str() {
                    if !txid_str.trim().is_empty() {
                        final_txid = Some(txid_str.to_string());
                        break;
                    }
                }
                if status == "DONE" || status == "WITHDRAW" {
                    if let Some(tx) = order_data["to"]["tx"].as_str() {
                        final_txid = Some(tx.to_string());
                        break;
                    }
                }
            }
        }
    }

    let returned_txid = final_txid
        .clone()
        .unwrap_or_else(|| order_id.unwrap_or_else(|| "pending".to_string()));

    // Phase 3: Re-acquire wallet lock to record txid and mark Success
    {
        let (mut wallet_guard, path, passphrase) = app_state
            .lock_and_get_wallet()
            .await
            .map_err(|e| e.0)?;
        let w_state = wallet_guard.as_mut().unwrap();
        if let Some(t) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
            t.status = ecash_core::types::TransactionStatus::Success;
            if let ecash_core::types::TransactionType::SendOnchain(ref mut data) = t.tx_type {
                data.txid = final_txid;
            }
        }
        w_state
            .save_encrypted(&path, &passphrase)
            .map_err(|e| e.to_string())?;
    }

    Ok(returned_txid)
}

#[tauri::command]
pub async fn fixedfloat_get_deposit_address(
    amount_sats: u64,
    mint_url: String,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, FixedFloatState>,
) -> Result<FixedFloatDepositResponse, String> {
    // Fail fast if wallet is locked
    let _ = app_state.get_passphrase().map_err(|e| e.0)?;

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);

    // 1. Request Cashu mint quote and keyset (lock-free network I/O)
    let client = ecash_wallet::client::MintClient::new(&mint_url);
    let (quote_id, invoice) = client
        .request_mint_quote(amount_sats)
        .await
        .map_err(|e| format!("Cashu request_mint_quote failed: {}", e))?;

    let keyset = client
        .fetch_keyset()
        .await
        .map_err(|e| format!("Failed to fetch keyset: {}", e))?;

    let amount_btc = amount_sats as f64 / 100_000_000.0;

    // 2. Call FixedFloat create order (from: BTC on-chain, to: BTCLN lightning invoice)
    let payload = serde_json::json!({
        "fromCcy": "BTC",
        "toCcy": "BTCLN",
        "amount": amount_btc,
        "direction": "to",
        "toAddress": invoice,
        "type": "fixed"
    });

    let data = dispatch_fixedfloat_request(&app, &state, "create", &payload)
        .await
        .map_err(|e| format!("FixedFloat create deposit order failed: {}", e))?;

    let btc_deposit_address = data["from"]["address"]
        .as_str()
        .ok_or_else(|| "FixedFloat did not return a Bitcoin address in from.address".to_string())?
        .to_string();

    let from_amount_btc = parse_json_f64(&data["from"]["amount"]).unwrap_or(amount_btc);
    let deposit_sats = (from_amount_btc * 100_000_000.0).round() as u64;

    let order_id = data["id"].as_str().unwrap_or("").to_string();
    let order_token = data["token"].as_str().unwrap_or("").to_string();

    // 3. Acquire wallet lock, derive blinding sessions, and persist Pending ReceiveOnchain transaction
    let desired_amounts = split_into_powers_of_2(amount_sats);
    {
        let (mut wallet_guard, path, passphrase) = app_state
            .lock_and_get_wallet()
            .await
            .map_err(|e| e.0)?;
        let w_state = wallet_guard.as_mut().unwrap();

        let max_proof_idx = w_state
            .proofs
            .values()
            .flat_map(|ps| ps.iter().map(|p| p.derivation_index))
            .max()
            .unwrap_or(0);
        if max_proof_idx > 0 && w_state.derivation_index <= max_proof_idx {
            w_state.derivation_index = max_proof_idx + 1;
        }

        let mut deriv = TokenDerivation::from_hex(&w_state.seed_hex)
            .map_err(|e| format!("Derivation error: {}", e))?;
        deriv.index = w_state.derivation_index;

        let mut sessions = Vec::new();
        let mut outputs = Vec::new();

        for &amt in &desired_amounts {
            let index = deriv.index;
            let sess = deriv.next_session();
            outputs.push(serde_json::json!({
                "amount": amt,
                "id": keyset.id,
                "B_": sess.b_prime_hex()
            }));
            sessions.push((amt, sess, index));
        }

        w_state.derivation_index = deriv.index;

        let pending_tx = Transaction {
            id: quote_id.clone(),
            tx_type: TransactionType::ReceiveOnchain(ReceiveOnchainTransactionData {
                address: btc_deposit_address.clone(),
                txid: None,
                quote_id: Some(quote_id.clone()),
                outputs,
                blinding_sessions_hex: sessions
                    .iter()
                    .map(|(_, sess, _)| sess.to_session_hex())
                    .collect(),
            }),
            amount: amount_sats,
            fee: 0,
            status: TransactionStatus::Pending,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            mint_url: mint_url.clone(),
        };

        w_state.transactions.insert(0, pending_tx);
        w_state
            .save_encrypted(&path, &passphrase)
            .map_err(|e| e.to_string())?;
    }

    Ok(FixedFloatDepositResponse {
        address: btc_deposit_address,
        amount_sats: deposit_sats,
        quote_id,
        order_id,
        order_token,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transit_encryption_format() {
        let payload = serde_json::json!({
            "fromCcy": "BTCLN",
            "toCcy": "BTC",
            "amount": 0.001
        });
        // Dummy 32-byte key for unit testing encryption format (zero hardcoded secrets)
        let dummy_key_bytes = [42u8; 32];
        let dummy_key = base64::engine::general_purpose::STANDARD.encode(dummy_key_bytes);
        let encrypted = encrypt_transit_payload(&payload, &dummy_key).expect("encryption should succeed");

        assert!(encrypted.get("encrypted").is_some());
        assert!(encrypted.get("iv").is_some());
        assert!(encrypted.get("hmac").is_some());
        assert!(encrypted.get("timestamp").is_some());

        let iv = encrypted["iv"].as_str().unwrap();
        assert_eq!(iv.len(), 32); // 16 bytes hex

        let hmac = encrypted["hmac"].as_str().unwrap();
        assert_eq!(hmac.len(), 64); // 32 bytes hex
    }
}
