# Physical eCash: Technical Documentation

This document outlines the architecture and mechanics of the Physical eCash CLI, specifically focusing on the complex Lightning Network routing and state management required to provide a frictionless "1-Invoice" user experience while handling multi-mint tokens under the hood.

## 1. Core Concept

The system allows users to issue physical bearer instruments (paper notes with QR codes) backed by Bitcoin via the Cashu protocol. To prevent a single point of failure, notes can be backed by funds split across multiple independent Mints.

Because Cashu proofs are locked to specific Mints, aggregating funds from multiple Mints requires routing Lightning Network payments between them. This is completely abstracted from the user through the **Hub-and-Spoke Routing Engine**.

## 2. Hub-and-Spoke Routing Engine

To coordinate multi-mint tokens without burdening the user with multiple invoices, the system utilizes a **Hub-and-Spoke** routing model.

```text
====================================================================
                     1. ISSUANCE FLOW (Auto-Distribution)
====================================================================
 
         [ USER ] ──(1. Pays Single Master Invoice)──┐
                                                     ▼
┌─────────────────────────────────┐           [ HUB MINT ]
│         WALLET ENGINE           │                  │
│  (Orchestrator / ecash-wallet)  │                  │ (3. Pays Child
│                                 │                  │     Invoices via
│  [Quote Math]                   │                  │     Lightning)
│  Child = Allocation + Buffer    │                  ▼
│  Hub = FaceVal + Σ(Buffers)     │      ┌───────────┴───────────┐
│                                 │      ▼                       ▼
│  1. Requests Hub Master Quote   │ [ CHILD MINT A ]        [ CHILD MINT B ]
│  2. Requests Child Quotes       │      ▲                       ▲
│  3. Commands Hub to pay Children│      │                       │
│  4. Fetches & Saves Signatures  ├──────┴────────(4)────────────┘
└─────────────────────────────────┘ 


====================================================================
                     2. REDEMPTION FLOW (Auto-Consolidation)
====================================================================

         [ USER ] ◄──(4. Final Lightning Payout)─────┐
            ▲                                        │
            │(1. Provides Note & Invoice)            │
            │                                        │
┌───────────┴─────────────────────┐            [ HUB MINT ]
│         WALLET ENGINE           │                  ▲
│  (Orchestrator / ecash-wallet)  │                  │
│                                 │                  │ (3. Sweeps child
│  [Quote Math]                   │                  │     funds via LN)
│  DummyQuote = Child Balance     │                  │
│  EstFee = Child.Estimate(Dummy) │      ┌───────────┴───────────┐
│  RealQuote = Balance - EstFee   │      │                       │
│                                 │ [ CHILD MINT A ]        [ CHILD MINT B ]
│  1. Scans Note & Gets User Inv  │      ▲                       ▲
│  2. Computes Exact Routing Fees │      │                       │
│  3. Melts Child Tokens to Hub   ├──────┴────────(3)────────────┘
│  4. Melts Hub Tokens to User    │      
└─────────────────────────────────┘ 
====================================================================
```

- **The Hub Mint:** One mint is dynamically designated as the central "Hub". It acts as the primary liquidity pool for the operation.
- **The Child Mints (Spokes):** The remaining mints act as "spokes". Funds are routed between the Hub and the Spokes via the Lightning Network.
- **The Routing Agent:** The `ecash-wallet` engine orchestrates these swaps seamlessly in the background.

By treating one mint as a central clearinghouse, complex multi-party swaps are reduced to a series of direct Lightning payments.

## 3. Note Issuance (Auto-Distribution)

When a user issues a multi-mint note, they only interact with a single Lightning invoice.

### The Over-Funding Strategy
Sweeping funds between mints incurs Lightning Network routing fees. To ensure the final recipient can redeem the physical note for its exact Face Value without paying these fees out-of-pocket, the note is **over-funded** at issuance.

1. **Allocation & Buffer:** The CLI divides the desired Face Value across the requested mints. It then calculates a hidden fee reserve for each mint (`max(10 sats, 3% of allocation)`).
2. **Hub Selection:** The CLI selects the first mint as the "Hub Mint" and requests a single master Lightning invoice covering the total Face Value + all fee reserves.
3. **The Mint Swap:** The user pays this massive invoice from their phone. The CLI then sequentially generates quotes at the child mints and pays them using the funds sitting at the Hub Mint.
4. **Result:** The physical note is printed with valid, over-funded Cashu proofs distributed securely across all the mints.

## 4. Note Redemption (Auto-Consolidation)

When a recipient scans the note, they simply provide a Lightning Invoice for the exact Face Value. The CLI acts as an automated routing agent to consolidate the funds.

### Dynamic Full-Balance Sweeps
You cannot blindly subtract a flat fee when sweeping a child mint to the Hub Mint, as doing so might throw away too much of the reserve and result in a shortfall.

1. The CLI queries the Hub Mint for a "dummy quote" of the exact balance held on the child mint.
2. It asks the child mint to estimate the EXACT Lightning routing fee required to pay that dummy quote.
3. It then requests a real quote from the Hub Mint for exactly `Balance - Exact Fee` and melts the child proofs to pay it.
4. This perfectly funnels every available satoshi to the Hub Mint without leaving unnecessary change behind.

### The Final Payout
Once all funds are consolidated at the Hub Mint, the CLI asks the Hub Mint to pay the user's external Lightning invoice. 

> [!TIP]
> **What happens to the leftover routing buffer?**
> If the actual Lightning routing fees were cheaper than the buffer collected during issuance, the Mint returns the unused buffer as *change*. The CLI unblinds these change signatures and deposits them safely into the user's local Wallet Dashboard.

## 5. Failure State Management

Multi-stage Lightning swaps are inherently fragile. A routing node might go offline, or the user might provide an expired/invalid invoice. 

If the final Lightning payout fails after the funds have already been consolidated at the Hub Mint, the original physical note proofs are now technically *spent*. If the CLI simply exited, the user's funds would be permanently lost.

### Transaction Journal & Safe Recovery
To prevent data loss and optimize network performance, the backend engine executes operations with high concurrency while keeping state mutations atomic.

- **Concurrent Swaps:** When redeeming from multiple child mints, the engine spawns asynchronous futures (via `join_all`) to melt proofs simultaneously across all mints. 
- **Idempotency & Retries:** If a Mint connection times out during issuance, it might return an `outputs already signed` error on retry. The frontend handles these transient idempotency errors gracefully through background polling without alarming the user.
- **Journaled Transactions:** Before sweeping or minting, a `Pending` transaction is persisted to the `WalletState`. If the app crashes or network dies mid-flight, the `resume_pending_transactions` routine automatically recovers signatures and finalizes the operation upon restart.
- **Atomic Commits:** The engine saves the modified proofs to disk *before* propagating success to the user, ensuring funds are never orphaned.

### Offline Mints During Redemption (The "All-or-Nothing" Rule)
Because a physical note's total Face Value is distributed across $N$ mints, what happens if one of those mints is completely offline when the recipient tries to redeem the note?

To ensure the recipient **always receives the full Face Value**, the routing engine enforces an **All-or-Nothing** atomic constraint.
1. The engine pings all $N$ mints before attempting any swaps.
2. If any child mint is unreachable, its allocated portion of the Face Value is inaccessible.
3. Rather than performing a partial redemption (which would pay the user less than the printed Face Value and break the bearer instrument contract), the orchestrator immediately **aborts the transaction**.
4. All proofs remain perfectly intact and unspent. The user is instructed to simply try the redemption again later when the mint's server returns online.

The funds are caught in the user's local dashboard, where they can be manually withdrawn or retried if a remote mint temporarily goes offline.

## 6. Wallet Architecture

The `WalletState` (saved in `~/.ecash/wallet.json`) acts as both the fallback safety net and a standard Cashu wallet.

- **Offline Ignorance:** When paying an invoice directly from the dashboard, the wallet iterates through the known mints. If a mint is offline (e.g., local mock mints), the CLI gracefully catches the network timeout and skips to the next mint, ensuring offline infrastructure doesn't block access to healthy funds.
- **Change Collection:** Any Lightning invoice payment made from the wallet automatically calculates maximum possible change, generates blind signatures, and sweeps the change back into the local state.

## 7. Codebase Navigation

The project is structured as a modular Cargo workspace. If you are exploring the source code, here is where to look to understand the system:

### 1. `ecash-core` (The Primitives)
Contains the shared data types and cryptographic functions used by all other crates.
- **`src/dhke.rs`**: The heart of the cryptography. Contains the `hash_to_curve` logic and blind signature verification based on the Cashu NUT-00 spec.
- **`src/types.rs`**: Defines the standard `TokenV3`, `Proof`, and `BlindSignature` structs that mints and wallets pass around.
- **`src/compact.rs`**: Handles the binary encoding/decoding. This compresses a massive JSON token into a tiny binary payload that can fit inside a physical QR code.

### 2. `ecash-mint` (The Mock Server)
A standalone `axum` HTTP server simulating a Cashu Mint.
- **`src/server.rs`**: Maps the HTTP endpoints (`/keys`, `/mint/quote`, `/mint`, `/melt`).
- **`src/lib.rs`**: Contains the dummy state machine. It magically auto-pays any Lightning invoices you throw at it to make local testing effortless.

### 3. `ecash-wallet` (The Routing Engine)
This crate contains the heavy lifting for the Hub-and-Spoke model.
- **`src/lib.rs`**: 
  - `WalletState`: The struct that holds local balances, seeds, and the transaction journal.
  - `issue_multimint_note()`: The function that implements the "Auto-Distribution" issuance flow.
  - `redeem_note()`: The function that implements the "Auto-Consolidation" sweep using `futures::future::join_all` for concurrent melting.
  - `resume_pending_transactions()`: The safety net that runs on startup to recover from failed atomic operations.

### 4. `ecash-encoder` (The Printer)
Generates the physical SVG artwork.
- **`src/lib.rs`**: Takes the public/private payload data, generates dual QR codes using the `qrcode` crate, and injects them into a beautiful, styled SVG canvas ready for printing. Handles the visual differentiation between strategies.

### 5. `ecash-verifier` (The Auditor)
Offline integrity checking.
- **`src/lib.rs`**: Contains `verify_offline_integrity()`. It mathematically ensures the proofs inside the QR code correctly map to the mint's public keys without making a single HTTP request.

### 6. `cashu-app` (The Frontend App)
A native cross-platform application built with Tauri and React.
- **`src-tauri/src/commands/`**: Rust backend bindings. For example, `redeem.rs` and `issue.rs` expose the `ecash-wallet` engine to the React frontend.
- **`src/pages/`**: The React UI. `Issue.tsx` provides the multi-mint selection menu and handles background polling to prevent race conditions. `Scan.tsx` requests camera permissions and decodes the physical notes.

### 7. `ecash-cli` (The Terminal interface)
The command-line wrapper.
- **`src/main.rs`**: Uses `clap` and `inquire` to build interactive terminal menus. It parses user input and calls the underlying `ecash-wallet` orchestrator.
