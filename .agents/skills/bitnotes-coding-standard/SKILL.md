---
name: bitnotes-coding-standard
description: >-
  Enforces the BitNotes 9/10 architecture, type safety, UI reuse, bundle-size,
  Rust durability, and verification standards. Activate this skill before
  designing, implementing, reviewing, or modifying any feature, addition, bug
  fix, or refactor in the BitNotes workspace (`cashu-app/` or `crates/`).
---

# BitNotes Coding Standard

Follow these rules on every new feature, addition, bug fix, or refactor in this repository. Never suppress checks, skip tests, or raise warning thresholds to reach green.

## 1. Feature Organization & Dependency Direction

- **Routes (`cashu-app/src/pages/`):** Keep route files thin (route params, navigation callbacks, store wiring). Lazy-load every secondary route in [App.tsx](../../../cashu-app/src/App.tsx) with `React.lazy`.
- **Feature modules (`cashu-app/src/features/<domain>/`):** Co-locate feature screens, pure presentational sub-views, feature-local hooks, and feature CSS under `features/bitcoin/`, `features/momo/`, `features/ecash/`, `features/conversion/`, or a new domain folder. Do not add new routed features under `components/home/`.
- **Workflow separation:** Keep payment calculations, polling, recovery, and state transitions in pure or dependency-injected services under `cashu-app/src/services/` — never import React, Zustand, stores, or `@tauri-apps/*` inside workflow services.
- **Register new modules in CI guardrails:**
  - Add new pure workflow services and lifecycle hooks to [check-import-boundaries.mjs](../../../cashu-app/scripts/check-import-boundaries.mjs).
  - Add new native IPC adapters, services, and hooks to `MIGRATED_NATIVE_ADAPTERS` in [check-no-explicit-any.mjs](../../../cashu-app/scripts/check-no-explicit-any.mjs) (this automatically adds them to `check:format` as well).
  - Add new Rust domain modules in `crates/ecash-wallet/` to [check-migrated-rust-format.sh](../../../scripts/check-migrated-rust-format.sh).

## 2. Frontend Type Safety & Native IPC Contracts

- **Zero untyped `invoke(` calls:** Always supply an explicit return type (`invoke<T>('command', args)`), and group related commands behind a typed adapter in `cashu-app/src/services/` (e.g., `ecashNativeAdapter.ts`).
- **Zero explicit `any`:** Do not introduce explicit `any` in adapters, services, hooks, or new components. Use `unknown` in `catch (err: unknown)` blocks and narrow with `instanceof Error` or [getErrorMessage](../../../cashu-app/src/utils/error.ts).
- **Contract tests:** When adding or changing a Rust/TypeScript wire payload or enum, add or update fixture contract tests verifying both sides agree.

## 3. UI Reuse, Semantic Tokens, & UX Preservation

Always reuse existing shared primitives in `cashu-app/src/components/shared/` instead of duplicating UI:

| Need | Required primitive | Forbidden pattern |
| --- | --- | --- |
| Static QR code | `SafeQRCode` | Direct `import QRCode from 'react-qr-code'` |
| Camera QR scanner | `LazyQrScanner` | Static `import { Scanner } from '@yudiel/react-qr-scanner'` |
| Modal / bottom sheet | `BottomSheet` | Hand-rolled `createPortal` + `useBottomSheet` (except legacy body-portal compatibility shells) |
| Payment page shell | `PaymentPageLayout` + `PageHeader` | Ad-hoc viewport wrappers without safe-area handling |
| Mint selector | `MintBalancePicker` | Custom dropdown menus on payment pages |
| Primary CTA | `PrimaryActionButton` | Unstyled/duplicated primary CTA buttons |
| Icon-only control | `IconButton` | Unlabeled icon buttons |
| Labeled input | `FormField` | Unassociated labels / error hints |
| Segmented tabs | `SlidingSegmentedControl` | Custom tab bars lacking roving keyboard focus |

- **Semantic theme tokens:** Use CSS custom properties from [App.css](../../../cashu-app/src/App.css) (`--color-surface-*`, `--color-on-surface*`, `--color-primary`, `--color-outline*`, `--color-error*`) rather than hardcoded hex colors. Verify both dark and light themes.
- **Responsive & keyboard rules:** Preserve phone (`320×568`, `390×480`, `390×844`) and desktop (`1024×844`) layouts, visible keyboard focus (`:focus-visible`), safe-area insets, and reduced-motion behavior. Keep existing UI/UX intact unless the user explicitly authorizes a visual change.

## 4. Bundle Size & Startup Hygiene

- Keep Vite's default `500 kB` `chunkSizeWarningLimit` untouched and ensure `npm --prefix cashu-app run build` emits **zero warnings** (zero mixed static/dynamic import warnings, zero chunk-size warnings).
- Never statically import heavy optional SDKs (`@breeztech/breez-sdk-spark/web`, `@yudiel/react-qr-scanner`) on the initial entry path.
- Avoid mixed static and dynamic imports of the same module across the codebase.

## 5. Rust Domain Operations & Persistence Invariants

- **Thin Tauri commands:** Keep `cashu-app/src-tauri/src/commands/` as thin adapters that acquire wallet locks and delegate domain orchestration to `crates/ecash-wallet/`.
- **Explicit persistence & durability:**
  - Always call `w_state.normalize_proofs_for_persistence()` explicitly before `save_encrypted` — raw persistence must never mutate domain state.
  - Prefer narrow `WalletState` mutators (`ensure_mint`, `credit_proofs`, `record_transaction`, `find_transaction_mut`, `set_default_nostr_key`, `advance_derivation_index_past_proofs`) over ad-hoc direct field mutation.
  - **Never** discard persistence or recovery save failures with `.ok()`. Surface both the original failure and the save failure so ambiguous outcomes remain diagnosable without automatic resubmission.
- **Payment safety:** Preserve spend ceilings, duplicate-submission protection, pending transaction identities, encrypted wallet format compatibility, and restart recovery. Use synthetic unfunded fixtures and localhost mock servers in tests.
- **No unrequested APK builds:** Do not run Android APK builds unless the user explicitly asks.

## 6. Mandatory Verification Gate

Before finishing any change, run the relevant checks for your scope (and the full set for cross-cutting changes):

```sh
# 1. Guardrails & hygiene
sh scripts/check-migrated-rust-format.sh
npm --prefix cashu-app run check:format
npm --prefix cashu-app run check:boundaries
npm --prefix cashu-app run check:no-any
git diff --check
npm --prefix cashu-app run check:release

# 2. Build & unit/payment tests
npm --prefix cashu-app run build
npm --prefix cashu-app run test:payments

# 3. Rust workspace tests (when Rust or wire contracts changed)
CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline
```

For UI, layout, or CSS changes, also run the affected real-Chrome browser fixtures serially after rebuilding:

```sh
node --test --test-concurrency=1 cashu-app/tests/browser/<affected>.test.mjs
```

A task is not done until every applicable check passes with zero failures, zero skipped/ignored tests, and zero suppressed warnings.
