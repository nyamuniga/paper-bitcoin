use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Hex decode error: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("Invalid elliptic-curve point encoding")]
    InvalidPoint,

    #[error("Invalid scalar value")]
    InvalidScalar,

    #[error("Key error: {0}")]
    Key(String),
}

pub type Result<T> = std::result::Result<T, Error>;
