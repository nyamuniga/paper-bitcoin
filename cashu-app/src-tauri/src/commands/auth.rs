use crate::error::{CommandError, CommandResult};
use ecash_wallet::WalletState;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_store::StoreExt;

fn auth_store_context_key(app: &tauri::AppHandle) -> String {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "bitnotes-default-store".to_string())
}

pub(crate) fn save_passphrase(app: &tauri::AppHandle, passphrase: &str) {
    if let Ok(store) = app.store("auth.bin") {
        let ctx = auth_store_context_key(app);
        if let Ok((nonce, ciphertext)) = ecash_wallet::state::encrypt_local_secret(passphrase, &ctx) {
            store.set(
                "passphrase_enc",
                serde_json::json!({
                    "nonce": nonce,
                    "ciphertext": ciphertext,
                }),
            );
            store.delete("passphrase");
            let _ = store.save();
        }
    }
}

pub(crate) fn get_saved_passphrase(app: &tauri::AppHandle) -> Option<String> {
    if let Ok(store) = app.store("auth.bin") {
        let ctx = auth_store_context_key(app);
        if let Some(enc) = store.get("passphrase_enc") {
            let nonce = enc.get("nonce").and_then(|v| v.as_str());
            let ciphertext = enc.get("ciphertext").and_then(|v| v.as_str());
            if let (Some(n), Some(c)) = (nonce, ciphertext) {
                if let Ok(pass) = ecash_wallet::state::decrypt_local_secret(n, c, &ctx) {
                    return Some(pass);
                }
            }
        }
        // Backward-compatible migration for legacy plaintext entry
        if let Some(val) = store.get("passphrase") {
            if let Some(plain) = val.as_str().map(|s| s.to_string()) {
                save_passphrase(app, &plain);
                return Some(plain);
            }
        }
    }
    None
}

fn clear_saved_passphrase(app: &tauri::AppHandle) {
    if let Ok(store) = app.store("auth.bin") {
        store.delete("passphrase_enc");
        store.delete("passphrase");
        let _ = store.save();
    }
}

pub struct AppState {
    pub passphrase: Mutex<Option<String>>,
    pub wallet_path: std::path::PathBuf,
    pub wallet: tokio::sync::Mutex<Option<WalletState>>,
    pub pending_nwc_requests: Mutex<Vec<crate::nwc::PendingNwcRequest>>,
    pub nwc_enabled: std::sync::atomic::AtomicBool,
}

impl AppState {
    pub fn get_passphrase(&self) -> Result<String, CommandError> {
        let pass_lock = self.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))
    }

    /// Acquire the wallet mutex and return a guard to the in-memory decrypted `WalletState`,
    /// loading it from disk once if not yet cached in memory.
    pub async fn lock_and_get_wallet(
        &self,
    ) -> Result<
        (
            tokio::sync::MutexGuard<'_, Option<WalletState>>,
            std::path::PathBuf,
            String,
        ),
        CommandError,
    > {
        let _ = self.get_passphrase()?;
        let mut guard = self.wallet.lock().await;
        let passphrase = self.get_passphrase()?;
        let path = self.wallet_path.clone();
        if guard.is_none() {
            let loaded = WalletState::load_encrypted(&path, &passphrase)?;
            *guard = Some(loaded);
        }
        Ok((guard, path, passphrase))
    }

    /// Zeroize all secrets in the in-memory `WalletState` and passphrase before clearing them.
    pub async fn clear_and_zeroize_wallet(&self) {
        let mut wallet_guard = self.wallet.lock().await;
        if let Some(ref mut w) = *wallet_guard {
            w.zeroize_secrets();
        }
        *wallet_guard = None;

        let mut pass_lock = self.passphrase.lock().unwrap();
        if let Some(ref mut p) = *pass_lock {
            unsafe {
                p.as_bytes_mut().fill(0);
            }
            p.clear();
        }
        *pass_lock = None;
    }
}

#[tauri::command]
pub async fn is_wallet_setup(state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    Ok(path.exists())
}

#[tauri::command]
pub async fn auto_login(app: tauri::AppHandle, state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Ok(false);
    }

    if let Some(passphrase) = get_saved_passphrase(&app) {
        let mut wallet_guard = state.wallet.lock().await;
        if let Ok(w_state) = WalletState::load_encrypted(&path, &passphrase) {
            *wallet_guard = Some(w_state);
            let mut pass_lock = state.passphrase.lock().unwrap();
            *pass_lock = Some(passphrase);
            return Ok(true);
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn unlock_wallet(app: tauri::AppHandle, passphrase: String, remember_me: bool, state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not found".to_string()));
    }

    let mut wallet_guard = state.wallet.lock().await;
    // Try to load it to verify the passphrase is correct and cache in memory
    match WalletState::load_encrypted(&path, &passphrase) {
        Ok(w_state) => {
            if remember_me {
                save_passphrase(&app, &passphrase);
            }
            *wallet_guard = Some(w_state);
            let mut pass_lock = state.passphrase.lock().unwrap();
            *pass_lock = Some(passphrase);
            Ok(true)
        }
        Err(_) => Err(CommandError("Incorrect passphrase".to_string())),
    }
}

#[tauri::command]
pub async fn lock_wallet(app: tauri::AppHandle, state: State<'_, AppState>) -> CommandResult<bool> {
    clear_saved_passphrase(&app);
    state.clear_and_zeroize_wallet().await;
    Ok(true)
}

#[tauri::command]
pub async fn is_wallet_unlocked(state: State<'_, AppState>) -> CommandResult<bool> {
    let pass_lock = state.passphrase.lock().unwrap();
    Ok(pass_lock.is_some())
}

#[tauri::command]
pub async fn verify_passphrase(
    passphrase: String,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    if let Ok(current) = state.get_passphrase() {
        if current == passphrase {
            return Ok(true);
        }
        return Err(CommandError("Incorrect passphrase".to_string()));
    }
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not found".to_string()));
    }
    match WalletState::load_encrypted(&path, &passphrase) {
        Ok(_) => Ok(true),
        Err(_) => Err(CommandError("Incorrect passphrase".to_string())),
    }
}

#[tauri::command]
pub async fn reset_wallet(app: tauri::AppHandle, state: State<'_, AppState>) -> CommandResult<bool> {
    clear_saved_passphrase(&app);
    state.nwc_enabled.store(false, std::sync::atomic::Ordering::SeqCst);
    if let Ok(mut q) = state.pending_nwc_requests.lock() {
        q.clear();
    }
    state.clear_and_zeroize_wallet().await;
    let path = state.wallet_path.clone();
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| CommandError(format!("Failed to delete wallet: {}", e)))?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn create_wallet(
    app: tauri::AppHandle,
    passphrase: String,
    remember_me: bool,
    state: State<'_, AppState>,
) -> CommandResult<crate::commands::wallet::WalletInfo> {
    let mut wallet_guard = state.wallet.lock().await;
    let path = state.wallet_path.clone();
    if path.exists() {
        return Err(CommandError("Wallet already exists".to_string()));
    }

    let (phrase, seed_hex) = ecash_wallet::generate_mnemonic()?;
    let mut w_state = WalletState::new(seed_hex, Some(phrase.clone()));
    
    // Add default mint for new wallets
    let default_mint = ecash_wallet::DEFAULT_MINT_URL.to_string();
    w_state.mints.push(default_mint.clone());
    
    // Attempt to fetch and cache keys for the default mint (non-fatal if it fails)
    if let Ok(keyset) = ecash_wallet::client::MintClient::new(&default_mint).fetch_keyset().await {
        w_state.cache_mint_keys(&default_mint, keyset.keys);
    }
    
    w_state.save_encrypted(&path, &passphrase)?;

    if remember_me {
        save_passphrase(&app, &passphrase);
    }

    *wallet_guard = Some(w_state);
    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = Some(passphrase);

    Ok(crate::commands::wallet::WalletInfo {
        is_initialized: true,
        balance_sats: 0,
        mnemonic: Some(phrase),
        mint_balances: std::collections::HashMap::new(),
    })
}

#[tauri::command]
pub async fn restore_wallet(
    app_handle: tauri::AppHandle,
    mnemonic: String,
    passphrase: String,
    remember_me: bool,
    mint_urls: Vec<String>,
    state: State<'_, AppState>,
) -> CommandResult<crate::commands::wallet::WalletInfo> {
    let mut wallet_guard = state.wallet.lock().await;
    let path = state.wallet_path.clone();
    let seed_hex = ecash_wallet::mnemonic_to_seed_hex(&mnemonic)?;
    let mut w_state = WalletState::new(seed_hex, Some(mnemonic.clone()));

    // We can do restore logic if we have mint URLs
    if !mint_urls.is_empty() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let app = app_handle.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                use tauri::Emitter;
                app.emit("restore-progress", msg).ok();
            }
        });

        if let Err(e) = ecash_wallet::restore::restore_from_mints(
            &mut w_state,
            &path,
            &passphrase,
            mint_urls,
            Some(tx),
        )
        .await
        {
            println!("Restore from mints failed: {}", e);
            // We continue, the state still has the seed
        }
    }

    w_state.save_encrypted(&path, &passphrase)?;

    if remember_me {
        save_passphrase(&app_handle, &passphrase);
    }

    let mut mint_balances = w_state.balance_by_mint();
    for mint in &w_state.mints {
        mint_balances.entry(mint.clone()).or_insert(0);
    }
    let balance = w_state.total_balance();

    *wallet_guard = Some(w_state);
    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = Some(passphrase);

    Ok(crate::commands::wallet::WalletInfo {
        is_initialized: true,
        balance_sats: balance,
        mnemonic: Some(mnemonic),
        mint_balances,
    })
}
