use std::sync::Mutex;
use tauri::State;
use crate::error::{CommandResult, CommandError};
use ecash_wallet::WalletState;

pub struct AppState {
    pub passphrase: Mutex<Option<String>>,
    pub wallet_path: std::path::PathBuf,
}

#[tauri::command]
pub async fn is_wallet_setup(state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    Ok(path.exists())
}

#[tauri::command]
pub async fn unlock_wallet(passphrase: String, state: State<'_, AppState>) -> CommandResult<bool> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not found".to_string()));
    }
    
    // Try to load it to verify the passphrase is correct
    match WalletState::load_encrypted(&path, &passphrase) {
        Ok(_) => {
            let mut pass_lock = state.passphrase.lock().unwrap();
            *pass_lock = Some(passphrase);
            Ok(true)
        }
        Err(_) => {
            Err(CommandError("Incorrect passphrase".to_string()))
        }
    }
}

#[tauri::command]
pub async fn lock_wallet(state: State<'_, AppState>) -> CommandResult<bool> {
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
    let path = state.wallet_path.clone();
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| CommandError(format!("Failed to delete wallet: {}", e)))?;
    }
    let mut pass_lock = state.passphrase.lock().unwrap();
    *pass_lock = None;
    Ok(true)
}

#[tauri::command]
pub async fn create_wallet(passphrase: String, state: State<'_, AppState>) -> CommandResult<crate::commands::wallet::WalletInfo> {
    let path = state.wallet_path.clone();
    if path.exists() {
        return Err(CommandError("Wallet already exists".to_string()));
    }

    let (phrase, seed_hex) = ecash_wallet::generate_mnemonic()?;
    let mut w_state = WalletState::new(seed_hex, Some(phrase.clone()));
    w_state.save_encrypted(&path, &passphrase)?;

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
pub async fn restore_wallet(mnemonic: String, passphrase: String, mint_urls: Vec<String>, state: State<'_, AppState>) -> CommandResult<crate::commands::wallet::WalletInfo> {
    let path = state.wallet_path.clone();
    let seed_hex = ecash_wallet::mnemonic_to_seed_hex(&mnemonic)?;
    let mut w_state = WalletState::new(seed_hex, Some(mnemonic.clone()));
    
    // We can do restore logic if we have mint URLs
    if !mint_urls.is_empty() {
        if let Err(e) = ecash_wallet::restore::restore_from_mints(&mut w_state, &path, &passphrase, mint_urls).await {
            println!("Restore from mints failed: {}", e);
            // We continue, the state still has the seed
        }
    }
    
    w_state.save_encrypted(&path, &passphrase)?;
    
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
