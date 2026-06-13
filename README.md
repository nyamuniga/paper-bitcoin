# Physical Ecash

A Rust implementation of the [Cashu](https://github.com/cashubtc/nuts) blind-signature protocol for physical bearer notes.

## Overview

Paper notes with tamper-evident seals represent redeemable Bitcoin value. Tokens are issued by Cashu-compatible mints using DHKE blind signatures, encoded into printable SVG notes, and can be verified offline before redemption via Lightning.

```
┌──────────┐   blind sign   ┌──────────┐   SVG note   ┌──────────┐
│  Wallet  │─────────────→  │   Mint   │ ←─────────── │  Printer │
└──────────┘                └──────────┘               └──────────┘
     │                           │
     │ verify (offline)          │ redeem (online)
     ↓                           ↓
┌──────────┐               ┌──────────┐
│ Verifier │               │ Gateway  │
└──────────┘               └──────────┘
```

## Quick Start

```bash
# Build
cargo build --release

# Run the full demo (starts a local mint, issues a note, verifies, redeems)
cargo run -p ecash-cli -- demo

# Or step by step:
cargo run -p ecash-cli -- start-mint &          # start local mock mint
cargo run -p ecash-cli -- init                  # create wallet
cargo run -p ecash-cli -- issue 1000            # issue 1000 sat note → ./notes/
cargo run -p ecash-cli -- verify ./notes/<serial>.json
cargo run -p ecash-cli -- redeem ./notes/<serial>.json
```

## Production

Point `ECASH_MINT_URL` at any real Cashu mint:

```bash
export ECASH_MINT_URL=https://mint.minibits.cash/Bitcoin
cargo run -p ecash-cli -- issue 1000
```

## Workspace Structure

| Crate | Purpose |
|-------|---------|
| `ecash-core` | Cashu NUT-00 DHKE blind signatures + shared types |
| `ecash-mint` | Mock Cashu mint HTTP server (axum, auto-pays LN) |
| `ecash-wallet` | Multi-mint wallet client + proof management |
| `ecash-encoder` | Physical note SVG generator with dual QR codes |
| `ecash-verifier` | Offline integrity & format verifier |
| `ecash-cli` | End-to-end CLI (`ecash` binary) |

## Security Notes

- This is a **prototype**. Cryptographic code has not been audited.
- The mock mint uses a fixed seed `[0u8; 32]`. Use a random seed in production.
- Full blind-signature verification at redemption is done server-side by the mint.
- Offline verification checks format + integrity hash; DLEQ proofs (NUT-12) are a future upgrade.

## References

1. [Cashu NUTs](https://github.com/cashubtc/nuts) — protocol specification
2. [Cashu Dev Kit](https://github.com/cashubtc/cdk) — reference implementation
3. [k256](https://docs.rs/k256) — secp256k1 elliptic curve operations
