use crate::error::CommandResult;
use ecash_wallet::WalletState;
use ecash_wallet::client::MintClient;
use ecash_core::types::{
    Transaction, TransactionType, ReceiveLightningTransactionData, 
    TransactionStatus, split_into_powers_of_2,
};
use ecash_core::dhke::BlindingSession;
use ecash_core::derivation::TokenDerivation;
use serde::{Deserialize, Serialize};

use tauri::State;
use crate::commands::auth::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiveLightningQuote {
    pub quote_id: String,
    pub invoice: String,
    pub amount: u64,
}

#[tauri::command]
pub async fn receive_lightning(
    mint_url: String,
    amount: u64,
    state: State<'_, AppState>,
) -> CommandResult<ReceiveLightningQuote> {
    let path = state.wallet_path.clone();
    
    let passphrase = {
        let pass_lock = state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| crate::error::CommandError("Wallet is locked".to_string()))?
    };

    // Load wallet state
    let mut w_state = WalletState::load_encrypted(&path, &passphrase)?;

    let mint_url = ecash_wallet::state::normalize_mint_url(&mint_url);
    let client = MintClient::new(&mint_url);
    
    let (quote_id, invoice) = client.request_mint_quote(amount).await
        .map_err(|e| crate::error::CommandError(format!("Failed to get mint quote: {}", e)))?;

    let keyset = client.fetch_keyset().await
        .map_err(|e| crate::error::CommandError(format!("Failed to fetch keyset: {}", e)))?;

    let desired_amounts = split_into_powers_of_2(amount);
    
    let mut deriv = TokenDerivation::from_hex(&w_state.seed_hex)
        .map_err(|e| crate::error::CommandError(format!("Derivation error: {}", e)))?;
    deriv.index = w_state.derivation_index;

    let mut sessions = Vec::new();
    let mut outputs = Vec::new();

    for &amt in &desired_amounts {
        let index = deriv.index;
        let secret = deriv.next_secret();
        let sess = BlindingSession::new(&secret);
        outputs.push(serde_json::json!({
            "amount": amt,
            "id": keyset.id,
            "B_": sess.b_prime_hex()
        }));
        sessions.push((amt, sess, index));
    }

    w_state.derivation_index = deriv.index;
    
    let pending_tx = Transaction {
        id: quote_id.clone(), // Use quote_id as the transaction ID for easy polling
        tx_type: TransactionType::ReceiveLightning(ReceiveLightningTransactionData {
            quote_id: quote_id.clone(),
            outputs: outputs.clone(),
            blinding_sessions_hex: sessions.iter().map(|(_, sess, _)| sess.secret.clone()).collect(),
        }),
        amount,
        fee: 0,
        status: TransactionStatus::Pending,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        mint_url: mint_url.clone(),
    };
    w_state.transactions.insert(0, pending_tx);
    w_state.save_encrypted(&path, &passphrase)?;

    Ok(ReceiveLightningQuote {
        quote_id,
        invoice,
        amount,
    })
}
