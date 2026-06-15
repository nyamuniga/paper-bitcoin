use crate::error::CommandResult;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use ecash_wallet::WalletState;

#[derive(Debug, Serialize, Deserialize)]
pub struct IssuedNote {
    pub serial: String,
    pub bin_b64: String,
    pub svg_b64: String, // Note: generation of SVG can be done in frontend or backend later
    pub face_value: u64,
}

#[derive(Clone, Serialize)]
pub struct InvoicePayload {
    pub hub_mint: String,
    pub invoice: String,
    pub total_sats: u64,
}

use tauri::State;
use crate::commands::auth::AppState;

#[tauri::command]
pub async fn issue_note(
    app: AppHandle,
    state: State<'_, AppState>,
    sats: u64,
    mint_urls: Vec<String>,
    strategy: String,
) -> CommandResult<IssuedNote> {
    let path = WalletState::default_path().with_file_name("gui-wallet.json");
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let allocations: Vec<(&str, u64)> = mint_urls.iter().map(|u| (u.as_str(), sats / mint_urls.len() as u64)).collect();
    
    // We need to handle the remainder if sats is not perfectly divisible by the number of mints
    let mut actual_allocs = Vec::new();
    let per_mint = sats / mint_urls.len() as u64;
    let remainder = sats % mint_urls.len() as u64;
    for (i, url) in mint_urls.iter().enumerate() {
        let amt = if i == 0 { per_mint + remainder } else { per_mint };
        actual_allocs.push((url.as_str(), amt));
    }

    let reserve_strat = match strategy.as_str() {
        "dynamic" => ecash_wallet::ReserveStrategy::Dynamic,
        _ => ecash_wallet::ReserveStrategy::Static,
    };

    let note = ecash_wallet::issue_multimint_note(
        &mut w_state,
        &path,
        &passphrase,
        &actual_allocs,
        reserve_strat,
        |hub_mint, invoice, total_sats| {
            let app_clone = app.clone();
            async move {
                let _ = app_clone.emit("invoice-ready", InvoicePayload {
                    hub_mint,
                    invoice,
                    total_sats,
                });
            }
        },
    )
    .await?;

    let bin_data = bincode::serialize(&note).map_err(|e| anyhow::anyhow!("Bincode error: {}", e))?;
    use base64::Engine;
    let bin_b64 = base64::engine::general_purpose::STANDARD.encode(&bin_data);
    let serial = note.serial.chars().take(8).collect::<String>();
    
    let svg_string = ecash_encoder::generate_note_svg(&note);
    let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());

    // Save the generated note to history
    let tx_id = format!("tx_issue_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let issue_tx = ecash_core::types::Transaction {
        id: tx_id,
        tx_type: ecash_core::types::TransactionType::Issue(ecash_core::types::IssueTransactionData {
            note: note.clone(),
        }),
        amount: sats,
        fee: 0,
        status: ecash_core::types::TransactionStatus::Success,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
        mint_url: "Local Wallet".to_string(),
    };
    w_state.transactions.push(issue_tx);
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(IssuedNote {
        serial,
        bin_b64,
        svg_b64,
        face_value: sats,
    })
}

#[tauri::command]
pub async fn save_file_to_disk(base64_data: String, filename: String) -> CommandResult<String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD.decode(base64_data).map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;
    
    let mut path = dirs::download_dir().ok_or_else(|| anyhow::anyhow!("Could not find Downloads directory"))?;
    path.push(filename);
    
    std::fs::write(&path, data).map_err(|e| anyhow::anyhow!("Failed to write file: {}", e))?;
    
    Ok(path.to_string_lossy().to_string())
}
