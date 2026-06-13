use crate::error::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use ecash_wallet::{WalletState, generate_mnemonic};

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
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
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
    
    Ok(WalletInfo {
        is_initialized: true,
        balance_sats: w_state.total_balance(),
        mnemonic: None, // Don't return mnemonic normally
        mint_balances: w_state.balance_by_mint(),
    })
}

#[tauri::command]
pub async fn get_balance(state: State<'_, AppState>) -> CommandResult<u64> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
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
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
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
