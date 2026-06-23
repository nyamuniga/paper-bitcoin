//! Multi-mint Cashu wallet.
//!
//! Manages the wallet seed, derivation index, and stored proofs.
//! Talks to Cashu-compatible mint HTTP APIs to issue and redeem tokens.
//!
//! # Security
//! Wallet state is persisted as AES-256-GCM encrypted JSON.
//! The encryption key is derived from a user passphrase via Argon2id.
//! The seed itself is the entropy of a BIP39 24-word mnemonic phrase.




pub const DEFAULT_MINT_URL: &str = "https://mint.28waves.com";


pub mod state;
pub mod invoice;
pub mod client;
pub mod mint;
pub mod melt;
pub mod history;

pub use state::*;
pub use invoice::*;
pub use mint::*;
pub use melt::*;
pub use history::*;
pub use client::estimate_routing_fee_from_info;
