//! Structured send failures shared by wallet operations and native adapters.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SendEcashErrorCode {
    InvalidRequest,
    WalletLocked,
    InsufficientFunds,
    ReviewRequired,
    ServiceUnavailable,
    OutcomeUnknown,
    InternalError,
}

#[derive(Debug, Serialize)]
pub struct SendEcashError {
    pub code: SendEcashErrorCode,
    pub message: String,
    pub tx_id: Option<String>,
}

impl SendEcashError {
    pub fn new(
        code: SendEcashErrorCode,
        message: impl Into<String>,
        tx_id: Option<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            tx_id,
        }
    }
}
