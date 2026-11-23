use crate::error::{CommandResult, SendEcashError, SendEcashErrorCode};
use ecash_wallet::receive::{receive_ecash_validated, ReceiveEcashRequest};
use ecash_wallet::send::SendEcashRequest;

use crate::commands::auth::{AppState, WalletAccessError};
use tauri::State;

pub use ecash_wallet::outgoing::SendEcashResult;

#[tauri::command]
pub async fn send_ecash(
    mint_url: String,
    amount: u64,
    pubkey: Option<String>,
    payment_request: Option<String>,
    payment_max_total: Option<u64>,
    state: State<'_, AppState>,
) -> CommandResult<SendEcashResult> {
    send_ecash_operation(
        mint_url,
        amount,
        pubkey,
        payment_request,
        payment_max_total,
        &state,
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn send_ecash_v2(
    mint_url: String,
    amount: u64,
    pubkey: Option<String>,
    payment_request: Option<String>,
    payment_max_total: Option<u64>,
    state: State<'_, AppState>,
) -> Result<SendEcashResult, SendEcashError> {
    send_ecash_operation(
        mint_url,
        amount,
        pubkey,
        payment_request,
        payment_max_total,
        &state,
    )
    .await
}

async fn send_ecash_operation(
    mint_url: String,
    amount: u64,
    pubkey: Option<String>,
    payment_request: Option<String>,
    payment_max_total: Option<u64>,
    state: &AppState,
) -> Result<SendEcashResult, SendEcashError> {
    let (mut wallet_guard, path, passphrase) =
        state
            .lock_and_get_wallet_typed()
            .await
            .map_err(|error| match error {
                WalletAccessError::Locked(error) => {
                    SendEcashError::new(SendEcashErrorCode::WalletLocked, error.0, None)
                }
                WalletAccessError::Load(error) => {
                    SendEcashError::new(SendEcashErrorCode::InternalError, error.0, None)
                }
            })?;
    let w_state = wallet_guard.as_mut().unwrap();

    ecash_wallet::send::send_ecash(
        w_state,
        &path,
        &passphrase,
        SendEcashRequest {
            mint_url,
            amount,
            pubkey,
            payment_request,
            payment_max_total,
        },
    )
    .await
}

#[tauri::command]
pub async fn receive_ecash(
    token_string: String,
    nostr_key: Option<String>,
    expected_mint: Option<String>,
    expected_amount: Option<u64>,
    expected_invoice_id: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    receive_ecash_operation(
        token_string,
        nostr_key,
        expected_mint,
        expected_amount,
        expected_invoice_id,
        &state,
    )
    .await
}

async fn receive_ecash_operation(
    token_string: String,
    nostr_key: Option<String>,
    expected_mint: Option<String>,
    expected_amount: Option<u64>,
    expected_invoice_id: Option<String>,
    state: &AppState,
) -> CommandResult<u64> {
    let validated = ReceiveEcashRequest {
        token_string,
        nostr_key,
        expected_mint,
        expected_amount,
        expected_invoice_id,
    }
    .validate()?;
    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    receive_ecash_validated(w_state, &path, &passphrase, validated)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn save_ecash_for_later(token_string: String, state: State<'_, AppState>) -> CommandResult<String> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let id = ecash_wallet::deferred_ecash::save_for_later(wallet, &token_string, now)?;
    wallet.normalize_proofs_for_persistence();
    wallet.save_encrypted(&path, &passphrase)?;
    Ok(id)
}

#[cfg(test)]
#[path = "send_tests.rs"]
mod structured_send_tests;
