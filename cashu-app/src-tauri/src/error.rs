use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError(pub String);

impl From<anyhow::Error> for CommandError {
    fn from(err: anyhow::Error) -> Self {
        CommandError(err.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
