use crate::error::{CommandError, CommandResult};
use ecash_wallet::WalletState;
use std::sync::Mutex;
use tauri::State;
use keyring::Entry;

fn get_keyring() -> Result<Entry, keyring::Error> {
    Entry::new("physical-ecash-wallet", "default_user")
}

fn save_passphrase(passphrase: &str) {
    if let Ok(entry) = get_keyring() {
        let _ = entry.set_password(passphrase);
    }
}

fn get_saved_passphrase() -> Option<String> {
    if let Ok(entry) = get_keyring() {
        entry.get_password().ok()
    } else {
        None
    }
}

fn clear_saved_passphrase() {
    if let Ok(entry) = get_keyring() {
        let _ = entry.delete_credential();
    }
}

pub struct AppState {
    pub passphrase: Mutex<Option<String>>,
    pub wallet_path: std::path::PathBuf,
    pub wallet_lock: tokio::sync::Mutex<()>,
}

#[tauri::command]
pub async fn is_wallet_setup(state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    Ok(path.exists())
}

#[tauri::command]
pub async fn auto_login(state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Ok(false);
    }

    if let Some(passphrase) = get_saved_passphrase() {
        if WalletState::load_encrypted(&path, &passphrase).is_ok() {
            let mut pass_lock = state.passphrase.lock().unwrap();
            *pass_lock = Some(passphrase);
            return Ok(true);
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn unlock_wallet(passphrase: String, remember_me: bool, state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not found".to_string()));
    }

    // Try to load it to verify the passphrase is correct
    match WalletState::load_encrypted(&path, &passphrase) {
        Ok(_) => {
            if remember_me {
                save_passphrase(&passphrase);
            }
            let mut pass_lock = state.passphrase.lock().unwrap();
            *pass_lock = Some(passphrase);
            Ok(true)
        }
        Err(_) => Err(CommandError("Incorrect passphrase".to_string())),
    }
}

#[tauri::command]
pub async fn lock_wallet(state: State<'_, AppState>) -> CommandResult<bool> {
    clear_saved_passphrase();
    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = None;
    Ok(true)
}

#[tauri::command]
pub async fn is_wallet_unlocked(state: State<'_, AppState>) -> CommandResult<bool> {
    let pass_lock = state.passphrase.lock().unwrap();
    Ok(pass_lock.is_some())
}

#[tauri::command]
pub async fn reset_wallet(state: State<'_, AppState>) -> CommandResult<bool> {
    clear_saved_passphrase();
    let path = state.wallet_path.clone();
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| CommandError(format!("Failed to delete wallet: {}", e)))?;
    }
    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = None;
    Ok(true)
}

#[tauri::command]
pub async fn create_wallet(
    passphrase: String,
    remember_me: bool,
    state: State<'_, AppState>,
) -> CommandResult<crate::commands::wallet::WalletInfo> {
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
        save_passphrase(&passphrase);
    }

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
        save_passphrase(&passphrase);
    }

    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = Some(passphrase);

    let mut mint_balances = w_state.balance_by_mint();
    for mint in &w_state.mints {
        mint_balances.entry(mint.clone()).or_insert(0);
    }
    let balance = w_state.total_balance();

    Ok(crate::commands::wallet::WalletInfo {
        is_initialized: true,
        balance_sats: balance,
        mnemonic: Some(mnemonic),
        mint_balances,
    })
}
