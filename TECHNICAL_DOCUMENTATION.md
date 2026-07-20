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
                     2A. REDEMPTION FLOW (Legacy Auto-Consolidation)
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
                     2B. REDEMPTION FLOW (Modern NUT-15 MPP)
====================================================================

         [ USER ] ◄──(3. Partial Lightning Payouts)──┐
            ▲                                        │
            │(1. Provides Note & Invoice)            │
            │                                        │
┌───────────┴─────────────────────┐            [ MINT A ]
│         WALLET ENGINE           │                  ▲
│  (Orchestrator / ecash-wallet)  │                  │
│                                 │                  │ (2. Melt proportional
│  [Quote Math]                   │                  │     shares in parallel)
│  Share = Prop. % of Total       │                  │
│  Quote = Mint.Quote(Inv, Share) │      ┌───────────┴───────────┐
│                                 │      │                       │
│  1. Scans Note & Gets User Inv  │ [ MINT B ]              [ MINT C ]
│  2. Calculates Proportional     │      ▲                       ▲
│     Shares for each Mint        │      │                       │
│  3. Melts Tokens in Parallel    ├──────┴────────(2)────────────┘
│     via NUT-15                  │      
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

## 4. Note Redemption (NUT-15 Multi-Path Payments)

When a recipient scans the note, they simply provide a Lightning Invoice for the exact Face Value. The CLI utilizes **NUT-15 (Partial Multi-Path Payments)** to pay this single invoice simultaneously from multiple mints.

### Why NUT-15?
Previously, the system used a "Hub-and-Spoke" auto-consolidation model where all child mints were swept into a central Hub mint before paying the final invoice. This had significant drawbacks:
## 4. Note Redemption

When a recipient scans the note, they simply provide a Lightning Invoice for the exact Face Value. The system supports two distinct redemption strategies:

### Strategy A: Modern NUT-15 (Multi-Path Payments)

The CLI utilizes **NUT-15 (Partial Multi-Path Payments)** to pay the single invoice simultaneously from multiple mints. This avoids consolidation entirely:

1. **Proportional Split:** The CLI calculates a proportional share of the total required amount (Face Value + Lightning fees) for each mint based on its available balance.
2. **Partial Quotes:** It requests a partial melt quote from each mint for its specific share of the invoice.
3. **Parallel Melting:** All mints are commanded to pay their portion of the invoice to the Lightning Network simultaneously using `join_all`.
4. **Atomic Refund:** If any single leg of the multi-path payment fails, the protocol ensures safety—the failing leg's funds remain intact, and we locally refund the other portions to the user's wallet state.

### Strategy B: Legacy Auto-Consolidation (Hub-and-Spoke)

The legacy flow uses a "Hub-and-Spoke" model where all child mints are swept into a central Hub mint before paying the final invoice. While this incurs double fees and sequential latency, it remains a supported fallback.

#### Dynamic Full-Balance Sweeps
1. The CLI queries the Hub Mint for a "dummy quote" of the exact balance held on the child mint.
2. It asks the child mint to estimate the EXACT Lightning routing fee required to pay that dummy quote.
3. It then requests a real quote from the Hub Mint for exactly `Balance - Exact Fee` and melts the child proofs to pay it.
4. This perfectly funnels every available satoshi to the Hub Mint without leaving unnecessary change behind.

#### The Final Payout
Once all funds are consolidated at the Hub Mint, the CLI asks the Hub Mint to pay the user's external Lightning invoice. 

> [!TIP]
> **What happens to the leftover routing buffer?**
> Since the original note was over-funded during issuance to cover routing fees, the actual Lightning routing fees are often cheaper than the buffer. The Mint returns the unused buffer as *change*. The CLI unblinds these change signatures and deposits them safely into the user's local Wallet Dashboard.

## 5. Failure State Management

Multi-stage Lightning swaps are inherently fragile. A routing node might go offline, or the user might provide an expired/invalid invoice. 

If the final Lightning payout fails after the funds have already been consolidated at the Hub Mint, the original physical note proofs are now technically *spent*. If the CLI simply exited, the user's funds would be permanently lost.

### Transaction Journal & Safe Recovery
To prevent data loss and optimize network performance, the backend engine executes operations with high concurrency while keeping state mutations atomic.

- **Concurrent Swaps:** When redeeming from multiple child mints, the engine spawns asynchronous futures (via `join_all`) to melt proofs simultaneously across all mints. 
- **Idempotency & Retries:** If a Mint connection times out during issuance, it might return an `outputs already signed` error on retry. The frontend handles these transient idempotency errors gracefully through background polling without alarming the user.
- **Journaled Transactions:** Before sweeping, minting, or paying a Lightning invoice, a `Pending` transaction is strictly persisted to the `WalletState`. If the app crashes or the network dies mid-flight (e.g. waiting for a lightning invoice to be paid), the transaction remains in the history.
- **Unified Recovery UI:** The frontend leverages a robust `check_transaction_status` backend command. Users can click "Check Status & Recover" on any Pending transaction in their UI history to safely resume the operation, fetch stranded tokens from the mint, or gracefully mark it as failed without losing funds.
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

## 6. Mobile Money (MoMo) & Fiat Bridges

The app provides seamless fiat integration by leveraging a Blink proxy wallet. This allows users to directly convert Mobile Money (e.g., Rwandan Francs - RWF) to eCash and vice versa, entirely bypassing the need for manual Lightning invoice management.
- **RWF to SATS:** The user initiates a MoMo deposit. The proxy generates a Lightning invoice, the app submits it to the Mint, and once the fiat clears, the proxy pays the Mint's invoice, issuing eCash to the wallet.
- **SATS to RWF:** The user requests a MoMo payout. The proxy generates a Lightning invoice, the app melts the user's eCash to pay the proxy, and the proxy triggers the fiat payout to the user's phone number.

## 7. On-Chain Bitcoin Swaps (Boltz)

To support native On-Chain Bitcoin without running a full node, the application integrates **Boltz Exchange** for non-custodial submarine swaps.

- **On-Chain Receive (Submarine Swaps):** The user is given an on-chain address generated by Boltz. When on-chain funds arrive, Boltz pays a Lightning invoice directly to the user's selected Mint, automatically converting the on-chain BTC to eCash.
- **On-Chain Send (Reverse Swaps):** The user melts eCash to pay a Boltz Lightning invoice. Boltz then forwards the equivalent on-chain Bitcoin to the destination address.
- **Refund Security:** If an on-chain send fails (e.g., Boltz fails to broadcast the on-chain transaction), the app automatically persists the cryptographic `refundPrivateKey`, `redeemScript`, and `timeoutBlockHeight`. The user can sweep their stuck funds back to their wallet via the History dashboard once the locktime expires.

## 8. Hybrid Transaction History Engine

Because the Rust backend natively tracks all fiat and on-chain swaps as generic Lightning `Mint` or `Melt` operations, the frontend utilizes a **Hybrid History Engine** to provide accurate user-facing labels.

1. **Local State (`momoHistory`):** Whenever an On-Chain or MoMo swap is initiated, the frontend stores the phase, direction, and metadata in `zustand` local storage.
2. **Strict Matching:** When rendering the history, the engine stitches the raw Rust transactions to the local `momoHistory`. 
3. **Heuristics:** It links them primarily using the Mint's `quote_id`. For Melt operations that lack a unified quote ID, it uses a strict temporal heuristic (matching exact amounts within a rigid 2-minute execution window) to securely identify the transaction without false positives.

## 9. Codebase Navigation

The project is structured as a modular Cargo workspace. If you are exploring the source code, here is where to look to understand the system:

### 1. `ecash-core` (The Primitives)
Contains the shared data types and cryptographic functions used by all other crates.
- **`src/dhke.rs`**: The heart of the cryptography. Contains the `hash_to_curve` logic and blind signature verification based on the Cashu NUT-00 spec.
- **`src/types.rs`**: Defines the standard `TokenV3`, `Proof`, and `BlindSignature` structs that mints and wallets pass around.
- **`src/compact.rs`**: Handles the binary encoding/decoding. This compresses a massive JSON token into a tiny binary payload that can fit inside a physical QR code.

### 2. `ecash-wallet` (The Routing Engine)
This crate contains the heavy lifting for the Hub-and-Spoke model.
- **`src/lib.rs`**: 
  - `WalletState`: The struct that holds local balances, seeds, and the transaction journal.
  - `issue_multimint_note()`: The function that implements the "Auto-Distribution" issuance flow.
  - `redeem_note()`: The function that implements the "Auto-Consolidation" sweep using `futures::future::join_all` for concurrent melting.
  - `resume_pending_transactions()`: The safety net that runs on startup to recover from failed atomic operations.

### 3. `ecash-encoder` (The Printer)
Generates the physical SVG artwork.
- **`src/lib.rs`**: Takes the public/private payload data, generates dual QR codes using the `qrcode` crate, and injects them into a beautiful, styled SVG canvas ready for printing. Handles the visual differentiation between strategies.

### 4. `ecash-verifier` (The Auditor)
Offline integrity checking.
- **`src/lib.rs`**: Contains `verify_offline_integrity()`. It mathematically ensures the proofs inside the QR code correctly map to the mint's public keys without making a single HTTP request.

### 5. `cashu-app` (The Frontend App)
A native cross-platform application built with Tauri and React.
- **`src-tauri/src/commands/`**: Rust backend bindings. For example, `redeem.rs` and `issue.rs` expose the `ecash-wallet` engine to the React frontend.
- **`src/hooks/`**: Clean UI architecture. All asynchronous state, Tauri backend invocations, transaction polling, and error handling are encapsulated in custom React hooks (e.g., `useHistory`, `useBitcoin`, `useEcash`, `useMints`).
- **`src/pages/`**: The React UI. Composed of pure UI components that consume the custom hooks. `Issue.tsx` provides the multi-mint selection menu, and `Scan.tsx` decodes physical notes.
- **`src/services/`**: Integration logic for external APIs. Contains `boltzService.ts` for On-Chain submarine swaps and refund construction, and `momoService.ts` for Blink fiat proxy interactions.
- **`src/constants.local.ts`**: Centralized configuration file holding all API endpoints (Mempool, Boltz, Blink Proxy) and environment variables.

### 6. `ecash-cli` (The Terminal interface)
The command-line wrapper.
- **`src/main.rs`**: Uses `clap` and `inquire` to build interactive terminal menus. It parses user input and calls the underlying `ecash-wallet` orchestrator.
