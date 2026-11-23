use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError(pub String);

impl From<anyhow::Error> for CommandError {
    fn from(err: anyhow::Error) -> Self {
        CommandError(err.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

pub use ecash_wallet::send_error::{SendEcashError, SendEcashErrorCode};

impl From<SendEcashError> for CommandError {
    fn from(error: SendEcashError) -> Self {
        CommandError(error.message)
    }
}

#[cfg(test)]
mod send_error_tests {
    use super::{CommandError, SendEcashError, SendEcashErrorCode};

    fn errors() -> Vec<SendEcashError> {
        [
            SendEcashErrorCode::InvalidRequest,
            SendEcashErrorCode::WalletLocked,
            SendEcashErrorCode::InsufficientFunds,
            SendEcashErrorCode::ReviewRequired,
            SendEcashErrorCode::ServiceUnavailable,
            SendEcashErrorCode::OutcomeUnknown,
            SendEcashErrorCode::InternalError,
        ]
        .into_iter()
        .enumerate()
        .map(|(index, code)| {
            let tx_id = if code == SendEcashErrorCode::OutcomeUnknown {
                Some("saved-send".to_string())
            } else {
                None
            };
            SendEcashError::new(code, format!("diagnostic-{index}"), tx_id)
        })
        .collect()
    }

    #[test]
    fn structured_send_errors_match_frontend_fixture() {
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/send-ecash-errors.json"))
                .unwrap();
        assert_eq!(serde_json::to_value(errors()).unwrap(), expected);
    }

    #[test]
    fn legacy_send_errors_remain_plain_message_strings() {
        for error in errors() {
            let message = error.message.clone();
            assert_eq!(
                serde_json::to_value(CommandError::from(error)).unwrap(),
                serde_json::Value::String(message)
            );
        }
    }
}
