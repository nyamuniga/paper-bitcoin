use crate::commands::auth::AppState;
use crate::error::{CommandError, CommandResult};
use bitcoin::{Address, Network};
use ecash_core::derivation::TokenDerivation;
use ecash_core::types::{
    split_into_powers_of_2, ReceiveOnchainTransactionData, SendOnchainTransactionData, Transaction,
    TransactionStatus, TransactionType,
};
use ecash_wallet::client::MintClient;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

fn spark_store_context_key(app: &AppHandle) -> String {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "bitnotes-spark-store".to_string())
}

pub struct SparkState {
    pub api_key: Mutex<Option<String>>,
    pub is_sending: AtomicBool,
}

impl SparkState {
    pub fn new() -> Self {
        Self {
            api_key: Mutex::new(None),
            is_sending: AtomicBool::new(false),
        }
    }
}

pub struct SendingGuard<'a>(&'a AtomicBool);
impl<'a> Drop for SendingGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn read_dotenv_keys(app: &AppHandle) -> Option<String> {
    let mut candidates = vec![
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
        PathBuf::from("cashu-app/.env"),
        PathBuf::from("../cashu-app/.env"),
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".env"),
        app.path()
            .resource_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".env"),
    ];
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors().take(5) {
            candidates.push(ancestor.join(".env"));
            candidates.push(ancestor.join("cashu-app").join(".env"));
        }
    }
    for path in candidates {
        if let Ok(contents) = std::fs::read_to_string(&path) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = line.split_once('=') {
                    let k = k.trim();
                    let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
                    if matches!(
                        k,
                        "BREEZE_API_KEY"
                            | "VITE_BREEZE_API_KEY"
                            | "BREEZ_API_KEY"
                            | "VITE_BREEZ_API_KEY"
                            | "BREEZE_KEY"
                            | "VITE_BREEZE_KEY"
                    ) && !v.is_empty()
                    {
                        return Some(v);
                    }
                }
            }
        }
    }
    None
}

pub fn load_breez_api_key(app: &AppHandle, state: &SparkState) -> Option<String> {
    if let Ok(guard) = state.api_key.lock() {
        if let Some(ref k) = *guard {
            if !k.trim().is_empty() {
                return Some(k.clone());
            }
        }
    }

    if let Ok(store) = app.store("settings.bin") {
        let ctx = spark_store_context_key(app);
        if let Some(enc) = store.get("breez_api_key_enc") {
            let nonce = enc.get("nonce").and_then(|v| v.as_str());
            let ciphertext = enc.get("ciphertext").and_then(|v| v.as_str());
            if let (Some(n), Some(c)) = (nonce, ciphertext) {
                if let Ok(k) = ecash_wallet::state::decrypt_local_secret(n, c, &ctx) {
                    if !k.trim().is_empty() {
                        return Some(k);
                    }
                }
            }
        }
    }

    for env_name in [
        "BREEZE_API_KEY",
        "VITE_BREEZE_API_KEY",
        "BREEZ_API_KEY",
        "VITE_BREEZ_API_KEY",
        "BREEZE_KEY",
        "VITE_BREEZE_KEY",
    ] {
        if let Ok(val) = std::env::var(env_name) {
            if !val.trim().is_empty() {
                return Some(val);
            }
        }
    }

    if let Some(val) = option_env!("BREEZE_API_KEY")
        .or(option_env!("VITE_BREEZE_API_KEY"))
        .or(option_env!("BREEZ_API_KEY"))
        .or(option_env!("VITE_BREEZ_API_KEY"))
        .or(option_env!("BREEZE_KEY"))
        .or(option_env!("VITE_BREEZE_KEY"))
    {
        if !val.trim().is_empty() {
            return Some(val.to_string());
        }
    }

    if let Some(dotenv_key) = read_dotenv_keys(app) {
        return Some(dotenv_key);
    }

    None
}

fn derive_spark_mnemonic(w_state: &ecash_wallet::WalletState) -> Result<String, CommandError> {
    if let Some(ref phrase) = w_state.mnemonic {
        let trimmed = phrase.trim();
        if !trimmed.is_empty() && bip39::Mnemonic::from_str(trimmed).is_ok() {
            return Ok(trimmed.to_string());
        }
    }

    let mut seed_bytes = hex::decode(&w_state.seed_hex)
        .map_err(|e| CommandError(format!("Invalid wallet seed hex: {}", e)))?;
    let mut entropy: [u8; 32] = if seed_bytes.len() >= 32 {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&seed_bytes[..32]);
        arr
    } else {
        let mut hasher = Sha256::new();
        hasher.update(&seed_bytes);
        hasher.finalize().into()
    };

    let mnemonic_res = bip39::Mnemonic::from_entropy(&entropy)
        .map_err(|e| CommandError(format!("Failed to derive Spark mnemonic: {}", e)));

    seed_bytes.fill(0);
    entropy.fill(0);

    Ok(mnemonic_res?.to_string())
}

fn derive_wallet_id(w_state: &ecash_wallet::WalletState) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"bitnotes-spark-wallet-id:");
    hasher.update(w_state.seed_hex.as_bytes());
    let digest = hasher.finalize();
    hex::encode(&digest[..8])
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SparkConfigResponse {
    pub api_key: Option<String>,
    pub network: String,
    pub mnemonic: String,
    pub wallet_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OnchainLimits {
    pub min_sats: u64,
    pub max_sats: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CashuMeltQuoteResponse {
    pub quote_id: String,
    pub cashu_fee: u64,
    pub total_melt: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MeltToSparkResponse {
    pub tx_id: String,
    pub sats_paid: u64,
    pub cashu_fee: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PrepareOnchainReceiveResponse {
    pub tx_id: String,
    pub address: String,
    pub amount_sats: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PrepareMintFromSparkResponse {
    pub tx_id: String,
    pub quote_id: String,
    pub invoice: String,
    pub amount_sats: u64,
}

#[tauri::command]
pub async fn spark_get_config(
    app: AppHandle,
    state: State<'_, AppState>,
    spark_state: State<'_, SparkState>,
) -> CommandResult<SparkConfigResponse> {
    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();
    let mnemonic = derive_spark_mnemonic(w_state)?;
    let wallet_id = derive_wallet_id(w_state);
    drop(wallet_guard);

    let api_key = load_breez_api_key(&app, &spark_state);
    Ok(SparkConfigResponse {
        api_key,
        network: "mainnet".to_string(),
        mnemonic,
        wallet_id,
    })
}

#[tauri::command]
pub async fn spark_set_credentials(
    app: AppHandle,
    api_key: String,
    spark_state: State<'_, SparkState>,
) -> CommandResult<bool> {
    let clean_key = api_key.trim().to_string();
    if let Ok(mut k) = spark_state.api_key.lock() {
        *k = if clean_key.is_empty() {
            None
        } else {
            Some(clean_key.clone())
        };
    }

    if let Ok(store) = app.store("settings.bin") {
        store.delete("breez_api_key");
        if clean_key.is_empty() {
            store.delete("breez_api_key_enc");
        } else {
            let ctx = spark_store_context_key(&app);
            if let Ok((nonce, ciphertext)) =
                ecash_wallet::state::encrypt_local_secret(&clean_key, &ctx)
            {
                store.set(
                    "breez_api_key_enc",
                    serde_json::json!({
                        "nonce": nonce,
                        "ciphertext": ciphertext,
                    }),
                );
            }
        }
        let _ = store.save();
    }

    Ok(true)
}

#[tauri::command]
pub async fn spark_get_limits() -> CommandResult<OnchainLimits> {
    Ok(OnchainLimits {
        min_sats: 2_500,
        max_sats: 100_000_000,
    })
}

#[tauri::command]
pub async fn spark_is_sending(spark_state: State<'_, SparkState>, state: State<'_, AppState>) -> CommandResult<bool> {
    let (guard, _, _) = state.lock_and_get_wallet().await?;
    Ok(spark_state.is_sending.load(Ordering::SeqCst) || guard.as_ref().unwrap().stable_operations.iter().any(|o| o.active()))
}

#[tauri::command]
pub async fn spark_validate_address(address: String) -> CommandResult<String> {
    let clean_address = address
        .trim()
        .strip_prefix("bitcoin:")
        .or_else(|| address.trim().strip_prefix("BITCOIN:"))
        .unwrap_or(address.trim())
        .split('?')
        .next()
        .unwrap_or(address.trim())
        .trim()
        .to_string();

    let parsed = Address::from_str(&clean_address)
        .map_err(|e| CommandError(format!("Invalid Bitcoin address: {}", e)))?;

    parsed
        .require_network(Network::Bitcoin)
        .map_err(|_| {
            CommandError(
                "Swaps require a Bitcoin mainnet address (starting with 1, 3, or bc1)".to_string(),
            )
        })?;

    Ok(clean_address)
}

#[tauri::command]
pub async fn spark_quote_cashu_melt(
    bridging_invoice: String,
    mint_url: String,
) -> CommandResult<CashuMeltQuoteResponse> {
    let normalized_mint = ecash_wallet::state::normalize_mint_url(&mint_url);
    let mint_client = MintClient::new(&normalized_mint);
    let (quote_id, fee_reserve, total_melt) = mint_client
        .request_melt_quote(&bridging_invoice)
        .await
        .map_err(|e| CommandError(format!("Failed to get Cashu melt quote: {}", e)))?;

    Ok(CashuMeltQuoteResponse {
        quote_id,
        cashu_fee: fee_reserve,
        total_melt,
    })
}

#[tauri::command]
pub async fn spark_melt_to_spark(
    bridging_invoice: String,
    address: String,
    amount_sats: u64,
    spark_fee_sats: u64,
    mint_url: String,
    state: State<'_, AppState>,
    spark_state: State<'_, SparkState>,
) -> CommandResult<MeltToSparkResponse> {
    let clean_address = spark_validate_address(address).await?;
    let normalized_mint = ecash_wallet::state::normalize_mint_url(&mint_url);
    spark_state.is_sending.store(true, Ordering::SeqCst);

    let (mut wallet_guard, path, passphrase) = match state.lock_and_get_wallet().await {
        Ok(res) => res,
        Err(e) => {
            spark_state.is_sending.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let w_state = wallet_guard.as_mut().unwrap();

    if w_state.stable_operations.iter().any(|o| o.active()) {
        spark_state.is_sending.store(false, Ordering::SeqCst);
        return Err(CommandError("Finish the stable balance conversion first.".into()));
    }

    let (sats_paid, _preimage) = match ecash_wallet::pay_invoice(
        w_state,
        &path,
        &passphrase,
        &bridging_invoice,
        Some(normalized_mint.clone()),
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            spark_state.is_sending.store(false, Ordering::SeqCst);
            return Err(CommandError(format!(
                "Failed to pay Spark bridge invoice from Cashu: {}",
                e
            )));
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut cashu_fee = 0;
    if let Some(pos) = w_state
        .transactions
        .iter()
        .position(|t| matches!(t.tx_type, TransactionType::Melt(_)))
    {
        cashu_fee = w_state.transactions[pos].fee;
        w_state.transactions.remove(pos);
    }

    let tx_id = format!(
        "tx_onchain_{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let pending_onchain_tx = Transaction {
        id: tx_id.clone(),
        tx_type: TransactionType::SendOnchain(SendOnchainTransactionData {
            txid: None,
            address: clean_address,
            amount: amount_sats,
            ark_fee: spark_fee_sats,
            cashu_fee,
            bridging_invoice,
        }),
        amount: amount_sats,
        fee: spark_fee_sats + cashu_fee,
        status: TransactionStatus::Pending,
        timestamp: now,
        mint_url: normalized_mint,
    };

    w_state.transactions.insert(0, pending_onchain_tx);

    if let Err(e) = w_state.save_encrypted(&path, &passphrase) {
        spark_state.is_sending.store(false, Ordering::SeqCst);
        return Err(CommandError(e.to_string()));
    }

    Ok(MeltToSparkResponse {
        tx_id,
        sats_paid,
        cashu_fee,
    })
}

#[tauri::command]
pub async fn spark_topup_for_send(
    topup_invoice: String,
    mint_url: String,
    state: State<'_, AppState>,
) -> CommandResult<MeltToSparkResponse> {
    let normalized_mint = ecash_wallet::state::normalize_mint_url(&mint_url);
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    let (sats_paid, _preimage) = ecash_wallet::pay_invoice(
        w_state,
        &path,
        &passphrase,
        &topup_invoice,
        Some(normalized_mint),
    )
    .await
    .map_err(|e| CommandError(format!("Failed to top up Spark fee buffer from Cashu: {}", e)))?;

    let mut cashu_fee = 0;
    if let Some(pos) = w_state
        .transactions
        .iter()
        .position(|t| matches!(t.tx_type, TransactionType::Melt(_)))
    {
        cashu_fee = w_state.transactions[pos].fee;
        w_state.transactions.remove(pos);
    }

    w_state.save_encrypted(&path, &passphrase)?;

    Ok(MeltToSparkResponse {
        tx_id: String::new(),
        sats_paid,
        cashu_fee,
    })
}

#[tauri::command]
pub async fn spark_finalize_onchain_send(
    tx_id: String,
    txid: Option<String>,
    final_spark_fee_sats: Option<u64>,
    cashu_fee_sats: Option<u64>,
    failed: Option<bool>,
    state: State<'_, AppState>,
    spark_state: State<'_, SparkState>,
) -> CommandResult<bool> {
    let _guard = SendingGuard(&spark_state.is_sending);
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
        if failed.unwrap_or(false) {
            tx.status = TransactionStatus::Failed;
        } else {
            tx.status = TransactionStatus::Success;
            if let (Some(sf), Some(cf)) = (final_spark_fee_sats, cashu_fee_sats) {
                tx.fee = sf + cf;
            }
            if let TransactionType::SendOnchain(ref mut data) = tx.tx_type {
                if let Some(sf) = final_spark_fee_sats {
                    data.ark_fee = sf;
                }
                if txid.is_some() {
                    data.txid = txid;
                }
            }
        }
        w_state.save_encrypted(&path, &passphrase)?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn spark_prepare_onchain_receive(
    address: String,
    amount_sats: u64,
    mint_url: String,
    state: State<'_, AppState>,
) -> CommandResult<PrepareOnchainReceiveResponse> {
    let normalized_mint = ecash_wallet::state::normalize_mint_url(&mint_url);
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Some(existing) = w_state.transactions.iter_mut().find(|tx| {
        tx.status == TransactionStatus::Pending
            && matches!(
                &tx.tx_type,
                TransactionType::ReceiveOnchain(d)
                    if (d.address == address || d.address == "spark-onchain-bridge") && d.txid.is_none()
            )
    }) {
        existing.amount = amount_sats;
        existing.mint_url = normalized_mint;
        existing.timestamp = now;
        if let TransactionType::ReceiveOnchain(ref mut d) = existing.tx_type {
            d.address = address.clone();
        }
        let existing_id = existing.id.clone();
        // Clean up any other duplicate pending ReceiveOnchain entries without a txid
        w_state.transactions.retain(|tx| {
            tx.id == existing_id
                || tx.status != TransactionStatus::Pending
                || !matches!(&tx.tx_type, TransactionType::ReceiveOnchain(d) if d.txid.is_none())
        });
        w_state.save_encrypted(&path, &passphrase)?;
        return Ok(PrepareOnchainReceiveResponse {
            tx_id: existing_id,
            address,
            amount_sats,
        });
    }

    let tx_id = format!("tx_receive_onchain_{}", now);
    w_state.transactions.insert(
        0,
        Transaction {
            id: tx_id.clone(),
            tx_type: TransactionType::ReceiveOnchain(ReceiveOnchainTransactionData {
                address: address.clone(),
                txid: None,
                quote_id: None,
                outputs: Vec::new(),
                blinding_sessions_hex: Vec::new(),
            }),
            amount: amount_sats,
            fee: 0,
            status: TransactionStatus::Pending,
            timestamp: now,
            mint_url: normalized_mint,
        },
    );

    w_state.save_encrypted(&path, &passphrase)?;

    Ok(PrepareOnchainReceiveResponse {
        tx_id,
        address,
        amount_sats,
    })
}

#[tauri::command]
pub async fn spark_prepare_mint_from_spark(
    amount_sats: u64,
    mint_url: Option<String>,
    tx_id: Option<String>,
    txid: Option<String>,
    address: Option<String>,
    fee_sats: Option<u64>,
    state: State<'_, AppState>,
) -> CommandResult<PrepareMintFromSparkResponse> {
    if amount_sats == 0 {
        return Err(CommandError("Sweep amount must be greater than 0".to_string()));
    }

    let resolved_mint_url = {
        let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
        let w_state = wallet_guard.as_ref().unwrap();
        let raw_mint = mint_url
            .filter(|m| !m.trim().is_empty())
            .or_else(|| {
                tx_id.as_ref().and_then(|id| {
                    w_state
                        .transactions
                        .iter()
                        .find(|t| &t.id == id)
                        .map(|t| t.mint_url.clone())
                })
            })
            .or_else(|| {
                // Prefer the mint selected on an unquoted Pending ReceiveOnchain,
                // or on ANY Pending ReceiveOnchain (in case an earlier sweep retry already attached a quote_id).
                w_state
                    .transactions
                    .iter()
                    .find(|t| {
                        t.status == TransactionStatus::Pending
                            && matches!(
                                &t.tx_type,
                                TransactionType::ReceiveOnchain(d)
                                    if d.quote_id.is_none()
                                        && !d.address.is_empty()
                                        && d.address != "spark-onchain-bridge"
                            )
                    })
                    .or_else(|| {
                        w_state.transactions.iter().find(|t| {
                            t.status == TransactionStatus::Pending
                                && matches!(
                                    &t.tx_type,
                                    TransactionType::ReceiveOnchain(d)
                                        if !d.address.is_empty() && d.address != "spark-onchain-bridge"
                                )
                        })
                    })
                    .or_else(|| {
                        w_state.transactions.iter().find(|t| {
                            t.status == TransactionStatus::Pending
                                && matches!(&t.tx_type, TransactionType::ReceiveOnchain(_))
                        })
                    })
                    .map(|t| t.mint_url.clone())
            })
            .or_else(|| w_state.mints.first().cloned())
            .unwrap_or_else(|| ecash_wallet::DEFAULT_MINT_URL.to_string());
        ecash_wallet::state::normalize_mint_url(&raw_mint)
    };

    let mint_client = MintClient::new(&resolved_mint_url);
    let (quote_id, invoice) = mint_client
        .request_mint_quote(amount_sats)
        .await
        .map_err(|e| CommandError(format!("Failed to request Cashu mint quote: {}", e)))?;

    let keyset = mint_client
        .fetch_keyset()
        .await
        .map_err(|e| CommandError(format!("Failed to fetch Cashu mint keyset: {}", e)))?;

    let desired_amounts = split_into_powers_of_2(amount_sats);

    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();
    if w_state.stable_operations.iter().any(|o| o.active()) {
        return Err(CommandError("A stable balance conversion is in progress.".into()));
    }
    
    w_state.cache_mint_keys(
        &resolved_mint_url,
        std::collections::HashMap::from([(keyset.id.clone(), keyset.keys)]),
    );
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
        .map_err(|e| CommandError(format!("Derivation error: {}", e)))?;
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
    let blinding_sessions_hex: Vec<String> = sessions
        .iter()
        .map(|(_, sess, _)| sess.to_session_hex())
        .collect();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let target_pos = if let Some(ref id) = tx_id {
        w_state.transactions.iter().position(|t| &t.id == id)
    } else {
        // First prefer an unquoted pending ReceiveOnchain, otherwise reuse ANY pending ReceiveOnchain
        // so retried sweeps never insert duplicate pending ReceiveOnchain transactions.
        w_state
            .transactions
            .iter()
            .position(|t| {
                t.status == TransactionStatus::Pending
                    && matches!(
                        &t.tx_type,
                        TransactionType::ReceiveOnchain(d) if d.quote_id.is_none()
                    )
            })
            .or_else(|| {
                w_state.transactions.iter().position(|t| {
                    t.status == TransactionStatus::Pending
                        && matches!(&t.tx_type, TransactionType::ReceiveOnchain(_))
                })
            })
    };

    let final_tx_id = if let Some(pos) = target_pos {
        let tx = &mut w_state.transactions[pos];
        tx.id = quote_id.clone();
        tx.amount = amount_sats;
        tx.mint_url = resolved_mint_url.clone();
        if let Some(f) = fee_sats {
            tx.fee = f;
        }
        if let TransactionType::ReceiveOnchain(ref mut d) = tx.tx_type {
            d.quote_id = Some(quote_id.clone());
            d.outputs = outputs;
            d.blinding_sessions_hex = blinding_sessions_hex;
            if txid.is_some() {
                d.txid = txid;
            }
            if let Some(addr) = address {
                if !addr.is_empty() {
                    d.address = addr;
                }
            }
        }
        let keep_id = quote_id.clone();
        // Clean up any stale duplicate Pending ReceiveOnchain entries from earlier failed sweep attempts
        w_state.transactions.retain(|t| {
            t.id == keep_id
                || t.status != TransactionStatus::Pending
                || !matches!(&t.tx_type, TransactionType::ReceiveOnchain(_))
        });
        keep_id
    } else {
        w_state.transactions.insert(
            0,
            Transaction {
                id: quote_id.clone(),
                tx_type: TransactionType::ReceiveOnchain(ReceiveOnchainTransactionData {
                    address: address.unwrap_or_else(|| "spark-onchain-bridge".to_string()),
                    txid,
                    quote_id: Some(quote_id.clone()),
                    outputs,
                    blinding_sessions_hex,
                }),
                amount: amount_sats,
                fee: fee_sats.unwrap_or(0),
                status: TransactionStatus::Pending,
                timestamp: now,
                mint_url: resolved_mint_url,
            },
        );
        quote_id.clone()
    };

    w_state.save_encrypted(&path, &passphrase)?;

    Ok(PrepareMintFromSparkResponse {
        tx_id: final_tx_id,
        quote_id,
        invoice,
        amount_sats,
    })
}

#[tauri::command]
pub async fn spark_complete_mint_from_spark(
    tx_id: String,
    txid: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    let (tx_snapshot, trusted_keys) = {
        let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
        let w_state = wallet_guard.as_mut().unwrap();
        let mut found = None;
        if let Some(tx) = w_state.transactions.iter_mut().find(|t| t.id == tx_id) {
            if let TransactionType::ReceiveOnchain(ref mut d) = tx.tx_type {
                if txid.is_some() {
                    d.txid = txid.clone();
                }
            }
            found = Some(tx.clone());
        }
        if found.is_some() {
            w_state.save_encrypted(&path, &passphrase)?;
        }
        let keys = found
            .as_ref()
            .and_then(|t| w_state.trusted_keys.get(&t.mint_url).cloned());
        (found, keys)
    };

    let Some(tx) = tx_snapshot else {
        return Ok(false);
    };

    let diff = ecash_wallet::check_transaction_network(&tx, trusted_keys.as_ref()).await?;
    let status = {
        let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
        let w_state = wallet_guard.as_mut().unwrap();
        ecash_wallet::apply_transaction_diff(w_state, &path, &passphrase, &tx_id, diff).await?
    };

    Ok(status == TransactionStatus::Success)
}

#[tauri::command]
pub async fn spark_abort_unpaid_mint_from_spark(
    tx_id: String,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    if let Some(pos) = w_state.transactions.iter().position(|t| t.id == tx_id) {
        let tx = &mut w_state.transactions[pos];
        if tx.status == TransactionStatus::Pending {
            let is_placeholder = matches!(
                &tx.tx_type,
                TransactionType::ReceiveOnchain(d) if d.address == "spark-onchain-bridge" || d.address.is_empty()
            );
            if is_placeholder {
                w_state.transactions.remove(pos);
            } else if let TransactionType::ReceiveOnchain(ref mut d) = tx.tx_type {
                d.quote_id = None;
                d.outputs.clear();
                d.blinding_sessions_hex.clear();
            }
            w_state.save_encrypted(&path, &passphrase)?;
            return Ok(true);
        }
    }

    Ok(false)
}
