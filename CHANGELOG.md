# Changelog

All notable changes to the Bitnotes / Physical Ecash project will be documented in this file.

## Unreleased

## [0.1.18] - 2026-11-10

### Added
- Dedicated ecash, Bitcoin, top-up, and cashout pages with fixed headers and responsive amount entry, number pads, and actions.
- Scanned ecash token previews with QR codes, mint/value details, and a claim-later option available from recent activity and history.
- Top-up and cashout review screens showing the phone number, amount, and fees before confirmation.

### Changed
- Updated the Scan page to match the square QR scanner, paste field, and orange action-button style used for Bitcoin sends.
- Simplified Bitcoin deposit and send reviews, compacted navigation, and improved issue-note and conversion layouts on short screens.
- Synchronized app, workspace, and website versions and download URLs for 0.1.18.

### Fixed
- The first tap after swiping a bottom sheet closed is recognized immediately.
- The wallet mint selector applies a subtle page-wide blur while keeping its button and menu visible.
- Unavailable Dollar balances show a loading shimmer, and Mobile Money confirmation rejects worse terms than those reviewed.

### Conversion protection

- Conversion estimates refresh from a shared ticker while entering an amount. New reviews fix a minimum received and maximum spent for 60 seconds, with an explicit 3% movement allowance.
- Fund Bitcoin conversion headroom within the approved budget and enforce the source ceiling at the SDK pre-send boundary. Return unused Bitcoin automatically when the return threshold is met; preserve existing journals and never retry ambiguous sends.


---

## [0.1.17] - 2026-11-09

### Added
- Voluntary Bitcoin/Dollar conversions from existing ecash, with explicit review, durable recovery journals and the shared animated success overlay.
- Live review quotes refreshed every 20 seconds while visible, preserving the original spending ceiling and reusing payment invoices when possible.
- Persistent QR ecash payment requests, interoperable Cashu request encoding and authenticated NIP-17 delivery, resumable from History and Recent activity.
- Compact BTC/USD wallet tabs with swipe transitions, shared balance visibility, consistent Dollar formatting, and BTC as a selectable display currency.

### Fixed
- Both conversion directions use a five-attempt fee-fitting cap and short-lived observed fee hints. Receive invoices stay temporary through Review/rate refresh; only confirmation prepares the selected quote's recoverable receive transaction, without generating a replacement invoice.
- Mobile Money requests have bounded network waits, explicit update-required rejection handling, and restart recovery for saved initiation steps. Closing a transfer preserves uncertain/funded records; status recovery does not re-fund or re-submit cashouts.
- Pending Mobile Money transfers no longer take over new top-up/cashout forms. Saved transfers reconcile independently by ID, remain available for status checks, and cannot overwrite a new transfer when they finish.
- Completed Cashu receipts no longer report Pending during later checks; late network results cannot regress settled receipts.
- Typing conversion amounts no longer creates mint quotes. Review stops at the first valid fee-inclusive quote and respects mint retry delays.
- Conversion status reconciliation no longer waits for unrelated Spark sync/balance work when a Cashu receipt is authoritative.
- Simplified invoice payment review, fee totals, saved-token delivery retries, receive/request keypad and transaction actions.

### Release and security
- Removed NFC support and its platform permissions; QR/token payments remain supported.
- Replaced the private constants-file dependency with tracked, credential-free environment configuration and a public setup template.
- Removed authentication/payment-response, phone-number and proof-secret debug output.
- Corrected proxy encryption byte packing so generated AES keys are 32 bytes and IVs are 16 bytes, verified against independent AES-256-CBC/HMAC implementations.
- Updated npm/Rust dependencies, including k256 0.14 and patched cryptographic arithmetic, synchronized release versions and website downloads, and added release/file-hygiene checks and reproducible lockfiles.
- Updated contributor, configuration, security and release documentation. See the release guide for native device validation and advisory review requirements.

## [0.1.16] - 2026-11-06

### ⚡ Self-Custodial On-Chain Bitcoin via Breez SDK – Spark
- **Replaced FixedFloat with Breez SDK – Spark (`@breeztech/breez-sdk-spark`)**: Transitioned on-chain Bitcoin sends and deposits from custodial exchange swaps to a fully self-custodial Spark L2 bridge derived deterministically from the user's BIP39 wallet seed.
- **Exact Receiver Amount Guarantee (`feesExcluded` + Auto Deficit Top-Up)**: Calibrated pre-bridge cooperative exit fee estimation to match Spark SSP parameters (`750 sats` base service fee + `250 vB` L1 broadcast fee + Lightning bridge buffer) and added automatic deficit top-up (`spark_topup_for_send`) so recipients always receive the exact inputted satoshi amount on-chain.
- **Fee-Inclusive On-Chain Deposits & Mint Binding**: Added Spark L1 deposit claim + Lightning sweep fee estimation into BIP-21 deposit URIs/QR codes so users receive their full requested amount in Cashu, while strictly preserving the user-selected mint and deduplicating pending receive entries across app restarts.
- **Universal Bitcoin Address & BIP-21 Scanning**: Upgraded the Scan page (`Scan.tsx` & `bitcoinValidation.ts`) to detect on-chain Bitcoin addresses and BIP-21 URIs (`bitcoin:bc1q...?amount=...`) with instant pre-filled handoff to the Bitcoin send flow.
- **Security Hardening & Android Build Support**: Added AES-256-GCM encryption for stored credentials in `settings.bin`, memory zeroization for temporary seed buffers, automatic SDK disconnect on wallet lock/reset, and compile-time `.env` key injection via `build.rs` and Vite `envPrefix` for Android APK builds with zero hardcoded keys in source code.

## [0.1.15] - 2026-10-30

### 🔒 FixedFloat Security & In-Transit Encrypted Backend Proxy
- **Zero-Secret Client Architecture**: Removed direct client-side FixedFloat API credential requirements, protecting open-source binaries and mobile builds from API key exposure.
- **Secure Server Proxy Dispatch**: Routed swap limits, price quotes, order creations, and status checks through the payment backend proxy (`/api/fixedfloat`).
- **End-to-End In-Transit Encryption**: Secured client-proxy communication using AES-256-CBC with PKCS7 padding, HMAC-SHA256 integrity verification, and dynamic 15-minute replay-prevention timestamps matching the MoMo processor security model.
- **Dynamic Credential & Key Discovery**: Automatically detects transit encryption keys and proxy base URLs from runtime environments, compile-time flags, or local `.env` files without hardcoding any secrets into source code.

## [0.1.14] - 2026-10-29

### 🎨 UI Unification & Component Polish
- **Android Native Clipboard Integration**: Resolved paste and copy button failures on Android WebViews by integrating Tauri v2's native clipboard plugin (`@tauri-apps/plugin-clipboard-manager` and `tauri-plugin-clipboard-manager`) with universal fallback across all forms, dialogs, and screens.
- **Harmonized Field Palette**: Standardized all input fields, textareas, and credential containers across Modals, Scan, Issue, Settings, and Auth flows with the dark obsidian green surface (`bg-[#0c1b14]`, `border border-[#142d20]`, `focus:ring-1 focus:ring-primary`).
- **Consistent Action Toolbars**: Relocated action and QR scanning buttons to the bottom-right action bar across Receive Ecash, Send Bitcoin, Scan, Pay, and Redeem Note flows for uniform ergonomics.
- **Dynamic Ecash Token Generation**: Automatically hides the "Create Token" button once tokens are generated to streamline the workflow and prevent duplicate submissions.
- **Clean Ecash Format Tabs**: Replaced verbose format labels with minimal `cashuA` and `cashuB` segmented selectors powered by the smooth animated `SlidingSegmentedControl`.
- **Address Book Modal & Form Polish**: Pinned the search bar and "+ Add New Contact" button above the contacts list with independent scrollability; prevented parent sheet dismissals on contact selection; styled new contact modal action button with primary orange ochre.
- **Button Radius Normalization**: Standardized modal action buttons and "Add New Mint" controls to `rounded-xl` / square geometry for visual consistency across cards and dialogs.
- **Interactive Quick-Pick Chips**: Currency quick-pick chips now use an orange outline border (`border-primary`) when active instead of solid fill, matching the design system.

## [0.1.13] - 2026-10-29

### 📇 Integrated Address Book & Contact Management
- **Full Contact Management**: Dedicated Address Book route (`/address-book`) supporting full CRUD operations for frequent Mobile Money phone numbers and Lightning addresses (LNURL / Lightning addresses).
- **Automated Contact Capture**: Successfully completing a MoMo Cash Out, MoMo Top-Up, or Lightning payment prompts an automatic contact-saving workflow or auto-updates last-used timestamps.
- **Smart Auto-Complete & Inline Picker**: Instant contact suggestion overlay in Bitcoin Send and MoMo modals with one-tap destination autofill.
- **Unified Settings Card**: Added an Address Book accordion in Settings featuring quick-action buttons, recently used contacts, and instant management navigation.

### 🎛️ Unified Sliding Segmented Controls
- **Smooth Animated Pill Tabs**: Reusable `SlidingSegmentedControl` component featuring cubic-bezier spring easing, amber active highlights, and tactile interaction.
- **Multi-Step Adoption**:
  - **Top Navigation**: Replaced static buttons with the smooth sliding pill indicator.
  - **Address Book**: Seamless toggle between All, MoMo, and Lightning contacts.
  - **Note Issuance (`IssueSummaryStep`)**: Unified sliding selectors for Funding Method (Wallet Balance vs. Direct Lightning) and Denomination Strategy (Optimal Denominations vs. Uniform Notes).
  - **Bitcoin Receive Modal**: Unified sliding toggle between Lightning and On-Chain deposit modes.

### ⚡ Bitcoin Modal & Destination Input Refinements
- **Redesigned Destination Card**: Redesigned the Bitcoin send destination textarea into a structured card with an unbroken placeholder and a dedicated bottom action bar.
- **Quick Action Bar**: One-tap `Paste`/`Clear` on the left and dedicated `[ 📖 Contacts ]` and `[ 📷 Scan ]` pill buttons on the right.
- **Balanced Spacing & Validations**: Equalized vertical rhythm between amount display and number pad in the Bitcoin Receive modal; added disabled state guards to prevent requesting on-chain addresses when deposit bounds are not satisfied (`12,500` to `18,000,000` sats).

### ⚙️ UI Polish & Cleanups
- **Settings Card Alignment**: Standardized Address Book card styling to match all other settings cards with obsidian glass containers, ambient glow, and circular badge icons.
- **Clean Badges & Labels**: Removed redundant network badges ("MTN") and eliminated duplicate label text when contact names match their destination address.

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
  - `RWF`: Retains the configured spread (`SPREAD = 0.021`) to reflect actual mobile money cash-out settlement value.
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
