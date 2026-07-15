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

### Building for Production

You can build the app for multiple platforms. Note that for macOS builds on headless environments (like CI), you may need to bypass the Finder automation script by setting `CI=true`.

**macOS:**
```bash
CI=true npm run tauri build --release
```

**Windows:**
```bash
npm run tauri build --target x86_64-pc-windows-msvc
```

**Linux:**
```bash
npm run tauri build
```

**Android:**
```bash
npm run tauri android build
```

**iOS:**
```bash
npm run tauri ios build
```

### Running the CLI

By default, the CLI uses a remote mint.

```bash
# Build
cargo build --release

# Run step by step:
cargo run -p ecash-cli -- init                  # create wallet
cargo run -p ecash-cli -- issue 1000            # issue 1000 sat note → ./notes/
# Save payload to file
echo "ECASHZ:NCFOA0/..." > note.txt

# Verify using the file
cargo run -p ecash-cli -- verify "$(cat note.txt)"

# Save payload to file
echo "ECASHZ:NCFOA0/..." > note.txt

# Redeem using the file
cargo run -p ecash-cli -- redeem "$(cat note.txt)"
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
- **Direct Issuance & Redemption**: Notes can be funded directly from and redeemed directly back to your local ecash wallet without incurring Lightning Network routing fees. The DLEQ proofs are securely preserved and transferred into the note's compact payload.
- **NUT-15 Multi-Path Payments (MPP)**: The system supports redeeming a single note containing tokens from multiple independent mints via a unified Lightning invoice payment. If any leg of the MPP payment fails due to routing errors, the backend gracefully recovers the unspent note proofs directly into your local wallet to ensure no funds are lost.
- **QR Code Robustness**: Our QR processing features case-insensitive prefix decoding to seamlessly support third-party hardware scanners, mobile keyboards, and various OCR tools which might alter capitalization.

## References

1. [Cashu NUTs](https://github.com/cashubtc/nuts) — protocol specification
2. [Cashu Dev Kit](https://github.com/cashubtc/cdk) — reference implementation
3. [k256](https://docs.rs/k256) — secp256k1 elliptic curve operations
