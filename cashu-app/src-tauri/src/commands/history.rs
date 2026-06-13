use crate::error::{CommandError, CommandResult};
use ecash_wallet::WalletState;
use ecash_core::types::Transaction;

use tauri::State;
use crate::commands::auth::AppState;

#[tauri::command]
pub async fn get_transactions(state: State<'_, AppState>) -> CommandResult<Vec<Transaction>> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;
    let mut txs = w_state.transactions;
    txs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp)); // Newest first
    Ok(txs)
}

#[tauri::command]
pub async fn retry_mint(tx_id: String, state: State<'_, AppState>) -> CommandResult<bool> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    ecash_wallet::retry_mint(&mut w_state, &path, &passphrase, &tx_id).await?;
    
    Ok(true)
}

#[tauri::command]
pub async fn check_melt_status(tx_id: String, state: State<'_, AppState>) -> CommandResult<ecash_core::types::TransactionStatus> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let status = ecash_wallet::check_melt_status(&mut w_state, &path, &passphrase, &tx_id).await?;
    
    Ok(status)
}

#[tauri::command]
pub async fn get_note_svg(tx_id: String, state: State<'_, AppState>) -> CommandResult<String> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Issue(data) => {
            let svg_string = ecash_encoder::generate_note_svg(&data.note);
            use base64::Engine;
            let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());
            Ok(svg_b64)
        },
        _ => Err(CommandError("Not an Issue transaction".to_string()))
    }
}
