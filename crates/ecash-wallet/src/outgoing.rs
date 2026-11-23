//! Pure construction of outgoing eCash records, payloads and responses.

use crate::token::{encode_token_v3, encode_token_v4};
use anyhow::{anyhow, Result};
use ecash_core::types::{
    Proof, SendTransactionData, Transaction, TransactionStatus, TransactionType,
};

/// Both wire formats, encoded before the caller records send success.
pub struct OutgoingTokens {
    pub token_v3: String,
    pub token_v4: String,
}

/// The existing send response shared by the legacy and structured commands.
#[derive(serde::Serialize)]
pub struct SendEcashResult {
    pub token: String,
    pub token_v3: String,
    pub token_v4: String,
    pub tx_id: String,
}

/// Caller-supplied fields for a pending send; identity and time stay caller-owned.
pub struct PendingSend {
    pub id: String,
    pub payment_request: Option<String>,
    pub proofs: Vec<Proof>,
    pub amount: u64,
    pub fee: u64,
    pub timestamp: u64,
    pub mint_url: String,
}

impl PendingSend {
    /// Build the recovery record without saving, normalizing or spending proofs.
    pub fn into_transaction(self) -> Transaction {
        Transaction {
            id: self.id,
            tx_type: TransactionType::Send(SendTransactionData {
                payment_request: self.payment_request,
                token_string: String::new(), // Populated only after a successful swap.
                proofs: self.proofs,
            }),
            amount: self.amount,
            fee: self.fee,
            status: TransactionStatus::Pending,
            timestamp: self.timestamp,
            mint_url: self.mint_url,
        }
    }
}

/// Encode sat-denominated proofs without changing wallet or transaction state.
pub fn encode_outgoing_tokens(mint_url: &str, proofs: &[Proof]) -> Result<OutgoingTokens> {
    let token_v3 = encode_token_v3(mint_url, proofs, Some("sat"))
        .map_err(|error| anyhow!("Failed to encode token v3: {}", error))?;
    let token_v4 = encode_token_v4(mint_url, proofs, Some("sat"))
        .map_err(|error| anyhow!("Failed to encode token v4: {}", error))?;
    Ok(OutgoingTokens { token_v3, token_v4 })
}

impl OutgoingTokens {
    /// Attach the caller's persisted transaction ID; V3 remains the default.
    pub fn into_send_result(self, tx_id: String) -> SendEcashResult {
        SendEcashResult {
            // Keep cashuA as the primary token for broad wallet compatibility.
            token: self.token_v3.clone(),
            token_v3: self.token_v3,
            token_v4: self.token_v4,
            tx_id,
        }
    }
}
