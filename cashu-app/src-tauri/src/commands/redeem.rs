use crate::error::CommandResult;
use ecash_wallet::WalletState;

use tauri::State;
use crate::commands::auth::AppState;

#[tauri::command]
pub async fn redeem_note(bin_b64: String, invoice: String, state: State<'_, AppState>) -> CommandResult<bool> {
    let bin_data = crate::utils::decode_qr_payload(&bin_b64).map_err(|e| anyhow::anyhow!("Invalid QR payload: {}", e))?;
    let note: ecash_core::types::PhysicalNote = bincode::deserialize(&bin_data).map_err(|e| anyhow::anyhow!("Bincode error: {}", e))?;

    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    ecash_wallet::redeem_note(&mut w_state, &path, &passphrase, &note.public_data, &note.private_data.master_seed_hex, &invoice).await?;

    Ok(true)
}
