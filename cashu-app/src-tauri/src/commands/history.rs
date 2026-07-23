use crate::error::{CommandError, CommandResult};
use ecash_core::types::Transaction;
use ecash_wallet::WalletState;

use crate::commands::auth::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_transactions(state: State<'_, AppState>) -> CommandResult<Vec<Transaction>> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
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
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let _lock = state.wallet_lock.lock().await;
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    ecash_wallet::retry_mint(&mut w_state, &path, &passphrase, &tx_id).await?;

    Ok(true)
}

#[tauri::command]
pub async fn check_transaction_status(
    tx_id: String,
    state: State<'_, AppState>,
) -> CommandResult<ecash_core::types::TransactionStatus> {
    let path = state.wallet_path.clone();
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    // Phase 1: Acquire lock, read state, extract tx
    let (tx, trusted_keys) = {
        let _lock = state.wallet_lock.lock().await;
        let w_state = WalletState::load_encrypted(&path, &passphrase)?;
        let tx = w_state.transactions.iter().find(|t| t.id == tx_id)
            .ok_or_else(|| crate::error::CommandError("Transaction not found".to_string()))?.clone();
        
        let keys = w_state.trusted_keys.get(&tx.mint_url).cloned();
        (tx, keys)
    };

    // Fallback for Issue transactions that still use legacy path
    if matches!(tx.tx_type, ecash_core::types::TransactionType::Issue(_)) {
        let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;
        let mut _lock = state.wallet_lock.lock().await;
        return Ok(ecash_wallet::check_transaction_status_legacy(&mut w_state, &path, &passphrase, &tx_id).await?);
    }

    // Phase 2: Lock-free network I/O
    let diff = ecash_wallet::check_transaction_network(&tx, trusted_keys.as_ref()).await?;

    // Phase 3: Acquire lock, apply diff, save
    let status = {
        let _lock = state.wallet_lock.lock().await;
        let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;
        ecash_wallet::apply_transaction_diff(&mut w_state, &path, &passphrase, &tx_id, diff).await?
    };

    Ok(status)
}

#[tauri::command]
pub async fn get_note_svg(tx_id: String, state: State<'_, AppState>) -> CommandResult<String> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state
        .transactions
        .iter()
        .find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Issue(data) => {
            if let Some(note) = &data.note {
                let svg_string = ecash_encoder::generate_note_svg(note)
                    .map_err(|e| anyhow::anyhow!(e.to_string()))?;
                use base64::Engine;
                let svg_b64 =
                    base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());
                Ok(svg_b64)
            } else {
                Err(CommandError("Note is not yet fully minted".to_string()))
            }
        }
        _ => Err(CommandError("Not an Issue transaction".to_string())),
    }
}

#[tauri::command]
pub async fn get_note_pdf(tx_id: String, state: State<'_, AppState>) -> CommandResult<Vec<u8>> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state
        .transactions
        .iter()
        .find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Issue(data) => {
            if let Some(note) = &data.note {
                let svg_string = ecash_encoder::generate_note_svg(note)
                    .map_err(|e| anyhow::anyhow!(e.to_string()))?;

                let result = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<u8>> {
                    let mut fontdb = svg2pdf::usvg::fontdb::Database::new();
                    fontdb
                        .load_font_data(include_bytes!("../../assets/Roboto-Regular.ttf").to_vec());
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
                        svg2pdf::PageOptions::default(),
                    )
                    .map_err(|e| anyhow::anyhow!("PDF generation failed: {:?}", e))?;

                    Ok(pdf_bytes)
                })
                .await
                .map_err(|e| anyhow::anyhow!("Task panic: {}", e))?;

                let bytes =
                    result.map_err(|e| CommandError(format!("Failed to generate PDF: {}", e)))?;
                Ok(bytes)
            } else {
                Err(CommandError("Note is not yet fully minted".to_string()))
            }
        }
        _ => Err(CommandError("Not an Issue transaction".to_string())),
    }
}

#[tauri::command]
pub async fn check_issue_status(
    tx_id: String,
    state: State<'_, AppState>,
) -> CommandResult<crate::commands::issue::IssuedNote> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let _lock = state.wallet_lock.lock().await;
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let note = ecash_wallet::resume_issue_note(&mut w_state, &path, &passphrase, &tx_id).await?;

    let bin_data = ecash_core::compact::encode_full_note(&note).unwrap();
    use base64::Engine;
    let bin_b64 = base64::engine::general_purpose::STANDARD.encode(&bin_data);
    let serial = note.serial.chars().take(8).collect::<String>();

    let svg_string =
        ecash_encoder::generate_note_svg(&note).map_err(|e| anyhow::anyhow!(e.to_string()))?;
    let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());

    Ok(crate::commands::issue::IssuedNote {
        serial,
        bin_b64,
        svg_b64,
        face_value: note.amount_sats,
    })
}

#[tauri::command]
pub async fn check_token_spend_status(
    tx_id: String,
    state: State<'_, AppState>,
) -> CommandResult<String> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state
        .transactions
        .iter()
        .find(|t| t.id == tx_id)
        .ok_or_else(|| CommandError("Transaction not found".to_string()))?;

    // We only support checking state for outgoing transactions (Send, Issue).
    let mut total_tokens = 0;
    let mut spent_tokens = 0;

    match &tx.tx_type {
        ecash_core::types::TransactionType::Send(data) => {
            // Send transactions are digital tokens with 1 mint.
            let mint_url = &tx.mint_url;
            let ys: Vec<String> = data
                .proofs
                .iter()
                .map(|p| {
                    ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(
                        p.secret.as_bytes(),
                    ))
                })
                .collect();

            if ys.is_empty() {
                return Ok("Unspent".to_string());
            }

            let client = ecash_wallet::client::MintClient::new(mint_url);
            let state_results = client.check_state(&ys).await.unwrap_or_default();

            total_tokens += ys.len();
            for y in ys {
                if let Some(s) = state_results.get(&y) {
                    if s == "SPENT" {
                        spent_tokens += 1;
                    }
                }
            }
        }
        ecash_core::types::TransactionType::Issue(data) => {
            // Issue transactions can span multiple mints.
            if let Some(note) = &data.note {
                for entry in &note.public_data.entries {
                    let mint_url = &entry.mint;
                    let ys: Vec<String> = entry.proofs.iter().filter_map(|p| p.y.clone()).collect();

                    if !ys.is_empty() {
                        let client = ecash_wallet::client::MintClient::new(mint_url);
                        let state_results = client.check_state(&ys).await.unwrap_or_default();

                        total_tokens += ys.len();
                        for y in ys {
                            if let Some(s) = state_results.get(&y) {
                                if s == "SPENT" {
                                    spent_tokens += 1;
                                }
                            }
                        }
                    }
                }
            } else {
                return Err(CommandError("Note is not fully minted yet".to_string()));
            }
        }
        _ => {
            return Err(CommandError(
                "Can only check status of outgoing transactions".to_string(),
            ));
        }
    }

    if total_tokens == 0 {
        return Ok("Unspent".to_string());
    }

    if spent_tokens == total_tokens {
        Ok("Spent".to_string())
    } else if spent_tokens > 0 {
        Ok("Partially Spent".to_string())
    } else {
        Ok("Unspent".to_string())
    }
}
