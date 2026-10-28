use crate::error::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};

use crate::commands::auth::AppState;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct WalletInfo {
    pub is_initialized: bool,
    pub balance_sats: u64,
    pub mnemonic: Option<String>,
    pub mint_balances: std::collections::HashMap<String, u64>,
}

#[tauri::command]
pub async fn wallet_info(state: State<'_, AppState>) -> CommandResult<WalletInfo> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Ok(WalletInfo {
            is_initialized: false,
            balance_sats: 0,
            mnemonic: None,
            mint_balances: std::collections::HashMap::new(),
        });
    }

    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();

    let mut balances = w_state.balance_by_mint();
    for mint in &w_state.mints {
        balances.entry(mint.clone()).or_insert(0);
    }

    Ok(WalletInfo {
        is_initialized: true,
        balance_sats: w_state.total_balance(),
        mnemonic: None, // Don't return mnemonic normally
        mint_balances: balances,
    })
}

#[tauri::command]
pub async fn get_seed_hex(state: State<'_, AppState>) -> CommandResult<String> {
    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();
    Ok(w_state.seed_hex.clone())
}

#[tauri::command]
pub async fn get_custom_nostr_key(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();
    Ok(w_state.custom_nostr_key.clone())
}

#[tauri::command]
pub async fn set_custom_nostr_key(key: Option<String>, state: State<'_, AppState>) -> CommandResult<bool> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();
    w_state.custom_nostr_key = key;
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(true)
}

#[tauri::command]
pub async fn set_default_nostr_key(key: String, state: State<'_, AppState>) -> CommandResult<bool> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();
    if w_state.default_nostr_key.as_deref() != Some(&key) {
        w_state.default_nostr_key = Some(key);
        w_state.save_encrypted(&path, &passphrase)?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_balance(state: State<'_, AppState>) -> CommandResult<u64> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Ok(0);
    }

    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();
    Ok(w_state.total_balance())
}

#[tauri::command]
pub async fn get_recovery_words(state: State<'_, AppState>) -> CommandResult<Vec<String>> {
    let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_ref().unwrap();
    if let Some(ref m) = w_state.mnemonic {
        Ok(m.split_whitespace().map(|s| s.to_string()).collect())
    } else {
        Err(CommandError("No recovery words stored.".to_string()))
    }
}

#[tauri::command]
pub async fn remove_mint(mint_url: String, state: State<'_, AppState>) -> CommandResult<()> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();
    w_state.remove_mint(&mint_url)?;
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(())
}

#[tauri::command]
pub async fn add_mint(mint_url: String, state: State<'_, AppState>) -> CommandResult<()> {
    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);

    // Check if the wallet is initialized
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not initialized".to_string()));
    }

    {
        let (wallet_guard, _, _) = state.lock_and_get_wallet().await?;
        let w_state = wallet_guard.as_ref().unwrap();
        if w_state.mints.contains(&mint_url) {
            return Err(CommandError("Mint is already in the wallet".to_string()));
        }
    }

    // Try to fetch the keys to verify the mint is valid and responsive
    let client = ecash_wallet::client::MintClient::new(&mint_url);
    let keys = client
        .fetch_keyset()
        .await
        .map_err(|e| CommandError(format!("Failed to connect to mint or fetch keys: {}", e)))?
        .keys;

    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();
    if w_state.mints.contains(&mint_url) {
        return Err(CommandError("Mint is already in the wallet".to_string()));
    }
    w_state.cache_mint_keys(&mint_url, keys);
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(())
}

#[tauri::command]
pub async fn clean_wallet(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ecash_wallet::restore::CleanWalletResult> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not initialized".to_string()));
    }

    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let app = app_handle.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            use tauri::Emitter;
            app.emit("clean-wallet-progress", msg).ok();
        }
    });

    let res =
        ecash_wallet::restore::clean_wallet_proofs(w_state, &path, &passphrase, Some(tx)).await?;

    Ok(res)
}
