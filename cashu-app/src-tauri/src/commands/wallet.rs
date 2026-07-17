use crate::error::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use ecash_wallet::WalletState;

use tauri::State;
use crate::commands::auth::AppState;

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

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;
    
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
pub async fn get_balance(state: State<'_, AppState>) -> CommandResult<u64> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Ok(0);
    }
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };
    
    let w_state = WalletState::load_encrypted(&path, &passphrase)?;
    Ok(w_state.total_balance())
}

#[tauri::command]
pub async fn get_recovery_words(state: State<'_, AppState>) -> CommandResult<Vec<String>> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };
    
    let w_state = WalletState::load_encrypted(&path, &passphrase)?;
    if let Some(m) = w_state.mnemonic {
        Ok(m.split_whitespace().map(|s| s.to_string()).collect())
    } else {
        Err(CommandError("No recovery words stored.".to_string()))
    }
}

#[tauri::command]
pub async fn remove_mint(mint_url: String, state: State<'_, AppState>) -> CommandResult<()> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };
    
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;
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

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    if w_state.mints.contains(&mint_url) {
        return Err(CommandError("Mint is already in the wallet".to_string()));
    }

    // Try to fetch the keys to verify the mint is valid and responsive
    let client = ecash_wallet::client::MintClient::new(&mint_url);
    let keys = client.fetch_keyset().await
        .map_err(|e| CommandError(format!("Failed to connect to mint or fetch keys: {}", e)))?
        .keys;

    w_state.cache_mint_keys(&mint_url, keys);
    w_state.save_encrypted(&path, &passphrase)?;
    
    Ok(())
}

#[tauri::command]
pub async fn clean_wallet(state: State<'_, AppState>) -> CommandResult<u64> {
    let path = state.wallet_path.clone();
    if !path.exists() {
        return Err(CommandError("Wallet not initialized".to_string()));
    }

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let removed = ecash_wallet::restore::clean_wallet_proofs(&mut w_state, &path, &passphrase).await?;
    
    Ok(removed)
}
