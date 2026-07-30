use anyhow::{Result, Context};
use tauri::{AppHandle, Manager};

use tauri_plugin_store::StoreExt;
use serde::{Deserialize, Serialize};

use nostr_sdk::prelude::*;
use nostr_sdk::nips::nip47::{
    GetInfoResponse, Method, PayInvoiceResponse, Request, RequestParams, Response,
    ResponseResult,
};

use crate::commands::auth::AppState;
use ecash_wallet::WalletState;

use lightning_invoice::Bolt11Invoice as Invoice;
use std::str::FromStr;
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct PendingNwcRequest {
    pub event_id: String,
    pub invoice: String,
    pub amount_msats: u64,
    pub created_at: u64,
    pub raw_event: String,
}

const NWC_RELAYS: &[&str] = &[
    "wss://relay.primal.net",
    "wss://nos.lol",
    "wss://relay.getalby.com/v1",
];

#[tauri::command]
pub fn get_nwc_uri(app: tauri::AppHandle) -> Result<String, String> {
    let store = app.store("settings.bin").map_err(|e| e.to_string())?;
    
    let secret_hex = if let Some(val) = store.get("nwc_secret_key") {
        val.as_str().unwrap_or_default().to_string()
    } else {
        let key = SecretKey::generate();
        let hex = key.to_secret_hex();
        store.set("nwc_secret_key", serde_json::json!(hex));
        store.save().map_err(|e| e.to_string())?;
        hex
    };

    let secret_key = SecretKey::from_hex(&secret_hex).map_err(|e| e.to_string())?;
    let pubkey = Keys::new(secret_key).public_key();
    
    // NWC URI Format: nostr+walletconnect://<pubkey>?relay=<relay>&secret=<client_secret>
    // For a provider, we generate a random client secret for the connection if one doesn't exist.
    let client_secret_hex = if let Some(val) = store.get("nwc_client_secret") {
        val.as_str().unwrap_or_default().to_string()
    } else {
        let key = SecretKey::generate();
        let hex = key.to_secret_hex();
        store.set("nwc_client_secret", serde_json::json!(hex));
        store.save().map_err(|e| e.to_string())?;
        hex
    };

    let mut uri = format!("nostr+walletconnect://{}?", pubkey.to_string());
    for relay in NWC_RELAYS {
        uri.push_str(&format!("relay={}&", relay));
    }
    uri.push_str(&format!("secret={}", client_secret_hex));
    Ok(uri)
}

#[derive(Serialize, Deserialize)]
pub struct NwcConfig {
    mint_url: Option<String>,
    payment_limit_sats: Option<u64>,
}

#[tauri::command]
pub fn get_nwc_config(app: tauri::AppHandle) -> Result<NwcConfig, String> {
    let store = app.store("settings.bin").map_err(|e| e.to_string())?;
    let mint_url = store.get("nwc_mint_url").and_then(|v| v.as_str().map(|s| s.to_string()));
    let payment_limit_sats = store.get("nwc_payment_limit_sats").and_then(|v| v.as_u64());
    Ok(NwcConfig {
        mint_url,
        payment_limit_sats,
    })
}

#[tauri::command]
pub fn set_nwc_config(app: tauri::AppHandle, mint_url: Option<String>, limit_sats: Option<u64>) -> Result<(), String> {
    let store = app.store("settings.bin").map_err(|e| e.to_string())?;
    
    if let Some(url) = mint_url {
        store.set("nwc_mint_url", serde_json::json!(url));
    } else {
        store.delete("nwc_mint_url");
    }
    
    if let Some(limit) = limit_sats {
        store.set("nwc_payment_limit_sats", serde_json::json!(limit));
    } else {
        store.delete("nwc_payment_limit_sats");
    }
    
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_app_default_mint(app: tauri::AppHandle, mint_url: Option<String>) -> Result<(), String> {
    let store = app.store("settings.bin").map_err(|e| e.to_string())?;
    
    if let Some(url) = mint_url {
        store.set("app_default_mint", serde_json::json!(url));
    } else {
        store.delete("app_default_mint");
    }
    
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn enable_nwc(app: tauri::AppHandle) -> Result<bool, String> {
    // To enable NWC, we force "Remember Me" so the daemon can decrypt the wallet in the background.
    let state = app.state::<AppState>();
    let passphrase = { state.passphrase.lock().unwrap().clone() };
    if let Some(p) = passphrase {
        let store = app.store("auth.bin").map_err(|e| e.to_string())?;
        store.set("passphrase", serde_json::json!(p));
        store.save().map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Err("Wallet must be unlocked to enable NWC".to_string())
    }
}

#[tauri::command]
pub fn reset_nwc_keys(app: tauri::AppHandle) -> Result<String, String> {
    let store = app.store("settings.bin").map_err(|e| e.to_string())?;
    
    // Generate new provider keys
    let new_secret_key = SecretKey::generate();
    let new_hex = new_secret_key.to_secret_hex();
    store.set("nwc_secret_key", serde_json::json!(new_hex));
    
    // Generate new client secret
    let new_client_secret = SecretKey::generate();
    let new_client_hex = new_client_secret.to_secret_hex();
    store.set("nwc_client_secret", serde_json::json!(new_client_hex));
    
    store.save().map_err(|e| e.to_string())?;
    
    let pubkey = Keys::new(new_secret_key).public_key();
    let mut uri = format!("nostr+walletconnect://{}?", pubkey.to_string());
    for relay in NWC_RELAYS {
        uri.push_str(&format!("relay={}&", relay));
    }
    uri.push_str(&format!("secret={}&lud16=bitnotes@ecash.wallet", new_client_hex));
    
    Ok(uri)
}

#[tauri::command]
pub fn get_pending_nwc_requests(state: State<'_, AppState>) -> Result<Vec<PendingNwcRequest>, String> {
    let queue = state.pending_nwc_requests.lock().unwrap();
    Ok(queue.clone())
}

async fn create_temp_nwc_client(app: &AppHandle) -> Result<(Client, Keys)> {
    let store = app.store("settings.bin")?;
    let secret_key = if let Some(val) = store.get("nwc_secret_key") {
        let hex = val.as_str().context("nwc_secret_key must be a string")?;
        SecretKey::from_hex(hex)?
    } else {
        return Err(anyhow::anyhow!("NWC not initialized"));
    };
    
    let keys = Keys::new(secret_key);
    let client = Client::new(keys.clone());
    for relay in NWC_RELAYS {
        let _ = client.add_relay(*relay).await;
    }
    client.connect().await;
    Ok((client, keys))
}

#[tauri::command]
pub async fn approve_nwc_request(event_id: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let pending_req = {
        let mut queue = state.pending_nwc_requests.lock().unwrap();
        let idx = queue.iter().position(|r| r.event_id == event_id).ok_or_else(|| "Request not found".to_string())?;
        queue.remove(idx)
    };
    
    // Pay the invoice
    match handle_pay_invoice(&app, &pending_req.invoice).await {
        Ok(preimage) => {
            // Send NIP-47 response
            if let Ok(event) = serde_json::from_str::<Event>(&pending_req.raw_event) {
                if let Ok((client, keys)) = create_temp_nwc_client(&app).await {
                    let resp = Response {
                        result_type: Method::PayInvoice,
                        error: None,
                        result: Some(ResponseResult::PayInvoice(PayInvoiceResponse {
                            preimage,
                            fees_paid: Some(0),
                        })),
                    };
                    let _ = send_nip47_response(&client, &keys, &event, resp).await;
                }
            }
            use tauri::Emitter;
            let _ = app.emit("nwc_queue_updated", ());
            Ok(())
        },
        Err(e) => {
            if let Ok(event) = serde_json::from_str::<Event>(&pending_req.raw_event) {
                if let Ok((client, keys)) = create_temp_nwc_client(&app).await {
                    let _ = send_nip47_error(&client, &keys, &event, Method::PayInvoice, "PAYMENT_FAILED", &e.to_string()).await;
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn reject_nwc_request(event_id: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let pending_req = {
        let mut queue = state.pending_nwc_requests.lock().unwrap();
        let idx = queue.iter().position(|r| r.event_id == event_id).ok_or_else(|| "Request not found".to_string())?;
        queue.remove(idx)
    };
    
    if let Ok(event) = serde_json::from_str::<Event>(&pending_req.raw_event) {
        if let Ok((client, keys)) = create_temp_nwc_client(&app).await {
            let _ = send_nip47_error(&client, &keys, &event, Method::PayInvoice, "UNAUTHORIZED", "User rejected the request").await;
        }
    }
    
    use tauri::Emitter;
    let _ = app.emit("nwc_queue_updated", ());
    Ok(())
}

pub async fn spawn_nwc_listener(app: AppHandle) -> Result<()> {
    // Attempt to load the NWC keys from the store.
    let store = app.store("settings.bin")?;
    
    let secret_key = if let Some(val) = store.get("nwc_secret_key") {
        let hex = val.as_str().context("nwc_secret_key must be a string")?;
        SecretKey::from_hex(hex)?
    } else {
        let key = SecretKey::generate();
        store.set("nwc_secret_key", serde_json::json!(key.to_secret_hex()));
        store.save()?;
        key
    };

    let keys = Keys::new(secret_key);
    let pubkey = keys.public_key();
    
    let client = Client::new(keys.clone());
    for relay in NWC_RELAYS {
        let _ = client.add_relay(*relay).await;
    }
    client.connect().await;

    // Fetch last sync time
    let mut last_sync: u64 = 0;
    if let Some(val) = store.get("last_nwc_sync_time") {
        if let Some(t) = val.as_u64() {
            last_sync = t;
        }
    }
    let since_timestamp = if last_sync > 0 {
        Timestamp::from_secs(last_sync)
    } else {
        Timestamp::now()
    };

    // We only care about NIP-47 requests sent to our pubkey.
    let filter = Filter::new()
        .pubkey(pubkey)
        .kind(Kind::WalletConnectRequest)
        .since(since_timestamp);
    client.subscribe(filter, None).await?;

    println!("NWC Listener started on pubkey {}", pubkey.to_bech32()?);

    let app_handle = app.clone();
    
    tokio::spawn(async move {
        let mut processed_events = std::collections::HashSet::new();
        let mut notifications = client.notifications();
        
        while let Ok(notification) = notifications.recv().await {
            if let RelayPoolNotification::Event { event, .. } = notification {
                if event.kind == Kind::WalletConnectRequest {
                    if !processed_events.insert(event.id.to_hex()) {
                        continue;
                    }
                    
                    if event.created_at.as_secs() > last_sync {
                        last_sync = event.created_at.as_secs();
                        if let Ok(store) = app_handle.store("settings.bin") {
                            store.set("last_nwc_sync_time", serde_json::json!(last_sync));
                            let _ = store.save();
                        }
                    }
                    
                    let req = match nip47_request_from_event(&keys, &event) {
                        Ok(r) => r,
                        Err(e) => {
                            eprintln!("Failed to parse NIP-47 request: {}", e);
                            continue;
                        }
                    };
                    
                    println!("Received NWC method: {:?}", req.method);
                    
                    if req.method == Method::PayInvoice {
                        if let RequestParams::PayInvoice(params) = req.params {
                            let invoice = params.invoice;
                            let created_at_secs = event.created_at.as_secs();
                            let now_secs = Timestamp::now().as_secs();
                            
                            // If delayed > 5 mins (300 secs)
                            if now_secs.saturating_sub(created_at_secs) > 300 {
                                let amount_msats = match Invoice::from_str(&invoice) {
                                    Ok(inv) => inv.amount_milli_satoshis().unwrap_or(0),
                                    Err(_) => 0,
                                };
                                
                                let pending = PendingNwcRequest {
                                    event_id: event.id.to_hex(),
                                    invoice: invoice.clone(),
                                    amount_msats,
                                    created_at: created_at_secs,
                                    raw_event: serde_json::to_string(&event).unwrap_or_default(),
                                };
                                
                                let state = app_handle.state::<AppState>();
                                {
                                    let mut queue = state.pending_nwc_requests.lock().unwrap();
                                    queue.push(pending);
                                }
                                
                                use tauri::Emitter;
                                let _ = app_handle.emit("nwc_delayed_request_added", ());
                                continue;
                            }
                            
                            match handle_pay_invoice(&app_handle, &invoice).await {
                                Ok(preimage) => {
                                    // Send success response
                                    let resp = Response {
                                        result_type: Method::PayInvoice,
                                        error: None,
                                        result: Some(ResponseResult::PayInvoice(PayInvoiceResponse {
                                            preimage,
                                            fees_paid: Some(0),
                                        })),
                                    };
                                    let _ = send_nip47_response(&client, &keys, &event, resp).await;
                                }
                                Err(e) => {
                                    eprintln!("NWC PayInvoice error: {}", e);
                                    // Send error response
                                    let _ = send_nip47_error(&client, &keys, &event, Method::PayInvoice, "PAYMENT_FAILED", &e.to_string()).await;
                                }
                            }
                        }
                    } else if req.method == Method::GetInfo {
                        let resp = Response {
                            result_type: Method::GetInfo,
                            error: None,
                            result: Some(ResponseResult::GetInfo(GetInfoResponse {
                                alias: Some("BitNotes Wallet".to_string()),
                                color: Some("#ffffff".to_string()),
                                pubkey: Some(pubkey.to_string()),
                                network: Some("mainnet".to_string()),
                                block_height: None,
                                block_hash: None,
                                methods: vec![Method::PayInvoice, Method::GetInfo, Method::GetBalance, Method::ListTransactions],
                                notifications: vec![],
                            })),
                        };
                        let _ = send_nip47_response(&client, &keys, &event, resp).await;
                    } else if req.method == Method::GetBalance {
                        let mut real_balance = 0;
                        if let Ok(wallet) = get_wallet_state(&app_handle) {
                            real_balance = wallet.total_balance() * 1000; // msats
                        }
                        
                        let mut limit_msats = 1_000_000_000_000u64; // 1M sats default limit
                        if let Ok(store) = app_handle.store("settings.bin") {
                            if let Some(limit_val) = store.get("nwc_payment_limit_sats") {
                                if let Some(limit) = limit_val.as_u64() {
                                    limit_msats = limit * 1000;
                                }
                            }
                        }

                        let custom_resp = serde_json::json!({
                            "result_type": "get_balance",
                            "error": null,
                            "result": {
                                "balance": real_balance,
                                "max_amount": limit_msats,
                                "budget_renewal": "never"
                            }
                        });
                        let _ = send_nip47_json_response(&client, &keys, &event, custom_resp.to_string()).await;
                    } else if req.method == Method::ListTransactions {
                        let mut txs = Vec::new();
                        if let Ok(wallet) = get_wallet_state(&app_handle) {
                            let mut sorted_txs = wallet.transactions.clone();
                            sorted_txs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
                            
                            for tx in sorted_txs.iter().take(50) { // Limit to 50
                                let tx_type = match tx.tx_type {
                                    ecash_core::types::TransactionType::Mint(_) => "incoming",
                                    ecash_core::types::TransactionType::ReceiveLightning(_) => "incoming",
                                    ecash_core::types::TransactionType::ReceiveEcash(_) => "incoming",
                                    ecash_core::types::TransactionType::Melt(_) => "outgoing",
                                    ecash_core::types::TransactionType::Send(_) => "outgoing",
                                    ecash_core::types::TransactionType::Issue(_) => "incoming",
                                    ecash_core::types::TransactionType::Redeem(_) => "incoming",
                                };
                                
                                let desc = match tx.tx_type {
                                    ecash_core::types::TransactionType::Mint(_) => "Minted from Lightning",
                                    ecash_core::types::TransactionType::ReceiveLightning(_) => "Received Lightning",
                                    ecash_core::types::TransactionType::ReceiveEcash(_) => "Received eCash",
                                    ecash_core::types::TransactionType::Melt(_) => "Paid Lightning Invoice",
                                    ecash_core::types::TransactionType::Send(_) => "Sent eCash",
                                    ecash_core::types::TransactionType::Issue(_) => "Issued eCash",
                                    ecash_core::types::TransactionType::Redeem(_) => "Redeemed eCash",
                                };

                                txs.push(serde_json::json!({
                                    "type": tx_type,
                                    "invoice": null,
                                    "description": desc,
                                    "description_hash": null,
                                    "preimage": null,
                                    "payment_hash": tx.id.clone(),
                                    "amount": tx.amount * 1000,
                                    "fees_paid": tx.fee * 1000,
                                    "created_at": tx.timestamp,
                                    "expires_at": null,
                                    "settled_at": tx.timestamp,
                                    "metadata": {}
                                }));
                            }
                        }

                        let custom_resp = serde_json::json!({
                            "result_type": "list_transactions",
                            "error": null,
                            "result": {
                                "transactions": txs
                            }
                        });
                        let _ = send_nip47_json_response(&client, &keys, &event, custom_resp.to_string()).await;
                    } else {
                        eprintln!("Unsupported NWC method: {:?}", req.method);
                        let _ = send_nip47_error(&client, &keys, &event, req.method, "NOT_IMPLEMENTED", "Method not supported").await;
                    }
                }
            }
        }
    });

    Ok(())
}

fn nip47_request_from_event(keys: &Keys, event: &Event) -> Result<Request> {
    // In nip47, the request is encrypted with NIP-04 from the client's pubkey to our pubkey.
    let decrypted = nostr_sdk::nips::nip04::decrypt(keys.secret_key(), &event.pubkey, &event.content)?;
    let req: Request = serde_json::from_str(&decrypted)?;
    Ok(req)
}

async fn send_nip47_response(client: &Client, keys: &Keys, req_event: &Event, resp: Response) -> Result<()> {
    let content = serde_json::to_string(&resp)?;
    send_nip47_json_response(client, keys, req_event, content).await
}

async fn send_nip47_json_response(client: &Client, keys: &Keys, req_event: &Event, content: String) -> Result<()> {
    let encrypted = nostr_sdk::nips::nip04::encrypt(keys.secret_key(), &req_event.pubkey, content)?;
    let event = EventBuilder::new(Kind::WalletConnectResponse, encrypted)
        .tag(Tag::public_key(req_event.pubkey))
        .tag(Tag::event(req_event.id))
        .sign_with_keys(keys)?;
    
    client.send_event(&event).await?;
    Ok(())
}

async fn send_nip47_error(client: &Client, keys: &Keys, req_event: &Event, method: Method, code: &str, message: &str) -> Result<()> {
    let error_code = match code {
        "RATE_LIMITED" => nostr_sdk::nips::nip47::ErrorCode::RateLimited,
        "NOT_IMPLEMENTED" => nostr_sdk::nips::nip47::ErrorCode::NotImplemented,
        "INSUFFICIENT_BALANCE" => nostr_sdk::nips::nip47::ErrorCode::InsufficientBalance,
        "QUOTA_EXCEEDED" => nostr_sdk::nips::nip47::ErrorCode::QuotaExceeded,
        "RESTRICTED" => nostr_sdk::nips::nip47::ErrorCode::Restricted,
        "UNAUTHORIZED" => nostr_sdk::nips::nip47::ErrorCode::Unauthorized,
        "INTERNAL" => nostr_sdk::nips::nip47::ErrorCode::Internal,
        "OTHER" => nostr_sdk::nips::nip47::ErrorCode::Other,
        _ => nostr_sdk::nips::nip47::ErrorCode::PaymentFailed,
    };

    let resp = Response {
        result_type: method,
        error: Some(nostr_sdk::nips::nip47::NIP47Error {
            code: error_code,
            message: message.to_string(),
        }),
        result: None,
    };
    send_nip47_response(client, keys, req_event, resp).await
}

async fn handle_pay_invoice(app: &AppHandle, invoice: &str) -> Result<String> {
    let parsed_invoice = Invoice::from_str(invoice).map_err(|e| anyhow::anyhow!("Invalid invoice: {}", e))?;
    let amount_msats = parsed_invoice.amount_milli_satoshis().ok_or_else(|| anyhow::anyhow!("Invoice has no amount"))?;
    let amount_sats = amount_msats / 1000;
    
    // Check config
    let mut selected_mint: Option<String> = None;
    if let Ok(store) = app.store("settings.bin") {
        if let Some(limit_val) = store.get("nwc_payment_limit_sats") {
            if let Some(limit) = limit_val.as_u64() {
                if amount_sats > limit {
                    return Err(anyhow::anyhow!("Payment exceeds NWC spend limit"));
                }
            }
        }
        
        if let Some(mint_val) = store.get("nwc_mint_url") {
            if let Some(mint) = mint_val.as_str() {
                selected_mint = Some(mint.to_string());
            }
        }
        
        // If no explicit NWC mint is set, use the app's default mint
        if selected_mint.is_none() {
            if let Some(default_val) = store.get("app_default_mint") {
                if let Some(mint) = default_val.as_str() {
                    selected_mint = Some(mint.to_string());
                }
            }
        }
    }
    
    let state = app.state::<AppState>();
    
    // 1. Try to get passphrase from memory
    let mut passphrase = state.passphrase.lock().unwrap().clone();
    
    // 2. If missing, try to get from store (auth.bin)
    if passphrase.is_none() {
        if let Ok(store) = app.store("auth.bin") {
            if let Some(val) = store.get("passphrase") {
                if let Some(s) = val.as_str() {
                    passphrase = Some(s.to_string());
                }
            }
        }
    }
    
    let passphrase = passphrase.ok_or_else(|| anyhow::anyhow!("Wallet is locked and Remember Me is disabled"))?;
    let path = state.wallet_path.clone();
    
    // Execute payment holding the wallet lock
    let mut wallet = WalletState::load_encrypted(&path, &passphrase)?;
    // pay_invoice now returns (sats, preimage).
    let (_sats, preimage) = ecash_wallet::pay_invoice(&mut wallet, &path, &passphrase, invoice, selected_mint).await?;
    
    Ok(preimage)
}

fn get_wallet_state(app: &tauri::AppHandle) -> Result<WalletState> {
    let state = app.state::<AppState>();
    
    // Try to get passphrase from memory
    let mut passphrase = state.passphrase.lock().unwrap().clone();
    
    // If missing, try to get from store
    if passphrase.is_none() {
        if let Ok(store) = app.store("auth.bin") {
            if let Some(val) = store.get("passphrase") {
                if let Some(s) = val.as_str() {
                    passphrase = Some(s.to_string());
                }
            }
        }
    }
    
    let passphrase = passphrase.ok_or_else(|| anyhow::anyhow!("Wallet is locked"))?;
    let path = state.wallet_path.clone();
    
    WalletState::load_encrypted(&path, &passphrase).map_err(|e| anyhow::anyhow!(e))
}
