use anyhow::{anyhow, Result};
use ecash_core::types::{ReceiveEcashTransactionData, Transaction, TransactionStatus, TransactionType};
use crate::state::WalletState;

/// Store an incoming token as history only. No proofs enter the spendable balance.
pub fn save_for_later(wallet: &mut WalletState, token: &str, now: u64) -> Result<String> {
    let token = token.trim();
    if token.len() > 28671 { return Err(anyhow!("Token is too large")); }
    let (mint, _, amount) = crate::decode_token_string(token)?;
    let url = reqwest::Url::parse(&mint)?;
    if !matches!(url.scheme(), "https" | "http") || !url.username().is_empty() || url.password().is_some() {
        return Err(anyhow!("Invalid mint URL"));
    }
    if amount > 9_007_199_254_740_991 { return Err(anyhow!("Token amount is too large")); }
    if let Some(tx) = wallet.transactions.iter_mut().find(|tx| matches!(&tx.tx_type,
        TransactionType::ReceiveEcash(data) if data.token_string == token)) {
        if tx.status != TransactionStatus::Success {
            if let TransactionType::ReceiveEcash(data) = &mut tx.tx_type { data.claim_deferred = true; }
            tx.status = TransactionStatus::Pending;
            tx.amount = amount;
            tx.fee = 0;
        }
        return Ok(tx.id.clone());
    }
    let id = format!("tx_receive_saved_{}", uuid::Uuid::new_v4());
    wallet.transactions.push(Transaction {
        id: id.clone(),
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: token.into(), invoice_id: None, claim_deferred: true,
        }),
        amount, fee: 0, status: TransactionStatus::Pending, timestamp: now, mint_url: mint,
    });
    Ok(id)
}

/// Start an explicit claim on the original history entry, retaining its identity.
pub fn record_claim_attempt(wallet: &mut WalletState, token: &str, mint: &str, amount: u64,
    fee: u64, invoice_id: Option<String>, now: u64) -> Result<String> {
    if let Some(tx) = wallet.transactions.iter_mut().find(|tx| matches!(&tx.tx_type,
        TransactionType::ReceiveEcash(data) if data.token_string == token)) {
        if tx.status == TransactionStatus::Success { return Err(anyhow!("Token is already claimed")); }
        if let TransactionType::ReceiveEcash(data) = &mut tx.tx_type {
            if invoice_id.is_some() && data.invoice_id.is_some() && data.invoice_id != invoice_id {
                return Err(anyhow!("Token belongs to another invoice"));
            }
            data.claim_deferred = false;
            if invoice_id.is_some() { data.invoice_id = invoice_id; }
        }
        tx.amount = amount;
        tx.fee = fee;
        tx.status = TransactionStatus::Pending;
        return Ok(tx.id.clone());
    }
    let id = format!("tx_receive_{}", uuid::Uuid::new_v4());
    wallet.transactions.push(Transaction {
        id: id.clone(),
        tx_type: TransactionType::ReceiveEcash(ReceiveEcashTransactionData {
            token_string: token.into(), invoice_id, claim_deferred: false,
        }),
        amount, fee, status: TransactionStatus::Pending, timestamp: now, mint_url: mint.into(),
    });
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ecash_core::types::Proof;

    fn token(unit: &str) -> String {
        crate::token::encode_token_v3("https://mint.example", &[Proof {
            amount: 8, id: "0011223344556677".into(), secret: "fixture".into(),
            c: format!("02{}", "11".repeat(32)), witness: None, c_prime: None, b_prime: None, dleq: None, derivation_index: 0,
        }], Some(unit)).unwrap()
    }

    #[test]
    fn saves_once_without_crediting_balance_and_preserves_deferred_flag() {
        let mut wallet = WalletState::new("00".into(), None);
        let token = token("sat");
        let id = save_for_later(&mut wallet, &token, 1).unwrap();
        assert_eq!(save_for_later(&mut wallet, &token, 2).unwrap(), id);
        assert_eq!(wallet.transactions.len(), 1);
        assert!(wallet.proofs.is_empty());
        let tx = &wallet.transactions[0];
        assert_eq!(tx.status, TransactionStatus::Pending);
        assert_eq!(tx.amount, 8);
        let restored: Transaction = serde_json::from_str(&serde_json::to_string(tx).unwrap()).unwrap();
        assert!(matches!(restored.tx_type, TransactionType::ReceiveEcash(data) if data.claim_deferred));
    }

    #[test]
    fn rejects_invalid_or_wrong_unit_tokens() {
        let mut wallet = WalletState::new("00".into(), None);
        assert!(save_for_later(&mut wallet, "garbage", 1).is_err());
        assert!(save_for_later(&mut wallet, &token("usd"), 1).is_err());
        assert!(wallet.transactions.is_empty());
    }

    #[test]
    fn explicit_claim_reuses_saved_card_and_failed_retry_does_not_duplicate_it() {
        let mut wallet = WalletState::new("00".into(), None);
        let token = token("sat");
        let id = save_for_later(&mut wallet, &token, 1).unwrap();
        assert_eq!(record_claim_attempt(&mut wallet, &token, "https://mint.example", 7, 1, None, 2).unwrap(), id);
        assert!(matches!(&wallet.transactions[0].tx_type,
            TransactionType::ReceiveEcash(data) if !data.claim_deferred));
        wallet.transactions[0].status = TransactionStatus::Failed;
        assert_eq!(record_claim_attempt(&mut wallet, &token, "https://mint.example", 7, 1, None, 3).unwrap(), id);
        assert_eq!(wallet.transactions.len(), 1);
        assert_eq!(wallet.transactions[0].fee, 1);
        assert_eq!(wallet.transactions[0].timestamp, 1);
        assert!(wallet.proofs.is_empty());
    }

    #[tokio::test]
    async fn background_status_recovery_does_not_claim_deferred_tokens() {
        let mut wallet = WalletState::new("00".into(), None);
        save_for_later(&mut wallet, &token("sat"), 1).unwrap();
        let diff = crate::history::check_transaction_network(&wallet.transactions[0], None).await.unwrap();
        assert!(matches!(diff, crate::history::TransactionDiff::NoChange));
        assert!(wallet.proofs.is_empty());
    }

    #[test]
    fn encrypted_wallet_roundtrip_preserves_token_for_later() {
        let mut wallet = WalletState::new("00".into(), None);
        let token = token("sat");
        save_for_later(&mut wallet, &token, 1).unwrap();
        let path = std::env::temp_dir().join(format!("deferred-ecash-{}.json", uuid::Uuid::new_v4()));
        wallet.save_encrypted(&path, "fixture-passphrase").unwrap();
        let file = std::fs::read_to_string(&path).unwrap();
        assert!(!file.contains(&token));
        let restored = WalletState::load_encrypted(&path, "fixture-passphrase").unwrap();
        std::fs::remove_file(path).unwrap();
        assert!(matches!(&restored.transactions[0].tx_type,
            TransactionType::ReceiveEcash(data) if data.claim_deferred && data.token_string == token));
        assert!(restored.proofs.is_empty());
    }
}
