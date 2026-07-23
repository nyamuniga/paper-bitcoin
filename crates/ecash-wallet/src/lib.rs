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
pub mod client;
pub mod invoice;
pub mod swap;
pub mod melt;
pub mod mint;
pub mod history;
pub mod restore;
pub mod direct;

pub use state::*;
pub use invoice::*;
pub use mint::*;
pub use melt::*;
pub use history::*;
pub use swap::*;
pub use client::estimate_routing_fee_from_info;

pub async fn get_block_height() -> u64 {
    if let Ok(client) = reqwest::Client::builder()
        .user_agent("PaperBitcoin/1.0")
        .timeout(std::time::Duration::from_secs(5))
        .build() 
    {
        match client.get("https://mempool.space/api/blocks/tip/height").send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(text) = resp.text().await {
                    return text.trim().parse::<u64>().unwrap_or(0);
                }
            }
            Ok(resp) => {
                tracing::warn!("Mempool API returned HTTP {}: {}", resp.status(), resp.status().canonical_reason().unwrap_or("unknown"));
            }
            Err(e) => {
                tracing::warn!("Failed to reach mempool.space: {}", e);
            }
        }
        
        // Fallback
        if let Ok(fallback_resp) = client.get("https://blockstream.info/api/blocks/tip/height").send().await {
            if fallback_resp.status().is_success() {
                if let Ok(text) = fallback_resp.text().await {
                    return text.trim().parse::<u64>().unwrap_or(0);
                }
            } else {
                tracing::warn!("Blockstream API returned HTTP {}: {}", fallback_resp.status(), fallback_resp.status().canonical_reason().unwrap_or("unknown"));
            }
        }
    }
    0
}
