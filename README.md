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

## Real-World Applications

Physical eCash bridges the gap between the abstract Lightning Network and tangible human cash. Some immediate use cases include:
- **The Ultimate Onboarding & Gifting Tool:** Hand someone a beautifully printed $10 Bitcoin note in a birthday card. They don't need an app or knowledge of Lightning to hold the value. They can scan it to claim the funds whenever they are ready.
- **Tipping:** Leave a 5,000 satoshi physical tip at a restaurant for a waiter who doesn't have a wallet yet.
- **Offline Circular Economies:** In places like farmers' markets or areas with spotty internet, a physical note can trade hands 50 times completely offline with zero fees and instant settlement. Only the final merchant needs to scan it.
- **Event "Drink Tickets":** Conferences can issue physical multi-mint notes as tickets. Vendors accept them physically and sweep them into their Lightning nodes at the end of the night, without having to trust the conference organizers.
- **Privacy-Preserving Cash:** When you hand someone a physical eCash note, there is zero digital footprint of that specific transaction. It is the ultimate privacy tool. A privacy advocate could issue a bunch of notes using their home node, go to a meetup, and trade them for goods with zero on-chain or Lightning surveillance possible until the final redemption.

## Quick Start

You can run the system purely from the command line, or use the modern Tauri desktop/mobile app.

### Running the App (Frontend UI)

```bash
cd cashu-app
npm install
npm run tauri dev
```

### Running the CLI

By default, the CLI uses a remote mint.

```bash
# Build
cargo build --release

# Run step by step:
cargo run -p ecash-cli -- init                  # create wallet
cargo run -p ecash-cli -- issue 1000            # issue 1000 sat note → ./notes/
cargo run -p ecash-cli -- verify ./notes/<serial>.json
cargo run -p ecash-cli -- redeem ./notes/<serial>.json
```

## Production

You can point `ECASH_MINT_URL` at any other real Cashu mint:

```bash
export ECASH_MINT_URL=https://mint.28waves.com
cargo run -p ecash-cli -- issue 1000
```

## Workspace Structure

| Crate | Purpose |
|-------|---------|
| `ecash-core` | Cashu NUT-00 DHKE blind signatures + shared types |
| `ecash-wallet` | Multi-mint wallet client + proof management |
| `ecash-encoder` | Physical note SVG generator (encodes block height + QR) |
| `ecash-verifier` | Offline integrity & format verifier |
| `ecash-cli` | End-to-end CLI (`ecash` binary) |
| `cashu-app` | Native Tauri React frontend (Desktop/Mobile) with QR scanning |

## Security & Architecture Notes

- This is a **prototype**. Cryptographic code has not been audited.
- Full blind-signature verification at redemption is done server-side by the mint.
- Offline verification checks format + integrity hash; DLEQ proofs (NUT-12) are a future upgrade.
- The system supports both legacy Hub-and-Spoke consolidation and modern **NUT-15 Multi-Path Payments (MPP)** for redemption, allowing a single Lightning invoice to be paid in parallel across multiple independent mints without requiring centralized consolidation or incurring double routing fees.

## References

1. [Cashu NUTs](https://github.com/cashubtc/nuts) — protocol specification
2. [Cashu Dev Kit](https://github.com/cashubtc/cdk) — reference implementation
3. [k256](https://docs.rs/k256) — secp256k1 elliptic curve operations
