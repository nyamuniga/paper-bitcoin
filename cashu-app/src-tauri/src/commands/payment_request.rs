use super::auth::AppState;
use crate::error::{CommandError, CommandResult};
use ecash_wallet::client::MintClient;
use serde_json::{json, Value};
use tauri::State;

pub use ecash_wallet::payment_quote::{quote, EcashPaymentQuote};

#[tauri::command]
pub async fn ecash_payment_quote(
    mint_url: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<EcashPaymentQuote> {
    let (wallet, _, _) = state.lock_and_get_wallet().await?;
    let proofs = wallet
        .as_ref()
        .unwrap()
        .proofs
        .get(&mint_url)
        .cloned()
        .unwrap_or_default();
    drop(wallet);
    quote(&mint_url, amount, &proofs).await.map_err(Into::into)
}

#[tauri::command]
pub async fn ecash_resume_payment(
    request: String,
    state: State<'_, AppState>,
) -> CommandResult<Option<Value>> {
    let (wallet, _, _) = state.lock_and_get_wallet().await?;
    let tx = wallet.as_ref().unwrap().transactions.iter().rev().find(|tx| {
        matches!(&tx.tx_type, ecash_core::types::TransactionType::Send(data) if data.payment_request.as_ref() == Some(&request))
    }).cloned();
    drop(wallet);
    let Some(tx) = tx else { return Ok(None) };
    let ecash_core::types::TransactionType::Send(data) = tx.tx_type else {
        unreachable!()
    };
    if data.token_string.is_empty() {
        return Err(CommandError("This payment has an unresolved mint operation. Recover it from History before retrying.".into()));
    }
    let token = ecash_wallet::encode_token_v4(&tx.mint_url, &data.proofs, Some("sat"))?;
    Ok(Some(
        json!({"token": token, "token_v3": data.token_string, "tx_id": tx.id, "mint_url": tx.mint_url}),
    ))
}

#[tauri::command]
pub async fn ecash_validate_payment(
    token: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let _ = state.get_passphrase()?;
    let (mint, mut proofs, total) = ecash_wallet::decode_token_string(&token)?;
    let client = MintClient::new(&mint);
    let keysets = client.fetch_keysets().await?;
    ecash_wallet::payment_request::resolve_keysets(&mut proofs, &keysets)?;
    if proofs.is_empty() {
        return Err(CommandError(
            "Unable to verify the payment's mint fees. Keep the token and retry.".into(),
        ));
    }
    let fee = ecash_wallet::client::calculate_input_fee(&proofs, &keysets);
    if total.saturating_sub(fee) < amount {
        return Err(CommandError("The prepared token no longer covers the merchant's input fees. Keep it in History; do not pay again until it is recovered.".into()));
    }
    let ys: Vec<String> = proofs
        .iter()
        .map(|p| {
            ecash_core::dhke::point_to_hex(&ecash_core::dhke::hash_to_curve(p.secret.as_bytes()))
        })
        .collect();
    let states = client.check_state(&ys).await?;
    if ys
        .iter()
        .any(|y| states.get(y).map(String::as_str) != Some("UNSPENT"))
    {
        return Err(CommandError(
            "This token is spent, pending, or its state is unknown. Check History before retrying."
                .into(),
        ));
    }
    Ok(())
}
