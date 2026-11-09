use crate::commands::{auth::AppState, spark::SparkState};
use crate::error::{CommandError, CommandResult};
use ecash_core::types::TransactionStatus;
use ecash_wallet::{
    client::{calculate_input_fee, MintClient},
    stable::StableOperation,
};
use std::sync::atomic::Ordering;
use tauri::State;

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[tauri::command]
pub async fn stable_operations(state: State<'_, AppState>) -> CommandResult<Vec<StableOperation>> {
    let (guard, _, _) = state.lock_and_get_wallet().await?;
    Ok(guard.as_ref().unwrap().stable_operations.clone())
}

/// Conservative funding cap: reserve plus fees for all existing inputs and up to 64 new melt proofs.
#[tauri::command]
pub async fn stable_funding_quote(
    invoice: String,
    mint_url: String,
    state: State<'_, AppState>,
) -> CommandResult<u64> {
    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let client = MintClient::new(&mint_url);
    let ((_, _, total), keysets) = tokio::try_join!(
        client.request_melt_quote(&invoice),
        client.fetch_quote_keysets()
    )?;
    if keysets.is_empty() {
        return Err(CommandError("Mint returned no fee information".into()));
    }
    let max_ppk = keysets.iter().map(|ks| ks.input_fee_ppk).max().unwrap_or(0);
    let (guard, _, _) = state.lock_and_get_wallet().await?;
    let proofs = guard
        .as_ref()
        .unwrap()
        .proofs
        .get(&mint_url)
        .cloned()
        .unwrap_or_default();
    let input_fee = calculate_input_fee(&proofs, &keysets);
    total
        .checked_add(input_fee)
        .and_then(|v| {
            max_ppk
                .checked_mul(64)
                .and_then(|f| f.checked_add(999))
                .and_then(|f| v.checked_add(f / 1000))
        })
        .ok_or_else(|| CommandError("Funding quote overflow".into()))
}

fn validate_review_quote(
    operation: &StableOperation,
) -> CommandResult<()> {
    let valid = matches!(operation.protection_bps, 0 | 300)
        && operation.stage == "quoted"
        && matches!(operation.direction.as_str(), "toUsd" | "toSats")
        && operation.id.len() == 36
        && operation.quote_json.len() <= 131072
        && operation.expires_at > now()
        && operation.expires_at <= now() + 120
        && operation.output_amount.parse::<u64>().is_ok_and(|v| v > 0)
        && operation.max_debit.parse::<u64>().is_ok_and(|v| v > 0)
        && (operation.direction != "toUsd"
            || (operation.funding_sats > 0
                && !operation.funding_invoice.is_empty()
                && operation
                    .max_debit
                    .parse::<u64>()
                    .is_ok_and(|cap| operation.funding_sats <= cap)));
    if !valid {
        return Err(CommandError("Invalid or expired conversion quote.".into()));
    }
    if operation.direction == "toSats" { reviewed_receive_invoice(operation)?; }
    if operation.direction == "toUsd" {
        let invoice: lightning_invoice::Bolt11Invoice = operation
            .funding_invoice
            .parse()
            .map_err(|_| CommandError("Invalid funding invoice".into()))?;
        if invoice
            .expires_at()
            .is_none_or(|expiry| expiry.as_secs() <= now())
        {
            return Err(CommandError(
                "Funding invoice expired. Request a new quote.".into(),
            ));
        }
        if invoice.currency() != lightning_invoice::Currency::Bitcoin
            || invoice.amount_milli_satoshis() != operation.funding_sats.checked_mul(1000)
        {
            return Err(CommandError(
                "Funding invoice does not match the reviewed amount/network.".into(),
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn stable_refresh_quote(
    operation: StableOperation,
    expected_quote_json: String,
    expected_expires_at: u64,
    state: State<'_, AppState>,
) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet
        .stable_operations
        .iter()
        .position(|o| o.id == operation.id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let previous = wallet.stable_operations[pos].clone();
    let mut refreshed = previous.clone();
    if !refreshed.refresh_review(&operation, &expected_quote_json, expected_expires_at) {
        return Err(CommandError(
            "The review quote changed or confirmation already started.".into(),
        ));
    }
    validate_review_quote(&refreshed)?;
    wallet.stable_operations[pos] = refreshed.clone();
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet.stable_operations[pos] = previous;
        return Err(error.into());
    }
    Ok(refreshed)
}

#[tauri::command]
pub async fn stable_begin(
    operation: StableOperation,
    state: State<'_, AppState>,
    spark_state: State<'_, SparkState>,
) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    if spark_state.is_sending.load(Ordering::SeqCst) {
        return Err(CommandError(
            "Finish the Bitcoin payment before converting.".into(),
        ));
    }
    let wallet = guard.as_mut().unwrap();
    if wallet.stable_operations.iter().any(|o| o.active()) {
        return Err(CommandError("Finish the saved conversion first.".into()));
    }
    validate_review_quote(&operation)?;
    wallet.stable_operations.push(operation.clone());
    wallet.save_encrypted(&path, &passphrase)?;
    Ok(operation)
}

/// Reset only on a live observer rejection before *any* source payment approval.
/// The frontend never invokes this for uncertain SDK failures or after restart.
#[tauri::command]
pub async fn stable_recover_unsubmitted_conversion(id: String, state: State<'_, AppState>) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet.stable_operations.iter().position(|op| op.id == id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let previous = wallet.stable_operations[pos].clone();
    if !wallet.stable_operations[pos].recover_unsubmitted_protected() {
        return Err(CommandError("This conversion requires status reconciliation.".into()));
    }
    if let Err(failure) = wallet.save_encrypted(&path, &passphrase) {
        wallet.stable_operations[pos] = previous;
        return Err(failure.into());
    }
    Ok(wallet.stable_operations[pos].clone())
}

#[tauri::command]
pub async fn stable_fund(id: String, state: State<'_, AppState>) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet
        .stable_operations
        .iter()
        .position(|o| o.id == id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let op = wallet.stable_operations[pos].clone();
    if op.stage != "quoted" || op.direction != "toUsd" || op.expires_at <= now() {
        return Err(CommandError(
            "Funding cannot be repeated. Check the saved conversion status.".into(),
        ));
    }
    let before_spend = (
        wallet.derivation_index,
        wallet.transactions.len(),
        wallet.balance_by_mint(),
    );
    wallet.stable_operations[pos].stage = "funding".into();
    wallet.save_encrypted(&path, &passphrase)?;
    let result = ecash_wallet::pay_invoice_capped(
        wallet,
        &path,
        &passphrase,
        &op.funding_invoice,
        Some(op.mint_url),
        Some(
            op.max_debit
                .parse()
                .map_err(|_| CommandError("Invalid debit cap".into()))?,
        ),
        Some(format!("stable-fund-{}", id)),
    )
    .await;
    if let Err(error) = result {
        // pay_invoice advances derivation before a swap, and records/removes proofs before a melt.
        // Only a failure with no spend-state change can safely return to the cancellable quote.
        let after_spend = (
            wallet.derivation_index,
            wallet.transactions.len(),
            wallet.balance_by_mint(),
        );
        if before_spend == after_spend {
            wallet.stable_operations[pos].stage = "quoted".into();
            if wallet.save_encrypted(&path, &passphrase).is_err() {
                wallet.stable_operations[pos].stage = "funding".into();
            }
        }
        return Err(error.into());
    }
    wallet.stable_operations[pos].stage = "funded".into();
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet.stable_operations[pos].stage = "funding".into();
        return Err(error.into());
    }
    Ok(wallet.stable_operations[pos].clone())
}

#[tauri::command]
pub async fn stable_advance(
    id: String,
    expected_stage: String,
    next_stage: String,
    payment_id: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet
        .stable_operations
        .iter()
        .position(|o| o.id == id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let op = &wallet.stable_operations[pos];
    let funding_recovered = op.stage == "funding"
        && next_stage == "funded"
        && wallet.transactions.iter().any(|t| {
            t.id == format!("stable-fund-{}", id) && t.status == TransactionStatus::Success
        });
    if op.stage != expected_stage
        || (!op.can_transition(&next_stage)
            && !funding_recovered
            && !(op.stage == next_stage && payment_id.is_some() && op.payment_id.is_none()))
    {
        return Err(CommandError(
            "Conversion state changed. Reload its status.".into(),
        ));
    }
    if op.stage == "quoted"
        && next_stage == "converting"
        && (op.direction != "toSats" || op.expires_at <= now())
    {
        return Err(CommandError("Request a fresh conversion quote.".into()));
    }
    if op.stage == "quoted" && next_stage == "converting" && op.direction == "toSats"
        && !wallet.transactions.iter().any(|tx| tx.id == op.mint_quote_id
            && tx.mint_url == op.mint_url && tx.amount.to_string() == op.output_amount
            && tx.status == TransactionStatus::Pending
            && matches!(tx.tx_type, ecash_core::types::TransactionType::ReceiveLightning(_))) {
        return Err(CommandError("Prepare the selected receive invoice before conversion".into()));
    }
    if next_stage == "complete"
        && (op.direction == "toSats" || op.stage == "returning")
        && !wallet.transactions.iter().any(|t| {
            &t.id
                == if op.stage == "returning" {
                    &op.return_quote_id
                } else {
                    &op.mint_quote_id
                }
                && t.status == TransactionStatus::Success
        })
    {
        return Err(CommandError(
            "The mint has not issued the ecash yet. Check again shortly.".into(),
        ));
    }
    if next_stage == "complete"
        && op.direction == "toUsd"
        && op.stage != "returning"
        && payment_id.as_ref().or(op.payment_id.as_ref()).is_none()
    {
        return Err(CommandError(
            "Conversion payment has not been confirmed.".into(),
        ));
    }
    let previous = wallet.stable_operations[pos].clone();
    if previous.stage == "returnQuoted" && next_stage == "funded" {
        wallet.stable_operations[pos].return_quote_id.clear();
        wallet.stable_operations[pos].return_quote_json.clear();
        wallet.stable_operations[pos].return_amount = 0;
    }
    if previous.stage != "converting" && next_stage == "converting" {
        // Persist the SDK call shape before sending, so ambiguous new calls cannot be reset as legacy.
        wallet.stable_operations[pos].conversion_request_version = 1;
    }
    wallet.stable_operations[pos].stage = next_stage;
    if !wallet.stable_operations[pos].active() {
        wallet.stable_operations[pos].prior_payment_ids.clear();
    }
    if payment_id.is_some() {
        wallet.stable_operations[pos].payment_id = payment_id;
    }
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet.stable_operations[pos] = previous;
        return Err(error.into());
    }
    Ok(wallet.stable_operations[pos].clone())
}

#[tauri::command]
pub async fn stable_prepare_return(
    id: String,
    quote_id: String,
    quote_json: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet
        .stable_operations
        .iter()
        .position(|o| o.id == id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let op = &wallet.stable_operations[pos];
    if op.stage != "funded"
        || amount == 0
        || amount > op.funding_sats
        || quote_json.len() > 131072
        || !wallet
            .transactions
            .iter()
            .any(|t| t.id == quote_id && t.amount == amount && t.mint_url == op.mint_url)
    {
        return Err(CommandError(
            "Cannot prepare a refund for this operation.".into(),
        ));
    }
    wallet.stable_operations[pos].stage = "returnQuoted".into();
    wallet.stable_operations[pos].return_quote_id = quote_id;
    wallet.stable_operations[pos].return_quote_json = quote_json;
    wallet.stable_operations[pos].return_amount = amount;
    wallet.save_encrypted(&path, &passphrase)?;
    Ok(wallet.stable_operations[pos].clone())
}

/// Repair only the original AMM call shape that the SDK rejects before converting.
#[tauri::command]
pub async fn stable_recover_legacy_conversion(
    id: String,
    state: State<'_, AppState>,
) -> CommandResult<StableOperation> {
    let (mut guard, path, passphrase) = state.lock_and_get_wallet().await?;
    let wallet = guard.as_mut().unwrap();
    let pos = wallet
        .stable_operations
        .iter()
        .position(|o| o.id == id)
        .ok_or_else(|| CommandError("Conversion not found".into()))?;
    let previous = wallet.stable_operations[pos].clone();
    if !wallet.stable_operations[pos].recover_legacy_idempotency_rejection() {
        return Err(CommandError(
            "This operation is not a rejected legacy conversion. Check its payment status instead."
                .into(),
        ));
    }
    if let Err(error) = wallet.save_encrypted(&path, &passphrase) {
        wallet.stable_operations[pos] = previous;
        return Err(error.into());
    }
    Ok(wallet.stable_operations[pos].clone())
}

/// A live receive quote without history entries or allocating blinding outputs.
#[tauri::command]
pub async fn stable_mint_quote_preview(
    mint_url: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<super::receive::ReceiveLightningQuote> {
    let _ = state.get_passphrase()?;
    if amount == 0 {
        return Err(CommandError("Amount must be positive".into()));
    }
    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let (quote_id, invoice) = MintClient::new(&mint_url)
        .request_mint_quote(amount)
        .await?;
    Ok(super::receive::ReceiveLightningQuote {
        quote_id,
        invoice,
        amount,
    })
}

/// Parse the signed receive invoice while the quote is still unconfirmed.
fn reviewed_receive_invoice(op: &StableOperation) -> CommandResult<String> {
    let quote: serde_json::Value = serde_json::from_str(&op.quote_json)
        .map_err(|_| CommandError("Invalid receive preparation".into()))?;
    let invoice = quote.pointer("/paymentMethod/invoiceDetails/invoice/bolt11").and_then(|v| v.as_str())
        .filter(|invoice| invoice.len() <= 32768)
        .ok_or_else(|| CommandError("Invalid receive invoice".into()))?;
    let parsed: lightning_invoice::Bolt11Invoice = invoice.parse()
        .map_err(|_| CommandError("Invalid receive invoice".into()))?;
    let amount = op.output_amount.parse::<u64>().map_err(|_| CommandError("Invalid receive amount".into()))?;
    let expected_msat = amount.checked_mul(1000)
        .filter(|amount| *amount > 0).ok_or_else(|| CommandError("Invalid receive amount".into()))?;
    if amount == 0 || op.mint_quote_id.is_empty() || op.mint_quote_id.len() > 512
        || quote.pointer("/paymentMethod/type").and_then(|v| v.as_str()) != Some("bolt11Invoice")
        || parsed.currency() != lightning_invoice::Currency::Bitcoin
        || parsed.amount_milli_satoshis() != Some(expected_msat)
        || parsed.expires_at().is_none_or(|expiry| expiry.as_secs() <= now()) {
        return Err(CommandError("Receive invoice amount/network/expiry does not match the selected quote".into()));
    }
    Ok(invoice.to_owned())
}

/// On confirmation, promote the saved quote without issuing another invoice.
#[tauri::command]
pub async fn stable_accept_mint_quote(
    id: String,
    state: State<'_, AppState>,
) -> CommandResult<super::receive::ReceiveLightningQuote> {
    let op = {
        let (guard, _, _) = state.lock_and_get_wallet().await?;
        guard.as_ref().unwrap().stable_operations.iter().find(|op| op.id == id).cloned()
            .ok_or_else(|| CommandError("Conversion not found".into()))?
    };
    if op.stage != "quoted" || op.direction != "toSats" || op.expires_at <= now() {
        return Err(CommandError("Receive preparation requires a fresh unconfirmed conversion".into()));
    }
    let invoice = reviewed_receive_invoice(&op)?;
    let amount = op.output_amount.parse::<u64>().map_err(|_| CommandError("Invalid receive amount".into()))?;
    let mint_url = ecash_wallet::state::normalize_mint_url(&op.mint_url);
    MintClient::new(&mint_url).verify_unpaid_mint_quote(&op.mint_quote_id, amount, &invoice).await?;
    super::receive::persist_receive_quote(mint_url, amount, op.mint_quote_id, invoice, state, Some((id, op.quote_json))).await
}

#[cfg(test)]
mod receive_review_tests {
    use super::*;
    use bitcoin::{hashes::{sha256, Hash}, secp256k1::{Secp256k1, SecretKey}};
    use lightning_invoice::{Currency, InvoiceBuilder, PaymentSecret};

    fn invoice(currency: Currency, age: u64, amount: Option<u64>) -> String {
        // Public fixture key; no deployment or wallet key is used.
        let key = SecretKey::from_slice(&[7; 32]).unwrap();
        let builder = InvoiceBuilder::new(currency).description("conversion fixture".into())
            .payment_hash(sha256::Hash::from_slice(&[0; 32]).unwrap())
            .payment_secret(PaymentSecret([42; 32]))
            .duration_since_epoch(std::time::Duration::from_secs(now() - age))
            .expiry_time(std::time::Duration::from_secs(600)).min_final_cltv_expiry_delta(144);
        let builder = if let Some(amount) = amount {builder.amount_milli_satoshis(amount)} else {builder};
        builder.build_signed(|hash| Secp256k1::new().sign_ecdsa_recoverable(hash, &key)).unwrap().to_string()
    }
    fn operation(invoice: String) -> StableOperation {
        StableOperation {
            id:"00000000-0000-4000-8000-000000000001".into(), direction:"toSats".into(), stage:"quoted".into(),
            mint_url:"https://mint.example".into(), created_at:now(), expires_at:now()+60,
            output_amount:"900".into(), protection_bps:0, max_debit:"1000000".into(), funding_invoice:String::new(), funding_sats:0,
            mint_quote_id:"quote-one".into(), quote_json:serde_json::json!({"paymentMethod":{"type":"bolt11Invoice","invoiceDetails":{"invoice":{"bolt11":invoice}}}}).to_string(),
            payment_id:None, conversion_request_version:0, prior_payment_ids:vec![], return_quote_id:String::new(), return_quote_json:String::new(), return_amount:0,
        }
    }
    #[test]
    fn unconfirmed_receive_review_validates_without_a_history_transaction() {
        let op = operation(invoice(Currency::Bitcoin, 0, Some(900000)));
        assert!(validate_review_quote(&op).is_ok());
    }
    #[test]
    fn mismatched_expired_or_wrong_network_receive_reviews_are_rejected() {
        let mut wrong_amount = operation(invoice(Currency::Bitcoin, 0, Some(900000)));
        wrong_amount.output_amount = "901".into();
        assert!(validate_review_quote(&wrong_amount).is_err());
        assert!(validate_review_quote(&operation(invoice(Currency::BitcoinTestnet, 0, Some(900000)))).is_err());
        assert!(validate_review_quote(&operation(invoice(Currency::Bitcoin, 601, Some(900000)))).is_err());
        let mut overflow = operation(invoice(Currency::Bitcoin, 0, None));
        overflow.output_amount = u64::MAX.to_string();
        assert!(validate_review_quote(&overflow).is_err());
    }
}
