use ecash_core::types::{Transaction, TransactionStatus, TransactionType};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedEcashInvoice {
    pub id: String,
    pub amount: u64,
    pub mint: String,
    pub qr: String,
    pub description: String,
    pub created_at: u64,
    pub secret_hex: String,
    pub relays: Vec<String>,
    pub pending_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EcashInvoiceSummary {
    pub id: String,
    pub amount: u64,
    pub mint: String,
    pub description: String,
    pub created_at: u64,
    pub status: &'static str,
}

impl SavedEcashInvoice {
    /// Append validated fallback routes without losing any previously advertised inbox.
    pub fn add_delivery_relays(&mut self, candidates: &[String]) -> bool {
        let previous = self.relays.clone();
        for relay in candidates {
            let relay = relay.trim_end_matches('/');
            if self.relays.len() < 4
                && !self
                    .relays
                    .iter()
                    .any(|saved| saved.trim_end_matches('/') == relay)
            {
                self.relays.push(relay.to_owned());
            }
        }
        self.relays != previous
    }

    pub fn summary(&self, transactions: &[Transaction]) -> EcashInvoiceSummary {
        let paid = transactions.iter().any(|tx| tx.status == TransactionStatus::Success &&
            matches!(&tx.tx_type, TransactionType::ReceiveEcash(data) if data.invoice_id.as_deref() == Some(self.id.as_str())));
        EcashInvoiceSummary {
            id: self.id.clone(),
            amount: self.amount,
            mint: self.mint.clone(),
            description: self.description.clone(),
            created_at: self.created_at,
            status: if paid {
                "paid"
            } else if self.pending_token.is_some() {
                "received"
            } else {
                "pending"
            },
        }
    }
}

impl std::fmt::Debug for SavedEcashInvoice {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SavedEcashInvoice")
            .field("id", &self.id)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::WalletState;
    fn request() -> SavedEcashInvoice {
        SavedEcashInvoice {
            id: "invoice-1".into(),
            amount: 100,
            mint: "https://mint.example".into(),
            qr: "creqAfixture".into(),
            description: "Coffee".into(),
            created_at: 1,
            secret_hex: "secret-fixture".into(),
            relays: vec!["wss://relay.example".into()],
            pending_token: Some("cashuBfixture".into()),
        }
    }
    #[test]
    fn new_delivery_routes_preserve_old_routes_and_survive_restart() {
        let mut invoice = request();
        let original_key = invoice.secret_hex.clone();
        let original_qr = invoice.qr.clone();
        let candidates = vec![
            "wss://relay.example/".into(),
            "wss://new-one.example".into(),
            "wss://new-two.example".into(),
            "wss://new-three.example".into(),
        ];
        assert!(invoice.add_delivery_relays(&candidates));
        assert_eq!(invoice.relays.len(), 4);
        assert_eq!(invoice.relays[0], "wss://relay.example");
        assert_eq!(invoice.secret_hex, original_key);
        assert_eq!(invoice.qr, original_qr);
        assert!(!invoice.add_delivery_relays(&candidates));
        let restored: SavedEcashInvoice =
            serde_json::from_str(&serde_json::to_string(&invoice).unwrap()).unwrap();
        assert_eq!(restored.relays, invoice.relays);
    }
    #[test]
    fn older_wallets_load_without_invoice_records() {
        let value =
            serde_json::json!({"seed_hex":"00","mnemonic":null,"derivation_index":0,"proofs":{}});
        let wallet: WalletState = serde_json::from_value(value).unwrap();
        assert!(wallet.ecash_invoices.is_empty());
    }
    #[test]
    fn requests_and_unclaimed_tokens_survive_encrypted_wallet_restart() {
        let mut wallet = WalletState::new("00".into(), None);
        wallet.ecash_invoices.push(request());
        let path =
            std::env::temp_dir().join(format!("bitnotes-invoice-{}.json", uuid::Uuid::new_v4()));
        wallet.save_encrypted(&path, "test-passphrase").unwrap();
        let disk = std::fs::read_to_string(&path).unwrap();
        assert!(!disk.contains("secret-fixture"));
        assert!(!disk.contains("cashuBfixture"));
        let restored = WalletState::load_encrypted(&path, "test-passphrase").unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(restored.ecash_invoices[0].secret_hex, "secret-fixture");
        assert_eq!(
            restored.ecash_invoices[0].pending_token.as_deref(),
            Some("cashuBfixture")
        );
        let summary = serde_json::to_string(&restored.ecash_invoices[0].summary(&[])).unwrap();
        assert!(!summary.contains("secret"));
        assert!(!summary.contains("cashuB"));
        assert!(summary.contains("received"));
    }
    #[test]
    fn paid_status_requires_a_successful_receipt_for_this_exact_request() {
        let invoice = request();
        let mut receipt = Transaction {
            id: "tx-1".into(),
            tx_type: TransactionType::ReceiveEcash(
                ecash_core::types::ReceiveEcashTransactionData {
                    token_string: "cashuBfixture".into(),
                    claim_deferred: false,
                    invoice_id: Some(invoice.id.clone()),
                },
            ),
            amount: 100,
            fee: 0,
            status: TransactionStatus::Pending,
            timestamp: 1,
            mint_url: invoice.mint.clone(),
        };
        assert_eq!(invoice.summary(&[receipt.clone()]).status, "received");
        receipt.status = TransactionStatus::Success;
        assert_eq!(invoice.summary(&[receipt.clone()]).status, "paid");
        if let TransactionType::ReceiveEcash(data) = &mut receipt.tx_type {
            data.invoice_id = Some("another-invoice".into());
        }
        assert_eq!(invoice.summary(&[receipt]).status, "received");
    }
    #[test]
    fn locking_wallet_clears_invoice_secrets_and_unclaimed_tokens_from_memory() {
        let mut wallet = WalletState::new("00".into(), None);
        wallet.ecash_invoices.push(request());
        wallet.zeroize_secrets();
        assert!(wallet.ecash_invoices[0].secret_hex.is_empty());
        assert!(wallet.ecash_invoices[0].pending_token.is_none());
    }
}
