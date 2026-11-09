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
    wallet: &ecash_wallet::WalletState,
) -> CommandResult<()> {
    let valid = operation.stage == "quoted"
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
                    .is_ok_and(|cap| operation.funding_sats <= cap)))
        && (operation.direction != "toSats"
            || wallet.transactions.iter().any(|t| {
                t.id == operation.mint_quote_id
                    && t.mint_url == operation.mint_url
                    && t.amount.to_string() == operation.output_amount
                    && t.status == TransactionStatus::Pending
                    && matches!(
                        t.tx_type,
                        ecash_core::types::TransactionType::ReceiveLightning(_)
                    )
            }));
    if !valid {
        return Err(CommandError("Invalid or expired conversion quote.".into()));
    }
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
    validate_review_quote(&refreshed, wallet)?;
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
    validate_review_quote(&operation, wallet)?;
    wallet.stable_operations.push(operation.clone());
    wallet.save_encrypted(&path, &passphrase)?;
    Ok(operation)
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
