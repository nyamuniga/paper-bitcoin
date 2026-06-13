# Physical eCash: Technical Documentation

This document outlines the architecture and mechanics of the Physical eCash CLI, specifically focusing on the complex Lightning Network routing and state management required to provide a frictionless "1-Invoice" user experience while handling multi-mint tokens under the hood.

## 1. Core Concept

The system allows users to issue physical bearer instruments (paper notes with QR codes) backed by Bitcoin via the Cashu protocol. To prevent a single point of failure, notes can be backed by funds split across multiple independent Mints.

Because Cashu proofs are locked to specific Mints, aggregating funds from multiple Mints requires routing Lightning Network payments between them. This is completely abstracted from the user through the **Hub-and-Spoke Routing Engine**.

## 2. Note Issuance (Auto-Distribution)

When a user issues a multi-mint note, they only interact with a single Lightning invoice.

### The Over-Funding Strategy
Sweeping funds between mints incurs Lightning Network routing fees. To ensure the final recipient can redeem the physical note for its exact Face Value without paying these fees out-of-pocket, the note is **over-funded** at issuance.

1. **Allocation & Buffer:** The CLI divides the desired Face Value across the requested mints. It then calculates a hidden fee reserve for each mint (`max(10 sats, 3% of allocation)`).
2. **Hub Selection:** The CLI selects the first mint as the "Hub Mint" and requests a single master Lightning invoice covering the total Face Value + all fee reserves.
3. **The Mint Swap:** The user pays this massive invoice from their phone. The CLI then sequentially generates quotes at the child mints and pays them using the funds sitting at the Hub Mint.
4. **Result:** The physical note is printed with valid, over-funded Cashu proofs distributed securely across all the mints.

## 3. Note Redemption (Auto-Consolidation)

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

## 4. Failure State Management

Multi-stage Lightning swaps are inherently fragile. A routing node might go offline, or the user might provide an expired/invalid invoice. 

If the final Lightning payout fails after the funds have already been consolidated at the Hub Mint, the original physical note proofs are now technically *spent*. If the CLI simply exited, the user's funds would be permanently lost.

### Safefall Protocol
To prevent data loss, the CLI wraps the final payout in a transactional block. 
- If the payout fails, the CLI intercepts the error.
- It injects the newly generated, valid Hub proofs directly into the local `WalletState`.
- It saves the wallet to disk *before* propagating the error to the user.

The funds are caught in the user's local dashboard, where they can be manually withdrawn later using the `Pay Lightning Invoice` CLI feature.

## 5. Wallet Architecture

The `WalletState` (saved in `~/.ecash/wallet.json`) acts as both the fallback safety net and a standard Cashu wallet.

- **Offline Ignorance:** When paying an invoice directly from the dashboard, the wallet iterates through the known mints. If a mint is offline (e.g., local mock mints), the CLI gracefully catches the network timeout and skips to the next mint, ensuring offline infrastructure doesn't block access to healthy funds.
- **Change Collection:** Any Lightning invoice payment made from the wallet automatically calculates maximum possible change, generates blind signatures, and sweeps the change back into the local state.
