# Changelog

All notable changes to the Bitnotes / Physical Ecash project will be documented in this file.

---

## [0.1.12] - 2026-10-27

### 🛡️ Automatic Proof Self-Healing & Keyset Resolution
- **Unverified Proof Isolation & Purge**: Implemented automated isolation and purging of corrupted or unverified ecash tokens when mints return `Token not verified` (NUT-00/NUT-03).
- **Auto-Retrying Coin Selection**: Pre-melt swaps and Lightning payments automatically isolate faulty tokens, purge them from storage, and retry coin selection with remaining healthy proofs without interrupting the user.
- **Accurate Keyset Public Key Lookups**: Restoring ecash tokens from inactive or historical keysets now fetches and matches public keys directly by Keyset ID (`sig_id`), preventing signature corruption from rotated keysets.
- **Active Clean Wallet Proof Consolidation**: Clean Wallet now actively tests and consolidates proofs with mints, purging unknown keysets and broken tokens while optimizing denominations.

## [0.1.11] - 2026-10-27

### ⚡ Direct On-Chain Bitcoin Swaps
- **Seamless L1 Onboarding & Withdrawals**: Replaced legacy protocol layer with a direct on-chain swap engine supporting Bitcoin L1 send and receive.
- **Real-Time Limit Feedback**: Added live on-chain send and receive limit indicators that dynamically validate satoshi amounts against routing capacity as the user types.
- **BIP-21 Amount Encoding**: QR codes and payment URIs now include `?amount=` parameter so desktop wallets (Sparrow, Electrum) and mobile scanner apps automatically pre-fill the exact satoshi amount.
- **Automatic Background Claiming**: On-chain deposit addresses automatically persist pending transactions in the wallet database, allowing background services to unblind and claim ecash tokens even if the app or modal was closed.
- **Safe Proof Rollback**: Complete atomic rollback protection safely restores all spendable proofs back to the wallet if an outgoing payment cannot find a route.

## [0.1.10] - 2026-10-25

### 🌐 Multi-Currency Portfolio Valuation
- **Live Currency Support**: Integrated live exchange rates for all 34 global fiat currencies from `https://blockchain.info/ticker` (USD, EUR, GBP, NGN, GHS, CAD, AUD, JPY, CHF, CNY, INR, BRL, and more) alongside Rwandan Franc (RWF).
- **Settings Currency Selector**: Added a new **Currency** settings accordion card with quick-pick chips for popular currencies and a searchable list of all 35 currencies displaying live 1 BTC exchange rates.
- **Intelligent Spread Handling**:
  - `RWF`: Retains the configured spread (`SPREAD = 0.021`) to reflect actual mobile money (MoMo) cash-out settlement value.
  - All other global currencies: Rendered at **pure spot market rates** without spread, matching standard Bitcoin wallet valuations.
- **Auto-Closing Accordion**: Selecting any currency instantly saves preferences and closes the selector card.
- **Persistent & Fast**: Cached rates in `localStorage` ensure zero-delay startup with smooth animated rolling counters during balance or rate fluctuations.

### 🧹 Minimalist Transaction History & Enhanced Details Modal
- **Clean Card Faces**: Removed all cluttered action buttons and inline error banners from transaction cards on both the History page and Recent Activity.
- **Obsidian Dark Aesthetic**: Transaction cards now feature a minimalist layout with an asset/direction badge, status indicator (`Pending ·`, `Failed ·`, `Mint Error ·`, or relative time), and formatted sat amounts.
- **Full Action Suite in Details Modal**: Clicking anywhere on any transaction card opens the detailed modal, centralizing all contextual actions:
  - `Download SVG / PDF` for exported notes.
  - `Retry Mint` for pending Lightning deposits.
  - `Check Status & Resume` for pending note issuances.
  - `Check Status & Claim / Recover / Refund` for eCash claims, note redemptions, and Lightning payments.
  - `Check Note Spend Status / Check if Claimed` for tracking offline and online proof states.
  - `Retry Claim` for failed eCash claims.
- **Mint Settlement Error Guidance**: For transactions flagged with `FailedMintError` (where proofs were spent by the mint but Lightning invoice routing failed), an explanation alert is rendered in the modal alongside copyable Quote IDs and invoices for mint operator support.

### 🎨 Unified Icon Alignment
- **Banknote (`<Banknote />`)**: Replaced generic document icons (`FileText`) and paper plane icons (`Send`) with the official banknote icon across:
  - Bottom Navigation "Issue" tab.
  - Send Action Sheet ("Printable Note").
  - Transaction History Cards & Recent Activity ("Exported Note").
  - Transaction Details Modal hero badge.
- **Bitcoin (`<Bitcoin />`)**: Replaced lightning bolts (`Zap`) in action menus and the Bitcoin Modal header with the official **₿** symbol, establishing a unified financial triad (`Banknote` for physical cash, `Coins` for eCash tokens, and `Bitcoin` for the base network).
- **Consistent Sizing**: Standardized icon sizes across all bottom action sheets (`size={20}`).

### ⚡ Note Redemption & Settlement Fixes
- **Redeemed Note Status Checks**: Added native transaction status inspection for `TransactionType::Redeem` via `OfflineVerifier::check_spend_state`, resolving the *"cannot check status of this type of transaction"* error.
- **Stale Quote Expiration**: Unpaid `ReceiveLightning` and `Mint` quotes past their expiration timestamp or older than 24 hours now safely transition from `Pending` to `Failed`, preventing permanently stuck pending transactions.
- **NUT-15 MPP Compliance**: Standardized melt quote requests to use sat amounts per NUT-15 specifications.
- **Derivation Synchronization**: Preserved correct derivation indices across external invoice redemptions and cross-mint hops.

### 🔍 Universal Scanner & Vocabulary Standardization
- **Scan Subtitle**: Updated Scan page header from `"Redeem ecash voucher"` to **`"Scan notes, eCash tokens, or Lightning invoices"`**, clarifying that the scanner universally handles physical notes, Cashu eCash tokens, and Lightning / LNURL invoices.
- **Vocabulary Consistency**: Completely eradicated the inconsistent term `"voucher"` across all UI strings, loaders, and alerts in favor of `"note"` (for physical ecash) and `"token"` (for digital Cashu tokens).
- **Issuance Wizard Title**: Renamed Step 1 of the note issuance flow from `"Issue Note"` to **`"Enter Amount"`**, creating a consistent 3-step hierarchy (*Step 1: Enter Amount*, *Step 2: Select Mints*, *Step 3: Confirm & Create*).
- **Activity Label Clarity**: Standardized activity naming to `"Exported Note"` for physical notes generated, and `"Printable Note"` in the Send menu.
