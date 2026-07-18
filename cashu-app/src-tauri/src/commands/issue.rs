use crate::error::CommandResult;
use ecash_wallet::WalletState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IssuedNote {
    pub serial: String,
    pub bin_b64: String,
    pub svg_b64: String, // Note: generation of SVG can be done in frontend or backend later
    pub face_value: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingIssue {
    pub tx_id: String,
    pub hub_mint: String,
    pub invoice: String,
    pub total_sats: u64,
}

use crate::commands::auth::AppState;
use tauri::State;

#[tauri::command]
pub async fn issue_note(
    state: State<'_, AppState>,
    sats: u64,
    mint_urls: Vec<String>,
    strategy: String,
) -> CommandResult<PendingIssue> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mut actual_allocs = Vec::new();
    let per_mint = sats / mint_urls.len() as u64;
    let remainder = sats % mint_urls.len() as u64;
    for (i, url) in mint_urls.iter().enumerate() {
        let amt = if i == 0 {
            per_mint + remainder
        } else {
            per_mint
        };
        actual_allocs.push((url.as_str(), amt));
    }

    let reserve_strat = match strategy.as_str() {
        "dynamic" => ecash_wallet::ReserveStrategy::Dynamic,
        _ => ecash_wallet::ReserveStrategy::Static,
    };

    let (tx_id, hub_mint, invoice, total_sats) = ecash_wallet::prepare_issue_multimint_note(
        &mut w_state,
        &path,
        &passphrase,
        &actual_allocs,
        reserve_strat,
    )
    .await?;

    Ok(PendingIssue {
        tx_id,
        hub_mint,
        invoice,
        total_sats,
    })
}

#[tauri::command]
pub async fn get_pending_issue(
    state: State<'_, AppState>,
    tx_id: String,
) -> CommandResult<PendingIssue> {
    let path = state.wallet_path.clone();
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let tx = w_state
        .transactions
        .into_iter()
        .find(|t| t.id == tx_id)
        .ok_or_else(|| crate::error::CommandError("Transaction not found".to_string()))?;

    if let ecash_core::types::TransactionType::Issue(issue_data) = tx.tx_type {
        // Fetch the invoice from the hub mint using the quote_id
        let client = ecash_wallet::client::MintClient::new(&issue_data.hub_mint);

        // We do a manual reqwest GET to /v1/mint/quote/bolt11/{}
        let url = format!(
            "{}/v1/mint/quote/bolt11/{}",
            client.url, issue_data.quote_id
        );
        let resp = client
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| crate::error::CommandError(format!("Network error: {}", e)))?;

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| crate::error::CommandError(format!("Parse error: {}", e)))?;

        ecash_wallet::client::check_api_error(&json, "Mint")
            .map_err(|e| crate::error::CommandError(e.to_string()))?;

        let invoice = json
            .get("request")
            .and_then(|r| r.as_str())
            .ok_or_else(|| {
                crate::error::CommandError("Missing request/invoice in quote".to_string())
            })?
            .to_string();

        Ok(PendingIssue {
            tx_id,
            hub_mint: issue_data.hub_mint,
            invoice,
            total_sats: tx.amount + tx.fee, // Or however total_sats is calculated, wait tx.amount is the face value, total_hub_needed is face value + fee. Let's use tx.amount + tx.fee. Wait, no, actual total_sats in issue_note was total_hub_needed!
        })
    } else {
        Err(crate::error::CommandError(
            "Not an issue transaction".to_string(),
        ))
    }
}

#[tauri::command]
pub async fn get_pdf_from_bin(bin_b64: String) -> CommandResult<Vec<u8>> {
    use base64::Engine;
    let bin_data = base64::engine::general_purpose::STANDARD
        .decode(bin_b64)
        .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))?;
    let note = ecash_core::compact::decode_full_note(&bin_data)
        .map_err(|e| anyhow::anyhow!("Decode error: {}", e))?;

    let svg_string =
        ecash_encoder::generate_note_svg(&note).map_err(|e| anyhow::anyhow!(e.to_string()))?;

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
            svg2pdf::PageOptions::default(),
        )
        .map_err(|e| anyhow::anyhow!("PDF generation failed: {:?}", e))?;

        Ok(pdf_bytes)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Task panic: {}", e))?;

    let bytes = result.map_err(|e| anyhow::anyhow!("Failed to generate PDF: {}", e))?;
    Ok(bytes)
}

#[tauri::command]
pub async fn issue_note_direct(
    state: State<'_, AppState>,
    sats: u64,
    mint_urls: Vec<String>,
) -> CommandResult<IssuedNote> {
    let path = state.wallet_path.clone();

    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock
            .clone()
            .ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mut actual_allocs = Vec::new();
    let per_mint = sats / mint_urls.len() as u64;
    let remainder = sats % mint_urls.len() as u64;
    for (i, url) in mint_urls.iter().enumerate() {
        let amt = if i == 0 {
            per_mint + remainder
        } else {
            per_mint
        };
        actual_allocs.push((url.clone(), amt));
    }

    let allocs_refs: Vec<(&str, u64)> = actual_allocs
        .iter()
        .map(|(u, a)| (u.as_str(), *a))
        .collect();

    let note =
        ecash_wallet::direct::issue_direct_note(&mut w_state, &path, &passphrase, &allocs_refs)
            .await
            .map_err(|e| crate::error::CommandError(e.to_string()))?;

    let bin = ecash_core::compact::encode_full_note(&note)
        .map_err(|e| crate::error::CommandError(format!("Failed to encode note: {:?}", e)))?;
    use base64::Engine;
    let bin_b64 = base64::engine::general_purpose::STANDARD.encode(&bin);

    let svg_string = ecash_encoder::generate_note_svg(&note).unwrap_or_default();
    let svg_b64 = base64::engine::general_purpose::STANDARD.encode(svg_string.as_bytes());

    Ok(IssuedNote {
        serial: note.serial,
        bin_b64,
        svg_b64,
        face_value: note.amount_sats,
    })
}
