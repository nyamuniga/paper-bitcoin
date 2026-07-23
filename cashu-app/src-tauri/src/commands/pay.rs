use crate::error::CommandResult;
use ecash_wallet::WalletState;

use crate::commands::auth::AppState;
use tauri::State;

#[tauri::command]
pub async fn pay_invoice(
    invoice: String,
    mint_url: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let sats_paid =
        ecash_wallet::pay_invoice(&mut w_state, &path, &passphrase, &invoice, mint_url).await?;

    Ok(sats_paid)
}
