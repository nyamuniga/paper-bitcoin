use super::auth::AppState;
use crate::error::{CommandError, CommandResult};
use ecash_core::types::Proof;
use ecash_wallet::client::MintClient;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

#[derive(Serialize)]
pub struct EcashPaymentQuote {
    pub token_amount: u64,
    pub receiver_fee: u64,
    pub sender_fee: u64,
    pub total: u64,
}

pub async fn quote(mint_url: &str, net: u64, proofs: &[Proof]) -> anyhow::Result<EcashPaymentQuote> {
    let client = MintClient::new(mint_url);
    let keysets = client.fetch_keysets().await?;
    let active = client.fetch_keyset().await?;
    let output_keyset = keysets
        .iter()
        .find(|ks| ks.id == active.id && ks.active && ks.unit == "sat")
        .ok_or_else(|| anyhow::anyhow!("No active sat keyset available"))?;
    if proofs
        .iter()
        .any(|p| !keysets.iter().any(|ks| ks.id == p.id && ks.unit == "sat"))
    {
        anyhow::bail!("Could not resolve wallet proof fees. Refresh the mint before paying.");
    }
    let token_amount = ecash_wallet::payment_request::recipient_token_amount(net, output_keyset.input_fee_ppk)?;
    let mut sorted = proofs.to_vec();
    sorted.sort_by_key(|p| p.amount);
    let mut selected = Vec::new();
    let mut available = 0u64;
    let mut sender_fee = 0;
    for proof in sorted {
        available = available
            .checked_add(proof.amount)
            .ok_or_else(|| anyhow::anyhow!("Balance overflow"))?;
        selected.push(proof);
        sender_fee = ecash_wallet::client::calculate_input_fee(&selected, &keysets);
        if available >= token_amount.saturating_add(sender_fee) {
            break;
        }
    }
    let total = token_amount
        .checked_add(sender_fee)
        .ok_or_else(|| anyhow::anyhow!("Payment overflow"))?;
    if total > 9_007_199_254_740_991 {
        anyhow::bail!("Payment and fees exceed the supported amount range");
    }
    if available < total {
        anyhow::bail!(
            "Insufficient balance including mint fees. Need {} sats.",
            total
        );
    }
    Ok(EcashPaymentQuote {
        token_amount,
        receiver_fee: token_amount - net,
        sender_fee,
        total,
    })
}

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
