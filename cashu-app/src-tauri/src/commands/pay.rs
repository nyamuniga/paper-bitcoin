use crate::error::CommandResult;
use ecash_wallet::WalletState;

use tauri::State;
use crate::commands::auth::AppState;

#[tauri::command]
pub async fn pay_invoice(invoice: String, state: State<'_, AppState>) -> CommandResult<u64> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let sats_paid = ecash_wallet::pay_invoice(&mut w_state, &path, &passphrase, &invoice).await?;
    
    Ok(sats_paid)
}
