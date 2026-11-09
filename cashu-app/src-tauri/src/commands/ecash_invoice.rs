use super::auth::AppState;
use crate::error::{CommandError, CommandResult};
use ecash_wallet::ecash_invoice::{EcashInvoiceSummary, SavedEcashInvoice};
use nostr_sdk::prelude::Keys;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct InvoiceDetails {
    #[serde(flatten)]
    invoice: SavedEcashInvoice,
    status: &'static str,
}

#[tauri::command]
pub async fn ecash_invoices(state: State<'_, AppState>) -> CommandResult<Vec<EcashInvoiceSummary>> {
    let (wallet, _, _) = state.lock_and_get_wallet().await?;
    let wallet = wallet.as_ref().unwrap();
    Ok(wallet
        .ecash_invoices
        .iter()
        .rev()
        .map(|invoice| invoice.summary(&wallet.transactions))
        .collect())
}

#[tauri::command]
pub async fn ecash_save_invoice(
    mut invoice: SavedEcashInvoice,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    // Receiving keys belong only in the encrypted wallet, never a browser database.
    if invoice.secret_hex.len() != 64 || hex::decode(&invoice.secret_hex).is_err() {
        return Err(CommandError("Invalid invoice receiving key".into()));
    }
    Keys::parse(&invoice.secret_hex)
        .map_err(|_| CommandError("Invalid invoice receiving key".into()))?;
    let mint = reqwest::Url::parse(&invoice.mint)
        .map_err(|_| CommandError("Invalid invoice mint".into()))?;
    if invoice.id.is_empty()
        || invoice.id.len() > 64
        || invoice.amount == 0
        || invoice.amount > 9_007_199_254_740_991
        || mint.scheme() != "https"
        || invoice.qr.len() > 28671
        || !invoice.qr.starts_with("creqA")
        || invoice.description.len() > 640
        || invoice.relays.is_empty()
        || invoice.relays.len() > 4
        || invoice.relays.iter().any(|relay| {
            reqwest::Url::parse(relay).map_or(true, |url| {
                url.scheme() != "wss"
                    || url.host_str().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
            })
        })
        || invoice.pending_token.is_some()
    {
        return Err(CommandError("Invalid ecash request".into()));
    }
    let (mut wallet, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = wallet.as_mut().unwrap();
    if wallet
        .ecash_invoices
        .iter()
        .any(|saved| saved.id == invoice.id)
    {
        return Err(CommandError("This request is already saved".into()));
    }
    invoice.created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    wallet.ecash_invoices.push(invoice);
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet.ecash_invoices.pop();
        return Err(error.into());
    }
    Ok(())
}

#[tauri::command]
pub async fn ecash_invoice(
    id: String,
    state: State<'_, AppState>,
) -> CommandResult<InvoiceDetails> {
    let (wallet, _, _) = state.lock_and_get_wallet().await?;
    let wallet = wallet.as_ref().unwrap();
    let invoice = wallet
        .ecash_invoices
        .iter()
        .find(|invoice| invoice.id == id)
        .ok_or_else(|| CommandError("Request not found".into()))?;
    Ok(InvoiceDetails {
        invoice: invoice.clone(),
        status: invoice.summary(&wallet.transactions).status,
    })
}

#[tauri::command]
pub async fn ecash_invoice_payment(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    if token.len() > 100000 {
        return Err(CommandError("Invoice payment is too large".into()));
    }
    let (mint, _, amount) = ecash_wallet::decode_token_string(&token)?;
    let (mut wallet, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = wallet.as_mut().unwrap();
    let invoice = wallet
        .ecash_invoices
        .iter()
        .find(|invoice| invoice.id == id)
        .ok_or_else(|| CommandError("Request not found".into()))?;
    ecash_wallet::payment_request::validate_invoice_payment(
        &mint,
        amount,
        0,
        &invoice.mint,
        invoice.amount,
    )?;
    if invoice.summary(&wallet.transactions).status == "paid" {
        return Err(CommandError("This request is already paid".into()));
    }
    if invoice
        .pending_token
        .as_ref()
        .is_some_and(|saved| saved != &token)
    {
        return Err(CommandError(
            "A payment is already saved for this request. Claim it first.".into(),
        ));
    }
    let invoice = wallet
        .ecash_invoices
        .iter_mut()
        .find(|invoice| invoice.id == id)
        .unwrap();
    let previous = invoice.pending_token.replace(token);
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet
            .ecash_invoices
            .iter_mut()
            .find(|invoice| invoice.id == id)
            .unwrap()
            .pending_token = previous;
        return Err(error.into());
    }
    Ok(())
}

/// Persist additional inbox routes before the UI advertises them in an existing request.
#[tauri::command]
pub async fn ecash_invoice_relays(
    id: String,
    relays: Vec<String>,
    state: State<'_, AppState>,
) -> CommandResult<Vec<String>> {
    if relays.len() > 4
        || relays.iter().any(|relay| {
            relay.len() > 256
                || reqwest::Url::parse(relay).map_or(true, |url| {
                    url.scheme() != "wss"
                        || url.host_str().is_none()
                        || !url.username().is_empty()
                        || url.password().is_some()
                })
        })
    {
        return Err(CommandError("Invalid invoice delivery relays".into()));
    }
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let index = wallet
        .ecash_invoices
        .iter()
        .position(|invoice| invoice.id == id)
        .ok_or_else(|| CommandError("Request not found".into()))?;
    let previous = wallet.ecash_invoices[index].relays.clone();
    if wallet.ecash_invoices[index].add_delivery_relays(&relays) {
        if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
            wallet.ecash_invoices[index].relays = previous;
            return Err(error.into());
        }
    }
    Ok(wallet.ecash_invoices[index].relays.clone())
}
