# Contributing to BitNotes

BitNotes combines a Rust Cashu wallet/CLI with a React + Tauri native app and a static download website. See the [README](README.md), [security policy](SECURITY.md), and [release guide](RELEASING.md).

## Setup

Install stable Rust and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/), then use Node.js 24:

```sh
nvm use
npm --prefix cashu-app ci
cp cashu-app/src/constants.example.ts cashu-app/src/constants.local.ts
cd cashu-app
npm run tauri dev
```

The app imports the ignored `src/constants.local.ts`. Copy the public template once during setup and configure optional integrations in your local file. Uncomment and fill its fields locally before building. `npm run dev` previews browser UI, but wallet/storage/payment commands require Tauri or mocks.

## Architecture map

Start with the route, then follow its component, hook/service, and native command where applicable. This map describes the current layout; update it when moving code.

| Concern | Where to look |
| --- | --- |
| Routes and page entry points | [App.tsx](cashu-app/src/App.tsx) registers routes; [pages/](cashu-app/src/pages) contains their entry components. |
| Feature UI and shared controls | [features/bitcoin/](cashu-app/src/features/bitcoin) exposes `BitcoinScreen` for routes and a compatibility `BitcoinModal` entry for the mint-list redirect, both using `BitcoinPaymentView`. [features/momo/](cashu-app/src/features/momo) exposes `MomoTransferScreen` for top-up/cash-out routes and `MomoTransferModal` for sheet mode, both using `MomoTransferView` and its feature-local form/styles. Other feature views remain in [components/](cashu-app/src/components). [components/shared/](cashu-app/src/components/shared) contains reusable controls. |
| React state and background work | [hooks/](cashu-app/src/hooks) owns UI lifecycle bindings. [useTransactionProcessor.ts](cashu-app/src/hooks/useTransactionProcessor.ts) coordinates background transaction checks and recovery. |
| Payment workflows and external integrations | [services/](cashu-app/src/services) includes Mobile Money orchestration in `flowServices.ts`, conversion workflows in `stableBalanceService.ts`, and provider/SDK access such as `sparkService.ts`. Some services access providers directly; not every payment goes entirely through Rust. |
| Frontend application state | [store/](cashu-app/src/store) contains Zustand stores. `wallet.ts` refreshes native balances/history; `transactionStore.ts` persists Mobile Money transaction state in webview `localStorage`. |
| Native command boundary | [src-tauri/src/lib.rs](cashu-app/src-tauri/src/lib.rs) registers invokable commands. [commands/](cashu-app/src-tauri/src/commands) implements them; `auth.rs` owns the authenticated in-memory wallet and its lock. eCash send and receive commands hold the authenticated wallet guard and delegate to `ecash-wallet::send` and `ecash-wallet::receive` (with pre-wallet receive constraint validation before locking); `save_ecash_for_later` and some other commands still contain native orchestration. |
| Rust wallet operations and storage | [ecash-wallet/src/](crates/ecash-wallet/src) contains mint, swap, melt, restore, token, and history operations. `send.rs` owns eCash send orchestration (with `send_ecash_with_storage` accepting an injected `WalletStorage`), `payment_quote.rs` shares fee quoting between review and execution, `send_error.rs` defines shared send failures, and `outgoing.rs` constructs pending records/payloads/results. `receive.rs` owns eCash receive orchestration and `receive_input.rs` owns staged token/invoice checks and keyset/fee preparation. `storage.rs` implements encrypted wallet file read/write, atomic replacement, paths, and the `WalletStorage`/`EncryptedFileStorage` boundary (delegated from `state.rs`); `stable.rs` models the saved conversion journal. The GUI wallet file is `gui-wallet.json` under Tauri's app-data directory, configured in native `lib.rs`. |
| Other Rust capabilities and CLI | [crates/](crates) separates `ecash-core` (cryptography/shared types), `ecash-encoder` (printable notes), `ecash-verifier` (verification), and `ecash-cli` (command-line entry). |
| Tests and public website | [cashu-app/tests/](cashu-app/tests) contains payment tests and browser fixtures; [ecash-tests/tests/](crates/ecash-tests/tests) contains Rust integration tests. Rust modules also contain unit tests. [website/](website) is the static download site. |

For a concrete Lightning invoice payment, follow `pages/Bitcoin.tsx` → `features/bitcoin/BitcoinScreen.tsx` → `features/bitcoin/BitcoinPaymentView.tsx` → `hooks/useBitcoin.ts` (`payInvoice`) → native `commands/pay.rs` (`pay_invoice`) → `ecash-wallet/src/melt.rs`. Wallet file persistence is implemented in `ecash-wallet/src/storage.rs` (delegated from `ecash-wallet/src/state.rs`); frontend persisted state is a separate store concern.

## Checks

From the repository root:

```sh
sh scripts/check-migrated-rust-format.sh
npm --prefix cashu-app run check:format
npm --prefix cashu-app run check:boundaries
npm --prefix cashu-app run check:no-any
npm --prefix cashu-app run test:payments
npm --prefix cashu-app run check:release
npm --prefix cashu-app run build
cargo test --workspace --locked
```

Use the committed npm and Cargo lockfiles. Add regression coverage for payment, proof, request validation and recovery changes. Do not skip tests, remove assertions or ignore advisories to get a green release. New tests should use generated or explicitly documented public fixtures, never funded tokens or real wallet exports.

Keep changes focused and preserve existing wallet schemas and journals. Describe what changed, how it was verified, and any platform limitations in pull requests. Cryptographic or money-movement changes require particular care and interoperability tests.

## Public repository hygiene

Do not commit `.env`, keystores, credentials, private keys, wallet files, physical-note output, release binaries or logs. Do not paste these into issues either. The release check validates both tracked and new publishable files, including private paths forced past `.gitignore`. Review the staged diff yourself before pushing.

Versions must agree across npm, Tauri, Rust crates and website links; follow [RELEASING.md](RELEASING.md). Website changes are plain HTML/CSS/JS under `website/`, with download URLs in `website/config.js`.

## After a configuration history cleanup

Use a fresh clone after maintainers publish rewritten history. Preserve your ignored `cashu-app/src/constants.local.ts` and other local work privately before moving to the new clone. Reapply only reviewed source changes; never copy private configuration into a commit. Do not merge or push branches or tags from the old clone, because they can restore the removed history. Fork owners must clean up their own copies too.
