use crate::error::CommandResult;

use crate::commands::auth::AppState;
use tauri::State;

#[tauri::command]
pub async fn pay_invoice(
    invoice: String,
    mint_url: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    let (sats_paid, _preimage) =
        ecash_wallet::pay_invoice(w_state, &path, &passphrase, &invoice, mint_url).await?;

    Ok(sats_paid)
}
