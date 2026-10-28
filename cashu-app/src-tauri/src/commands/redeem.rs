use crate::error::CommandResult;

use crate::commands::auth::AppState;
use tauri::State;

#[tauri::command]
pub async fn redeem_note(
    bin_b64: String,
    invoice: String,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    let bin_data = crate::utils::decode_qr_payload(&bin_b64)
        .map_err(|e| anyhow::anyhow!("Invalid QR payload: {}", e))?;
    let note = ecash_core::compact::decode_full_note(&bin_data)
        .map_err(|e| anyhow::anyhow!("Decode error: {}", e))?;

    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    ecash_wallet::redeem_note(
        w_state,
        &path,
        &passphrase,
        &note.public_data,
        &note.private_data.master_seed_hex,
        &invoice,
    )
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.to_lowercase().contains("already spent") || msg.to_lowercase().contains("already redeemed") {
            crate::error::CommandError("This note has already been redeemed and cannot be claimed again.".to_string())
        } else {
            crate::error::CommandError(format!("Failed to redeem note: {}", e))
        }
    })?;

    Ok(true)
}

#[tauri::command]
pub async fn redeem_note_direct(
    bin_b64: String,
    state: State<'_, AppState>,
) -> CommandResult<bool> {
    let bin_data = crate::utils::decode_qr_payload(&bin_b64)
        .map_err(|e| crate::error::CommandError(format!("Invalid QR payload: {}", e)))?;

    let note = ecash_core::compact::decode_full_note(&bin_data)
        .map_err(|e| crate::error::CommandError(format!("Invalid note format: {}", e)))?;

    let (mut wallet_guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let w_state = wallet_guard.as_mut().unwrap();

    ecash_wallet::direct::redeem_direct_note(
        w_state,
        &path,
        &passphrase,
        &note.public_data,
        &note.private_data.master_seed_hex,
    )
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.to_lowercase().contains("already spent") || msg.to_lowercase().contains("already redeemed") {
            crate::error::CommandError("This note has already been redeemed and cannot be claimed again.".to_string())
        } else {
            crate::error::CommandError(format!("Failed to redeem note: {}", e))
        }
    })?;

    Ok(true)
}
