use crate::error::{CommandError, CommandResult};
use ecash_wallet::WalletState;
use ecash_core::types::Transaction;

use tauri::State;
use crate::commands::auth::AppState;

#[tauri::command]
pub async fn get_transactions(state: State<'_, AppState>) -> CommandResult<Vec<Transaction>> {
    let path = state.wallet_path.clone();
    
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
    let path = state.wallet_path.clone();
    
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
    let path = state.wallet_path.clone();
    
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
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Issue(data) => {
            if let Some(note) = &data.note {
                let svg_string = ecash_encoder::generate_note_svg(note).map_err(|e| anyhow::anyhow!(e.to_string()))?;
                use base64::Engine;
                let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());
                Ok(svg_b64)
            } else {
                Err(CommandError("Note is not yet fully minted".to_string()))
            }
        },
        _ => Err(CommandError("Not an Issue transaction".to_string()))
    }
}

#[tauri::command]
pub async fn get_note_pdf(tx_id: String, state: State<'_, AppState>) -> CommandResult<Vec<u8>> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state.transactions.iter().find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Issue(data) => {
            if let Some(note) = &data.note {
                let svg_string = ecash_encoder::generate_note_svg(note).map_err(|e| anyhow::anyhow!(e.to_string()))?;
                
                let result = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<u8>> {
                    let mut fontdb = svg2pdf::usvg::fontdb::Database::new();
                    fontdb.load_font_data(include_bytes!("../../assets/Roboto-Regular.ttf").to_vec());
                    fontdb.set_serif_family("Roboto");
                    fontdb.set_sans_serif_family("Roboto");
                    fontdb.set_monospace_family("Roboto");
                    fontdb.set_cursive_family("Roboto");
                    fontdb.set_fantasy_family("Roboto");

                    let mut opt = svg2pdf::usvg::Options::default();
                    opt.font_family = "Roboto".to_string();
                    opt.fontdb = std::sync::Arc::new(fontdb);
                    
                    let tree = svg2pdf::usvg::Tree::from_str(&svg_string, &opt)
                        .map_err(|e| anyhow::anyhow!("SVG parse error: {}", e))?;
                    
                    let pdf_bytes = svg2pdf::to_pdf(
                        &tree, 
                        svg2pdf::ConversionOptions::default(), 
                        svg2pdf::PageOptions::default()
                    ).map_err(|e| anyhow::anyhow!("PDF generation failed: {:?}", e))?;
                    
                    Ok(pdf_bytes)
                }).await.map_err(|e| anyhow::anyhow!("Task panic: {}", e))?;

                let bytes = result.map_err(|e| CommandError(format!("Failed to generate PDF: {}", e)))?;
                Ok(bytes)
            } else {
                Err(CommandError("Note is not yet fully minted".to_string()))
            }
        },
        _ => Err(CommandError("Not an Issue transaction".to_string()))
    }
}

#[tauri::command]
pub async fn check_issue_status(tx_id: String, state: State<'_, AppState>) -> CommandResult<crate::commands::issue::IssuedNote> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let note = ecash_wallet::resume_issue_note(&mut w_state, &path, &passphrase, &tx_id).await?;

    let bin_data = ecash_core::compact::encode_full_note(&note).unwrap();
    use base64::Engine;
    let bin_b64 = base64::engine::general_purpose::STANDARD.encode(&bin_data);
    let serial = note.serial.chars().take(8).collect::<String>();
    
    let svg_string = ecash_encoder::generate_note_svg(&note).map_err(|e| anyhow::anyhow!(e.to_string()))?;
    let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());

    Ok(crate::commands::issue::IssuedNote {
        serial,
        bin_b64,
        svg_b64,
        face_value: note.amount_sats,
    })
}
