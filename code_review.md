# BitNotes: Code Quality, Architecture, and UI Component Review

Date: 2026-11-18\
Reviewed revision: `65ce5ea`\
**Overall rating: 6/10**\
Status: assessment and proposed tasks; implementation is not included.

## 1. Verdict and scope

BitNotes has a capable foundation: meaningful Rust crates, explicit recovery concepts, useful payment tests, and several good shared UI controls. Its main weakness is the amount of context a reader must hold to understand a payment. Business rules, persistence, framework state, timers, and presentation are interleaved, and feature ownership is not always evident from names and folders.

The previous assessment was 6.5/10. This reassessment gives explicit weight to code navigation, component APIs, readability of JSX, and consistency of UI reuse. The revised 6/10 reflects the broader rubric, not a new regression: the reviewed application revision is unchanged.

“Beautiful code” here means clear names, predictable placement, readable formatting, cohesive functions, explicit state, and abstractions that reduce the reader's workload. Compact code is not necessarily simple code. A short component with dense markup and many unrelated props can still be difficult to maintain.

This review is based on source inspection and the test results recorded earlier in this session. Additional inspection covered page wrappers, shared components, feature modals, styles, and design documentation. Rendered visual quality, accessibility conformance, live payment behavior, and cryptographic security are not certified by this source review.

## 2. Scorecard

The overall score is the equal-weight average of these seven categories. Scores remain engineering judgments rather than objective measurements.

| Dimension | Score | Assessment |
| --- | --- | --- |
| Readability and naming | 6/10 | Helpful domain names coexist with dense declarations, nested render conditions, and misleading page/modal names. |
| Cohesion and single responsibility | 5/10 | Large components and native commands combine independent responsibilities. |
| Architecture and dependency direction | 6/10 | Good crate separation; application workflows remain tied to framework stores, native calls, and disk persistence. |
| Types, invariants, and errors | 6/10 | Strict TypeScript and useful domain types coexist with `any`, string errors, and unrestricted mutable wallet state. |
| Navigation and feature organization | 5/10 | Related payment code is scattered across horizontal folders; `components/home` contains entire routed features. |
| UI reuse and component design | 7/10 | Existing primitives are valuable, but duplicated picker implementations, mixed style sources, and broad component APIs limit consistency. |
| Tests and verification | 7/10 | Meaningful recovery tests and CI exist; broken fixtures and elaborate mocking reduce confidence and ease of change. |

A 9/10 reassessment should average at least 9 with no category below 8, backed by the acceptance evidence below. Finishing a checklist alone does not guarantee that rating.

## 3. What should be preserved

- **Rust capability boundaries:** core cryptography, wallet operations, note encoding, offline verification, and CLI already have separate crates. Keep domain code independent of Tauri.
- **Pure calculations:** [momoReview.ts](cashu-app/src/services/momoReview.ts) and [transferAmount.ts](cashu-app/src/services/transferAmount.ts) show how calculations can be understandable and independently tested.
- **Payment recovery concepts:** saved operations, spend ceilings, checks before resubmission, and ambiguous-outcome handling deserve preservation during every extraction.
- **Useful shared controls:** `NumberPad`, `PageHeader`, `MintBalancePicker`, `SlidingSegmentedControl`, `AmountDisplay`, and `SafeQRCode` provide a foundation worth improving.
- **Existing interaction care:** the segmented control implements keyboard navigation for tabs; the mint picker handles Escape and restores focus; bottom-sheet behavior and success overlays have browser test fixtures. These details should survive consolidation.
- **Automated checks:** [CI](.github/workflows/ci.yml) includes Rust tests, frontend tests/build, release checks, and dependency audits.

## 4. Findings with evidence

### High priority: application operations are mixed with adapters

[send.rs](cashu-app/src-tauri/src/commands/send.rs) selects proofs, checks fees, updates transaction records, performs swaps, encodes tokens, and saves wallet state. A native command is consequently both an adapter and a business operation. Some recovery branches discard persistence failures with `.ok()`.

[flowServices.ts](cashu-app/src/services/flowServices.ts) directly imports Zustand stores, native invocation, and HTTP transport, and accepts React timer refs. This makes the payment workflow depend on its presentation and infrastructure choices. Tests need module-loader hooks and global stubs to substitute dependencies.

**Consequence:** changing one boundary requires understanding several others, and failures are difficult to isolate. Extract one reusable operation at a time, retaining existing locks and recovery guarantees. Introduce explicit dependencies only where they remove demonstrated coupling.

### High priority: wallet invariants and persistence share an oversized boundary

[WalletState](crates/ecash-wallet/src/state.rs) combines public mutable wallet data, balance calculations, proof repair, migration, encryption, and filesystem I/O. `save_encrypted` also deduplicates proofs, so saving changes domain state.

**Consequence:** callers can bypass intended mutation rules, and storage has implicit side effects. Isolate storage mechanics first, characterize normalization, then expose narrow operations for important proof and journal transitions. Do not replace all public fields at once.

### High priority: contracts are weaker than compiler settings suggest

[wallet.ts](cashu-app/src/store/wallet.ts) originally received wallet and transaction data as `any`. C1/C2 now type the wallet-info response and the transaction fields consumed by refresh through [shared wallet contracts](cashu-app/src/types/wallet.ts). Other transaction consumers still contain weak types, including `tx_type: any` in the history UI. [CommandError](cashu-app/src-tauri/src/error.rs) still serializes a string for legacy commands; C4/C5 added a structured `send_ecash_v2` boundary, and C6 migrated the shared `useEcash` send caller to codes. [transferError.ts](cashu-app/src/services/transferError.ts) still interprets conversion errors through regular expressions. TypeScript conversion stages are a union, while [Rust conversion stages](crates/ecash-wallet/src/stable.rs) are stored as strings.

**Consequence:** changes can drift across boundaries without compile-time feedback. Use typed responses, explicit application error codes, and tested state transitions. A TypeScript assertion or `invoke<T>` does not validate runtime data. Keep unavoidable provider-message parsing inside the provider adapter.

### Medium priority: names and folders obscure feature ownership

[Bitcoin.tsx](cashu-app/src/pages/Bitcoin.tsx) and [MobileMoney.tsx](cashu-app/src/pages/MobileMoney.tsx) originally rendered modal-named components in page mode. At the initial review, both full payment features lived under `components/home`, although they serve dedicated routes. B5/B7 moved them into their feature folders. B6 introduced `BitcoinScreen` and a compatibility `BitcoinModal` entry around `BitcoinPaymentView`; B8 similarly separated `MomoTransferScreen` from its explicit sheet wrapper, `MomoTransferModal`, around `MomoTransferView`. The shared views still contain both presentation branches; splitting their workflows remains later work.

**Consequence:** a maintainer cannot reliably locate a feature from the route or filename. Separate route wrappers, feature screens, and true dialogs; move one feature at a time. Verify existing entry points before removing legacy branches.

### Medium priority: component size reflects multiple reasons to change

Measured source sizes at this revision:

| Component | Lines | Mixed concerns observed |
| --- | ---: | --- |
| `BitcoinModal.tsx` | 1,090 | Routing, send/receive state, scanning, quoting, validation, and rendering |
| `MomoTransferModal.tsx` | 931 | Transfer direction, review, recovery, and presentation |
| `EcashModal.tsx` | 801 | Send/receive presentation, picker behavior, page/modal rendering |
| `WalletBalanceCard.tsx` | 636 | A further candidate for responsibility review before extraction |

These counts are review signals, not limits. Split independently changing behavior and ownership, not arbitrary line ranges. A new hook with the same unrelated responsibilities merely relocates the problem.

### Medium priority: UI reuse exists but is inconsistent

[MintBalancePicker](cashu-app/src/components/shared/MintBalancePicker.tsx) now serves the standard Bitcoin and ecash balance selectors in both their page and legacy modal paths after D5/D6. D4 adds focused browser coverage for selection, disabled state, dismissal, focus and portal clipping, and fixes the shared picker's first-open focus timing. D5 preserves the Bitcoin page's locking/visibility rules and the legacy modal's on-chain address-refresh callback; D6 preserves ecash token-mint matching and picker visibility rules. These callers now share dropdown interaction and positioning instead of maintaining separate implementations.

[MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) has a useful presentational boundary, but combines entry, review, and saved-transfer content with a broad flat prop surface. At the initial review, multiple fields shared a declaration line and dense JSX hid structure in 66 lines. B2 expanded that formatting, B3 replaced the nested action-label ternary, and B7 moved the form into its feature folder. Splitting its entry, review and saved-transfer responsibilities remains later work.

**Consequence:** fixes and interaction details can diverge between copies. Reuse established controls, split cohesive feature views, and give props names that communicate their domain role. Avoid a universal payment form with many feature flags.

### Medium priority: styling and documentation have competing sources of truth

[PageHeader](cashu-app/src/components/shared/PageHeader.tsx) and [SlidingSegmentedControl](cashu-app/src/components/shared/SlidingSegmentedControl.tsx) now use semantic theme colors after D2 and D3, preserving their default dark appearance and adapting to light mode. [TransferFundsForm.css](cashu-app/src/components/home/TransferFundsForm.css) still repeats concrete colors for buttons, surfaces, and text. D1 resolved the typography documentation drift: [DESIGN.md](cashu-app/DESIGN.md) now describes the font families and role scales implemented in [App.css](cashu-app/src/App.css). Broader color-documentation alignment remains part of the residual styling review.

**Consequence:** changing the design consistently requires searching multiple representations. Establish the implemented token values as the initial reference, reconcile documentation, and migrate one control at a time. Intentional visual changes should be reviewed separately.

## 5. Reusable UI: what to share and what to keep local

| Element | Decision | Boundary |
| --- | --- | --- |
| `PageHeader` | Keep and improve existing component | Shared title/back/action presentation; routes decide navigation. |
| `NumberPad` | Reuse existing implementation | Emits input changes; callers own money rules, precision, and limits. |
| `MintBalancePicker` | One shared animated presentation for Mobile Money, Bitcoin and ecash payment pages | Receives balances, selection callback and disabled state; no page-specific animation/appearance flags, payment submission or wallet fetching. |
| `SlidingSegmentedControl` | Keep | Preserve current keyboard/selection semantics; tabs and pressed-button groups remain explicit. |
| `SafeQRCode` | Failure/recovery contract verified in D15; one static invoice caller migrated in D16 | Preserve fallback/copy behavior and payload sizing; do not force animated UR flows into a static QR wrapper. |
| `PrimaryActionButton` | Mobile Money migrated in D8; conversion migrated in D9 | Explicit native button type, named content, loading/disabled state and native props; labels/icons/workflow remain caller-owned. |
| `IconButton` | Built in D10; matching address-book/copy callers migrated in D11 | Requires an accessible label and consistent focus/disabled states. |
| `FormField` | Built in D12; Mobile Money/Bitcoin migrated in D13/D14 | Owns label, hint/error IDs, and layout; input remains a child. |
| `PaymentPageLayout` | Built in E1; full Mobile Money view migrated in E2; Bitcoin forms/setup migrated in E3 | Header, named scroll region, footer slots and safe areas; no workflow switches. |
| `BottomSheet` shell | E5 adds the shell; E6 migrates the live Send/Receive action menus with caller checks | Owns portal, backdrop, naming, focus and dismissal; content owns business rules. |
| Mobile Money entry/review/saved views | Keep feature-local | Their fields and recovery rules are not generic UI primitives. |
| Conversion receipt/review views | Keep feature-local initially | Extract only proven common presentation later. |

Before adding a primitive, identify two compatible call sites and migrate them separately. Prefer composition over booleans such as `isMomo`, `isBitcoin`, and `isConversion`. Do not add wrappers that merely rename an HTML element without centralizing useful behavior or styling.

## 6. Target organization and readability rules

Use feature ownership gradually. The following is a proposed destination, not a request to move the whole tree in one change:

```text
cashu-app/src/
  pages/                    # Route entry, route inputs, navigation
  features/
    bitcoin/                # Screens, feature components, hooks, workflows
    momo/
    ecash/
    conversion/
  components/shared/        # Cross-feature UI controls and layout shells
  services/                 # Shared external/native adapters during migration
  store/                    # Application state adapters during migration
  types/                    # Actual cross-feature contracts only
```

Keep feature-specific helpers beside their owner. Keep global wallet state global where appropriate. Avoid blanket barrel exports, generic `helpers.ts` dumping grounds, and new parallel copies of existing implementations. Move code without changing behavior, then improve it in a separate change.

For code that is pleasant to read:

- Use one prop or meaningful statement per line in complex declarations; let JSX indentation show the hierarchy.
- Name domain decisions, such as an approved debit or a resumable transfer, instead of embedding long expressions in rendering.
- Prefer explicit branches over nested ternaries when they encode workflow states.
- Keep a single local abstraction level: rendering should not contain transport or persistence mechanics.
- Explain invariants and non-obvious tradeoffs in comments; remove contradictory historical narration.
- Keep short code inline when extracting it would force the reader to jump files without gaining clarity.

## 7. Verification evidence and limitations

The following results are retained evidence from the initial review, before A1–A5. The refreshed required-check baseline after A1–A4 is recorded under A5 in section 10.

| Check | Recorded result |
| --- | --- |
| Frontend/payment suite | 165 passed |
| TypeScript `tsc --noEmit` | Passed |
| Selected Rust library tests: core, wallet, verifier | 48 passed |
| `ecash-tests` integration run | Three verifier tests failed; run stopped at that test binary |

Both key registrations in [verifier_tests.rs](crates/ecash-tests/tests/verifier_tests.rs) use the literal `"<keyset_id>"`, while proofs contain generated IDs. Lookup therefore fails before the intended assertions. Repair fixtures rather than loosening verifier validation.

Sandbox port restrictions initially blocked mock HTTP tests; rerunning with local port access distinguished that environmental failure from the fixture defects. No complete native build, live financial transaction, rendered visual audit, accessibility audit, or new dependency audit was performed for this assessment.

## 8. Tiny tasks toward 9/10

Each row is one checkbox-sized outcome. Execute stages in order unless their prerequisites are independent. Within a stage, follow the listed order. Each implementation change needs its relevant checks; a roadmap row is not permission to weaken existing behavior. If moving one complete operation is still too large, land the preparatory helpers first and keep the adapter working throughout.

### A. Repair the baseline

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | A1 | Fix the trusted verifier fixture keyset ID. | Valid-note and integrity tests reach their expected assertions. |
| [x] | A2 | Fix the untrusted verifier fixture keyset ID. | All four verifier integration tests pass. |
| [x] | A3 | Update the verifier's “future DLEQ” documentation. | Description agrees with implemented verification. |
| [x] | A4 | Rewrite the contradictory pending-swap comment. | It explains ambiguous outcomes and status reconciliation. |
| [x] | A5 | Record the full required-check baseline. | Every failure has a cause; no assertions or tests are disabled. |
| [x] | A6 | Align release metadata at the selected version, 0.1.20. | Both release checks pass; workspace versions agree and dependency resolutions are unchanged. |
| [x] | A7 | Remove the unused verifier-test import. | Verifier tests pass without the unused `HashMap` import warning. |

### B. Improve navigation and local readability

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | B1 | Add a short architecture map to contributor documentation. | A reader can locate routes, workflows, native adapters, and storage. |
| [x] | B2 | Expand `MomoPaymentForm` props and JSX formatting. | One meaningful declaration per line; rendered behavior unchanged. |
| [x] | B3 | Replace its nested action-label ternary with explicit named logic. | Every existing entry/review/loading label is preserved. |
| [x] | B4 | Inventory Bitcoin page and modal callers. | Each caller and its required behavior is documented before extraction. |
| [x] | B5 | Move the Bitcoin feature implementation into `features/bitcoin`. | Imports resolve; public exports and behavior remain unchanged. |
| [x] | B6 | Name the route-facing Bitcoin component as a screen. | Page ownership is clear; retained dialog entry points have explicit wrappers. |
| [x] | B7 | Move Mobile Money feature implementation into `features/momo`. | Its top-up/cash-out routes and recovery entry points still resolve. |
| [x] | B8 | Separate Mobile Money screen naming from dialog wrappers. | Callers no longer rely on a misleading screen-as-modal name. |

### C. Establish readable, typed boundaries

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | C1 | Type the native `wallet_info` response. | Wallet refresh no longer uses `any` for it. |
| [x] | C2 | Type transaction fields consumed by wallet refresh. | Status filtering and unread state use explicit contracts. |
| [x] | C3 | Add a fixture contract check for those responses. | A changed field name or invalid status is detected. |
| [x] | C4 | Define application error codes for one send command. | Codes distinguish validation, unavailable service, and unresolved outcome. |
| [x] | C5 | Add a compatible structured-error adapter for that command. | Existing message consumers remain supported; new response is tested. |
| [x] | C6 | Migrate its frontend caller to error codes. | Message wording changes do not alter control flow. |
| [x] | C7 | Localize one conversion provider-error parser. | Provider prose is interpreted in one adapter with fixtures. |
| [x] | C8 | Replace Rust conversion stage strings with a serialized enum. | Existing journal strings deserialize unchanged; invalid stages are rejected. |
| [x] | C9 | Verify Rust/TypeScript conversion-stage agreement. | Every supported stage and transition has explicit contract coverage. |
| [x] | C10 | Represent unavailable proxy balance explicitly. | Tests distinguish zero balance, HTTP failure, and timeout. |

### D. Consolidate proven UI patterns

Perform these after comparing the existing call sites. Validate shared behavior before migrating each caller.

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | D1 | Reconcile documented typography with implemented tokens. | DESIGN.md identifies current fonts without changing the appearance. |
| [x] | D2 | Replace `PageHeader` literal colors with matching semantic tokens. | Default appearance is reviewed; supported themes and focus remain usable. |
| [x] | D3 | Migrate segmented-control colors to tokens. | Selected, unselected, hover, and focus states remain distinct. |
| [x] | D4 | Add a focused mint-picker interaction fixture. | Selection, disabled state, Escape, focus return, and viewport clipping are checked. |
| [x] | D5 | Migrate the equivalent Bitcoin custom picker path. | Selection and locking behavior match its previous path. |
| [x] | D6 | Migrate the equivalent ecash picker path. | Page/portal positioning works; obsolete duplicate code is removed after caller checks. |
| [x] | D7 | Build `PrimaryActionButton` from two matching action patterns. | Loading/disabled behavior, button type, and accessible name are explicit. |
| [x] | D8 | Migrate one Mobile Money primary action. | Submission blocking and labels stay owned by the feature. |
| [x] | D9 | Migrate one conversion primary action. | Review/confirmation behavior is unchanged; duplicate styling is removed. |
| [x] | D10 | Create `IconButton` for matching icon actions. | Required label, visible keyboard focus, and disabled behavior are consistent. |
| [x] | D11 | Migrate address-book and copy actions separately. | Each migration preserves its action and feedback. |
| [x] | D12 | Create `FormField` from two matching field layouts. | Label and hint/error IDs are unique and correctly associated. |
| [x] | D13 | Migrate the Mobile Money phone field. | Input, validation announcements, and address-book action still work. |
| [x] | D14 | Migrate one compatible Bitcoin destination field. | Paste/scan controls and validation messages remain feature-owned. |
| [x] | D15 | Check existing `SafeQRCode` failure and payload-change behavior. | A failed render has a usable fallback; changing payload can recover. |
| [x] | D16 | Migrate one compatible direct QR call site. | Payload, size, contrast, and copy fallback are preserved. |

### E. Separate layouts from feature workflows

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | E1 | Introduce `PaymentPageLayout` with header/body/footer slots. | No payment imports; header and actions remain visible with safe areas. |
| [x] | E2 | Migrate one Mobile Money page to the layout. | Short viewport and virtual keyboard do not cover fields/actions. |
| [x] | E3 | Migrate one Bitcoin page to the layout. | Header, scrolling, navigation, and empty state work. |
| [x] | E4 | Inventory actual bottom-sheet callers and dismissal rules. | Blocking/loading dialogs are distinguished from freely dismissible ones. |
| [x] | E5 | Add a shell around the existing bottom-sheet hook. | Dialog naming, initial focus, focus containment/return, and Escape are explicit. |
| [x] | E6 | Migrate one simple bottom sheet. | Existing drag, scroll lock, reduced-motion, and cleanup tests pass. |
| [x] | E7 | Extract `MomoEntryForm` from `MomoPaymentForm`. | It receives only entry values/actions; review state is absent. |
| [x] | E8 | Extract `MomoReview` from the remaining form. | Approved details and confirmation action remain explicit. |
| [x] | E9 | Extract the saved-transfer list. | Rows resume the correct transaction without changing another foreground flow. |
| [x] | E10 | Extract Bitcoin receive presentation. | It renders supplied values/actions without transport calls. |
| [x] | E11 | Extract Bitcoin receive lifecycle into a focused hook. | Amount changes, cancellation, and navigation reject stale results. |
| [x] | E12 | Extract Bitcoin send destination entry. | Paste, scan, address book, and destination validation remain intact. |
| [x] | E13 | Extract Bitcoin send review presentation. | Reviewed destination, amount, fees, and confirmation are explicit. |
| [x] | E14 | Extract Bitcoin send lifecycle. | One owner controls transitions; double-confirmation cannot submit twice. |

### F. Make frontend payment operations independent

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | F1 | Reuse the review calculation for cash-in execution quotes. | Existing rounding and minimum/maximum tests pass. |
| [x] | F2 | Reuse it for cash-out execution quotes. | Fees, reserve, and displayed approval bounds remain consistent. |
| [x] | F3 | Give cash-in polling an injected scheduler. | Tests control time without React refs. |
| [x] | F4 | Give that flow transaction access by ID. | A stale callback cannot update another transaction. |
| [x] | F5 | Inject cash-in provider status access. | Tests use ordinary fakes instead of module-loader interception. |
| [x] | F6 | Give payout polling the same explicit dependencies. | Unknown outcomes remain unresolved without resubmission. |
| [x] | F7 | Extract payout initiation from the polling loop. | Submission intent is persisted before dispatch and only dispatched once. |
| [x] | F8 | Inject fulfillment payment and mint-status operations. | Recovery tests can simulate failure between each external step. |
| [x] | F9 | Reduce the React processor to lifecycle wiring for migrated flows. | Mount/unmount starts/cancels work without owning payment decisions. |

### G. Make Rust operations independent and persistence explicit

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | G1 | Surface a send recovery save failure. | Original outcome and save failure are both diagnosable; no automatic resend. |
| [x] | G2 | Apply the same policy to one receive recovery path. | Failed durability cannot be reported as saved recovery. |
| [x] | G3 | Extract pure proof selection to the wallet crate. | Exact selection, insufficient funds, and denomination boundaries are tested. |
| [x] | G4 | Extract outgoing token/result construction. | V3/V4 payload behavior is preserved by fixtures. |
| [x] | G5 | Extract pending send-record construction. | Recovery ID, proofs, amount, and status are preserved. |
| [x] | G6 | Move send orchestration into a wallet operation. | Tauri delegates; existing locking, fee caps, and duplicate-request protection remain tested. |
| [x] | G7 | Extract receive-input normalization/validation. | Valid and malformed token fixtures establish behavior. |
| [x] | G8 | Move receive orchestration into a wallet operation. | Receiving and interrupted recovery are testable without Tauri state. |
| [x] | G9 | Delegate file read/write through a storage module. | Encryption format, atomic replacement behavior, and paths stay compatible. |
| [x] | G10 | Inject storage into one operation for failure testing. | Tests simulate save failures before/after external submission. |
| [x] | G11 | Characterize current proof normalization before persistence. | Duplicate and already-normalized wallet fixtures have explicit outcomes. |
| [x] | G12 | Add an explicit normalization/preparation call and migrate one save caller. | That caller preserves the characterized behavior. |
| [x] | G13 | Migrate remaining save callers one per change. | Inventory shows no caller relies on implicit normalization. |
| [x] | G14 | Remove normalization from raw persistence. | Saving no longer changes domain state; wallet round trips still pass. |

### H. Enforce improvements and reassess

| Done | ID | Task | Acceptance |
| --- | --- | --- | --- |
| [x] | H1 | Add import-boundary checks for extracted frontend workflows. | Importing React, Zustand, or Tauri there fails CI. |
| [x] | H2 | Enforce no new explicit `any` in migrated native adapters. | The changed boundary cannot silently lose its response types. |
| [x] | H3 | Add formatting checks for migrated modules. | Readable conventions are reproducible without a whole-repo formatting diff. |
| [x] | H4 | Record remaining duplicated UI and weak contracts. | Each residual issue has a concrete caller and a small follow-up task. |
| [x] | H4a | Inventory mixed static/dynamic Tauri-event and Nostr imports. | Each warning has named callers and an explicit loading/subscription requirement. |
| [x] | H4b | Resolve the Tauri-event import inconsistency. | Its Vite import warning is gone; startup and event subscription behavior are preserved. |
| [x] | H4c | Resolve the Nostr import inconsistency. | Its Vite import warning is gone; inbox and invoice transport checks pass. |
| [x] | H4d | Record frontend bundle and startup measurements. | Initial JavaScript/WASM requests, raw/gzip sizes and startup behavior have reproducible evidence. |
| [x] | H4e | Split one measured startup dependency into a lazy chunk. | Initial JavaScript decreases; affected flows work and remaining SDK-size tradeoffs are documented without raising warning thresholds. |
| [x] | H5 | Review ecash/conversion screens using the established patterns. | Remaining oversized responsibilities are split into named, individually testable tasks before editing. |
| [x] | H6 | Verify affected UI at phone and desktop sizes. | Keyboard, focus, long text, pending/error/empty states, and supported themes have recorded evidence. |
| [x] | H7 | Run the full required-check set. | Failures are resolved or explicitly block the target score; none are suppressed. |
| [x] | H8 | Re-score all seven categories with fresh evidence. | Explain why the result earns 9/10 or record the remaining gap honestly. |

## 9. Verification and completion rules

Run focused tests first. Use the checks required by [CONTRIBUTING.md](CONTRIBUTING.md) for the relevant scope:

```sh
cargo test -p ecash-tests --test verifier_tests --locked
cargo test -p ecash-core -p ecash-wallet -p ecash-verifier --lib --locked
npm --prefix cashu-app run test:payments
npm --prefix cashu-app run build
cargo test --workspace --locked
npm --prefix cashu-app run check:release
```

UI work also needs the relevant browser fixtures (`test:bottom-sheets`, `test:success-overlays`) and rendered checks of the changed controls. Add focused fixtures for new primitives; existing fixtures do not automatically cover them. Check phone/desktop layouts, keyboard-only operation, focus return, disabled/loading/error states, long content, and safe areas. Test with synthetic data rather than funded tokens.

**Preserve UI/UX during cleanup.** Keep the existing appearance, layout, labels, navigation, interaction rules, animation timing/easing/stagger, and caller-specific presentation unless the user explicitly authorizes a change. A shared component's defaults are not permission to replace an existing caller's design. Compare caller variants before migration. Settled screenshots cannot prove that an animation survived: check motion and dismissal timing in the browser as well. Any intentional UI/UX change belongs in a separately authorized task.

The user subsequently clarified that the Mobile Money, Bitcoin and ecash payment pages should use one animated mint-selector presentation. That requested consistency replaces the temporary caller-specific variants recorded below. Reduced motion remains a system-preference exception; do not reintroduce page-specific animation opt-ins.

A task is complete when its acceptance statement has evidence, obsolete copies are removed after verifying callers, and its relevant checks pass. Formatting-only work does not require new behavioral tests. Payment refactors require preserved tests for spending ceilings, duplicate submission, ambiguous outcomes, persistence failures, and restart recovery.

For a credible 9/10, a new maintainer should be able to locate a payment feature from its route, read its operation without opening UI internals, and reuse a control without inheriting payment behavior. The resulting code should have fewer responsibilities and fewer hidden assumptions, not just more files.

Preserve wallet files, saved journals, command compatibility, locking, and recovery guarantees throughout. Do not introduce a general dependency-injection framework, universal payment form, new UI library, or project-wide rewrite merely to raise the score. Reassess remaining weak areas after the first improvements rather than assuming this initial list is exhaustive.

## 10. Implementation progress

### A1 — Trusted verifier fixture keyset ID

Completed on 2026-11-18. The shared trusted-mint fixture now registers keys using `mint_key.keyset_id()`, matching the ID in its generated proof.

Verification: `cargo test -p ecash-tests --test verifier_tests --locked --offline`. Before the change: 1 passed, 3 failed. After the change: 3 passed, 1 failed. Both A1 acceptance tests (`test_verify_valid_note` and `test_verify_integrity_mismatch`) pass. The remaining failure is `test_verify_untrusted_with_online_keys_and_forged_face_value`, whose separate fixture is task A2. The existing unused-import warning remains.

### A2 — Untrusted verifier fixture keyset ID

Completed on 2026-11-18. The untrusted-mint fixture now registers keys using `mint_key.keyset_id()`, matching its generated proof. The test still verifies that an untrusted mint with valid DLEQ returns `ValidUntrusted` and that an inflated face value is rejected.

Verification: reproduced the failing A2 test before the change, then ran `cargo test -p ecash-tests --test verifier_tests --locked --offline` after the fix. All 4 tests passed with no skipped tests or changed assertions. The existing unused-import warning remains.

### A3 — Verifier documentation

Completed on 2026-11-18. Updated the verifier module documentation to describe its implemented structural, value, DLEQ, integrity and trust checks. Clarified that loaded keys allow offline DLEQ verification without granting trust, while spend-state checks and redemption require a network connection. Corrected the related key-loading, `ValidUntrusted` and invalid-point documentation to match the code.

Verification: compared the descriptions against `verify`, `pubkey_for`, `add_untrusted_mint_keys` and `check_spend_state`; `cargo doc -p ecash-verifier --no-deps --locked --offline` and `git diff --check` passed. This task changes documentation only; behavioral tests were not rerun.

### A4 — Pending-swap comment

Completed on 2026-11-18. Replaced the contradictory swap-error comments in `send_ecash` with the invariant: an error does not establish that the mint left the input proofs unspent, so the recorded send remains pending for spend-state reconciliation through History.

Verification: inspected the saved pending record, swap-error branch, and History's send spend-state checks. Confirmed that only comments changed in `send.rs`; `git diff --check` passed. No runtime behavior changed, so behavioral tests were not rerun.

### A5 — Required-check baseline

Completed on 2026-11-18, at revision `65ce5ea` with the uncommitted A1–A4 changes. Toolchain: Node.js `v24.11.1`, Rust/Cargo `1.95.0`. This baseline uses the four commands required by CONTRIBUTING.md; it does not include the additional CI history scan or dependency audits.

| Required command | Result | Evidence |
| --- | --- | --- |
| `npm --prefix cashu-app run test:payments` | Passed | 165 passed, 0 failed, 0 skipped. |
| `npm --prefix cashu-app run check:release` | Failed | Ten version-consistency errors, detailed below. |
| `npm --prefix cashu-app run build` | Passed with warnings | TypeScript and Vite production build succeeded; warnings detailed below. |
| `cargo test --workspace --locked` | Passed with local port access | 73 passed, 0 failed, 0 ignored, 0 filtered out across workspace test and doc-test binaries. |

**Release-check failures:** the checker uses app package version `0.1.19` as its reference. The following public metadata disagrees:

| Location | Observed version | Required version |
| --- | --- | --- |
| `cashu-app/package-lock.json`, `packages[""].version` | `0.1.18` (top-level lockfile version is `0.1.19`) | `0.1.19` |
| `cashu-app/src-tauri/Cargo.toml` | `0.1.18` | `0.1.19` |
| All six `crates/*/Cargo.toml` package versions | `0.1.20` | `0.1.19` |
| `website/index.html`, config script cache query | `0.1.18` | `0.1.19` |
| `website/index.html`, mobile version label | `0.1.18` | `0.1.19` |

These account for all ten reported release errors. Release metadata needs a separate version-alignment change using the intended release version; A5 records the inconsistency without choosing or changing that version.

**Frontend build warnings:** Tauri event and Nostr modules have both static and dynamic imports, so those dynamic imports do not move the modules into separate chunks. The main JavaScript bundle is approximately 1,756.51 kB before gzip (550.57 kB gzip), exceeding Vite's 500 kB chunk advisory. The Spark WASM asset is approximately 12,650.26 kB before gzip. The build succeeds; these are follow-up performance investigations, not measured runtime regressions. No warning threshold was changed.

**Rust environment and warning:** the initial workspace run compiled successfully but stopped at two mock-client tests because the sandbox denied local port binding (`PermissionDenied`). Rerunning the same command with local port access completed the entire workspace successfully. This separates an environment restriction from application test failures. The existing unused `std::collections::HashMap` import in `verifier_tests.rs` remains a warning.

**Baseline conclusion:** payment tests, the frontend production build, and the full Rust workspace tests pass. Release validation remains blocked by inconsistent public version metadata. A5 is complete as a baseline-recording task; the project does not yet have an entirely green required-check set. No tests were skipped, assertions removed, checks suppressed, or application/release configuration changed for this task. A5 changes only this document.

### B1 — Contributor architecture map

Completed on 2026-11-18. Added an architecture map to CONTRIBUTING.md covering route entry points, feature/shared UI, React lifecycle and background processing, payment services, frontend stores, native commands, Rust wallet operations/storage, tests, and the website. Included a concrete Lightning invoice payment trace and distinguished native encrypted wallet storage from frontend persisted transaction state.

Verification: checked linked paths and the payment trace against the current implementation; confirmed native command registration, app-data wallet location, and Mobile Money store persistence. `git diff --check` passed. This task changes documentation only; behavioral tests were not rerun.

### B2 — Mobile Money form formatting

Completed on 2026-11-18. Expanded `MomoPaymentForm`'s prop declarations to one per line and formatted its JSX hierarchy, multiline attributes, conditionals, and event handlers. Preserved prop names/types, element order, text spacing, classes, labels, conditions, and callbacks. The nested action-label ternary is only formatted; replacing it with named logic remains task B3.

Verification: compiled the before/after source with the installed TypeScript compiler and compared the resulting JavaScript syntax trees, ignoring source formatting and redundant parentheses; the trees match. `npm --prefix cashu-app run build` and `git diff --check` passed. The existing Vite import/chunk warnings remain. No behavioral tests were added or rerun for this formatting-only change.

### B3 — Named Mobile Money action label

Completed on 2026-11-18. Replaced the nested action-button ternary with a local `actionLabel` computed through explicit branches. Preserved precedence: submitting, then loading the rate, then confirmation or review for the selected transfer direction. The button renders the named label.

Verification: used a temporary component-level check with the installed React JSX runtime and stubbed child components to establish the original labels, then compare all 16 combinations of submitting, loading, review, and transfer direction after the change. All labels match. Including valid/invalid inputs, action-button props, disabled state, and callbacks match for all 32 combinations. The existing payment suite passed all 165 tests; the production build and `git diff --check` passed. Existing Vite warnings remain. No new test files were added.

### B4 — Bitcoin callers and extraction contract

Completed on 2026-11-18. Source inspection found two direct `BitcoinModal` callers, two registered Bitcoin routes, and the navigation producers below. This inventory describes current behavior to preserve in B5/B6; it does not remove dialog branches or change routing.

This caller inventory was captured at B4. B6's entry wrappers are described below; the behavior inventory still applies, and the source links point to the current implementation.

#### Direct component callers

| Caller | Inputs | Current behavior to preserve |
| --- | --- | --- |
| [pages/Bitcoin.tsx](cashu-app/src/pages/Bitcoin.tsx), shared `BitcoinPage` wrapper | `page=true`, `key=direction`, selected `mintUrl`, `initialTab=direction`, route-state `invoice` and `amountSats`, navigation callback | Both route exports render this wrapper. Changing direction remounts the form. The page owns mint fallback, empty state, and exit navigation; the component owns its internal send steps. |
| [TrustedMintsList.tsx](cashu-app/src/components/home/TrustedMintsList.tsx) | Selected `bitcoinMint`; `onClose` clears that local selection. `page`, `initialTab`, invoice and amount are omitted. | Selecting a mint's Bitcoin action clears the revealed card and mounts the component with default `page=false` and `initialTab='send'`. Its mount effect pushes `/send-bitcoin` with that mint, then calls `onClose` to clear the temporary selection. This is a redirecting entry point, not a persistent dialog flow. The list is rendered by [pages/Mints.tsx](cashu-app/src/pages/Mints.tsx). |

No other direct component caller was found in application source or tests. `BitcoinModal` still contains non-page portal, backdrop, tabs and drag/close branches. Their presence does not establish a separate supported dialog caller. B5 should preserve them while moving the implementation; any removal or wrapper redesign belongs to B6 after entry-point verification.

#### Routes and navigation producers

| Source | Destination and inputs | Current behavior to preserve |
| --- | --- | --- |
| [App.tsx](cashu-app/src/App.tsx) | `/send-bitcoin` → `SendBitcoinPage`; `/receive-bitcoin` → `ReceiveBitcoinPage` | Route URLs and exports stay compatible. Both routes use the viewport-height app frame. |
| [WalletBalanceCard.tsx](cashu-app/src/components/home/WalletBalanceCard.tsx), send action | Push `/send-bitcoin`, state `{ mintUrl: activeMint }` | Starts send mode. The action returns early when there is neither an active mint nor any available mint. |
| Same component, receive action | Push `/receive-bitcoin`, state `{ mintUrl: activeMint }` | Starts receive mode with the same no-mint guard. |
| Same component, route-state effect | Replace with `/send-bitcoin`, state `{ mintUrl: activeMint, invoice: state.lnbcInvoice, amountSats: state.onchainAmountSats }` | Preserves the scanned destination and optional Bitcoin amount. This branch runs after ecash request/token branches, so their precedence must remain unchanged. |
| [useScan.ts](cashu-app/src/hooks/useScan.ts) via Home's wallet card | First navigates to `/` with `lnbcInvoice`; on-chain input also supplies `onchainAmountSats` | Lightning invoices, Bitcoin addresses/BIP21 amounts, and validated LNURL inputs reach the wallet-card redirect. Preserve the existing push-to-Home then replace-to-send history behavior. Invalid LNURL results stay in the scan flow. |
| [BitcoinPaymentView.tsx](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx), non-page mount effect (originally in `BitcoinModal`) | Pushes send/receive route based on `initialTab`; state `{ mintUrl: initialMintUrl, invoice: initialInvoice, amountSats: initialAmountSats }` | Calls the supplied `onClose` after navigation. The trusted-mint list currently uses the send default; the component also defines the receive branch. |

#### Page inputs and lifecycle boundaries

- **Mint selection:** the wrapper first uses truthy `location.state.mintUrl`, otherwise `localStorage.preferred_mint_url`. If that candidate is not in `Object.keys(mintBalances)`, it uses the first mint; it does not then retry the stored preference. No available mint renders the direction-specific “Add a mint” state and `/mints` link. That empty state's back action goes to `/`.
- **Form defaults:** omitted `initialTab` means send; omitted `initialInvoice` means an empty string. The destination is parsed on initialization: an on-chain destination starts at the amount step, other inputs at the input step. The initial amount uses `initialAmountSats ?? parsed.amountSats` and displays only a positive value. Receive starts in Lightning mode with an empty amount.
- **Remounting:** `key=direction` resets the form when switching route direction. Mint, destination and amount props initialize component state; the current implementation has no effect that reapplies changed route props to an already-mounted form of the same direction. Extraction must not silently change this lifecycle contract.
- **Back and exit:** page-header back moves send confirmation → amount → input before calling the page's exit callback. The header disables back while paying, requesting, or resolving an LNURL invoice. Normal exit goes back when `window.history.state?.idx > 0`, otherwise to `/`. The receive-success Done button calls the same exit callback.
- **Payment overlay:** dismissing the overlay clears its status; success also invokes `onClose` only in non-page mode. Retry uses the saved payment action. Preserve page completion separately from overlay dismissal.
- **Layout dependencies:** [PageTransition.tsx](cashu-app/src/components/navigation/PageTransition.tsx) assigns both routes rank `0.5`. The implementation (`BitcoinModal.tsx` at B4, `BitcoinPaymentView.tsx` after B6) imports `BitcoinPages.css`. Preserve stylesheet loading, shared-component imports, route ranks and the app-frame classification during relocation.

#### Extraction acceptance checks

1. Direct send/receive routes work with a valid mint, a stored preferred mint, an invalid candidate mint, and no mints. Preserve current fallback and empty-state behavior.
2. Wallet-card actions open the correct direction and mint. A mint-list Bitcoin action reaches send and clears its temporary selection; Back returns to the prior route without reopening that selection.
3. Scanning a Lightning invoice, Bitcoin URI with amount, or valid LNURL carries the destination and optional amount through the existing redirect chain. Invalid LNURL remains in the scan flow.
4. Send/receive direction changes reset the form. Re-entering the same route direction preserves the existing initialization semantics. Header back steps through send review/amount/input, and direct-entry exit falls back to Home.
5. Receive completion, payment overlay dismissal/retry, busy back controls, viewport layout, and styles retain their behavior.

The existing [success-overlay fixture](cashu-app/tests/browser/successOverlay.fixture.tsx) uses `/send-bitcoin` as a MemoryRouter location but renders only the shared overlay, not `BitcoinModal` or its page wrapper. Its browser tests therefore do not establish the entry-point behaviors above; verify those explicitly when implementing the extraction.

Verification: searched application source and tests for component imports/usages, route registrations and Bitcoin navigation targets; traced scanned inputs, mint selection, lifecycle initialization, exit callbacks, and overlay handling. Checked documentation links and direct-call-site counts; `git diff --check` passed. This task changes only this document. Behavioral tests were not rerun, and the extraction acceptance checks above remain future verification work.

### B5 — Bitcoin feature location

Completed on 2026-11-18. Moved `components/home/BitcoinModal.tsx` and its sole-importer stylesheet `BitcoinPages.css` into `cashu-app/src/features/bitcoin/`. Updated relative shared-component imports and both callers (`pages/Bitcoin.tsx` and `components/home/TrustedMintsList.tsx`). Updated the contributor architecture map and the review's source link/location finding. The exported `BitcoinModal` name, props, page/modal branches, routes, and payment behavior are preserved; naming changes remain task B6.

Verification: compared source snapshots before/after the move. All non-import TSX content and all stylesheet bytes are unchanged; imported symbols and resolved dependency targets match. Both old source files are absent and no old-path imports remain. The production build passed, and its emitted file-name/hash map matches the pre-move build exactly. All 165 payment tests passed. Documentation links and `git diff --check` passed. Existing Vite warnings remain. No new browser interaction checks were run for this relocation; B4's entry-point acceptance inventory remains the reference for B6's naming/wrapper changes.

### B6 — Explicit Bitcoin screen and compatibility entry

Completed on 2026-11-18. The route wrapper now renders `BitcoinScreen`, whose props omit the presentation flag and whose implementation always selects page mode. The existing `BitcoinModal` export remains an explicit compatibility entry for `TrustedMintsList`, always selecting non-page mode and retaining its redirect-and-close behavior. Both delegate to `BitcoinPaymentView`, the renamed shared implementation. Its state, effects, markup and styles are unchanged. This task names the entry boundaries; later workflow extraction tasks still own splitting the shared view.

Current caller graph:

```text
pages/Bitcoin.tsx → features/bitcoin/BitcoinScreen.tsx → BitcoinPaymentView (page=true)
TrustedMintsList.tsx → features/bitcoin/BitcoinModal.tsx → BitcoinPaymentView (page=false)
```

Verification: confirmed that the shared view differs from the B5 snapshot only in its exported component/interface names. Temporary React-JSX checks verified wrapper prop forwarding and fixed modes for omitted/send/receive tab inputs. Both page directions preserved route-state invoice/amount, valid/stored/invalid mint selection, direction keys, no-mint rendering, and history-aware exit callbacks. Executed the actual redirect-effect callback with synthetic inputs: page mode does not navigate; non-page send/receive entries push the correct route/state before calling `onClose`. These are isolated entry-boundary checks, not browser or live-payment tests.

All 165 existing payment tests passed. The production build, documentation links and `git diff --check` passed; existing Vite warnings remain. Contributor navigation and the B4 implementation links were updated. No new test files were added. B7 remains pending.

### B7 — Mobile Money feature location

Completed on 2026-11-18. Moved `MomoTransferModal.tsx`, `MomoPaymentForm.tsx`, and `MomoPages.css` from `components/home/` into `cashu-app/src/features/momo/`. Updated shared/address-book imports and the `pages/MobileMoney.tsx` caller. Updated the contributor map and review links. Component names and page/modal modes remain unchanged for B8; shared services, stores and recovery logic stay at their existing locations.

Verification: compared the before/after source snapshots. Component bodies, route-wrapper logic, recovery callbacks and CSS bytes are unchanged, and imported symbols resolve to the same dependencies after accounting for the move. Old files and old-path imports are absent. The production build passed and all emitted production files match the pre-move build byte for byte. All 165 payment tests passed. Documentation links and `git diff --check` passed. Existing Vite warnings remain. No new browser or live-provider checks were run for this relocation. B8 remains pending.

### B8 — Explicit Mobile Money screen and sheet entry

Completed on 2026-11-18. Top-up/cash-out routes now render `MomoTransferScreen`, which always selects page mode. The `MomoTransferModal` export is an explicit sheet-mode wrapper; source inspection found no current in-repo dialog caller, but the existing export and sheet behavior are retained. Both wrapper prop types omit the presentation flag. The shared implementation is named `MomoTransferView`; its state, effects, recovery callbacks, markup, defaults, and styles are unchanged. Later workflow tasks still own splitting that implementation.

Current caller graph:

```text
pages/MobileMoney.tsx → features/momo/MomoTransferScreen.tsx → MomoTransferView (page=true)
MomoTransferModal.tsx (retained sheet entry) → MomoTransferView (page=false)
```

Verification: confirmed that the shared implementation differs from the B7 snapshot only in its exported component/interface names. Temporary React-JSX checks verified fixed modes and prop forwarding for omitted/send/receive tabs. Both route directions preserved their initial tab, direction keys, valid/stored/invalid mint selection, empty state, and history-aware back/exit callbacks. Executed the actual initial-tab expression against the real `canSaveMomoTransaction` helper in 14 synthetic active-transfer cases, including live funding, recovery waits and idle state; all matched the existing behavior. These are isolated entry-boundary checks, not browser or live-provider tests.

All 165 payment tests passed. The production build, documentation links and `git diff --check` passed; existing Vite warnings remain. Contributor navigation was updated. No new test files were added. Section B is complete; C1 remains pending.

### C1 — Typed native wallet-info response

Completed on 2026-11-18. Added `WalletInfoResponse` in `cashu-app/src/types/wallet.ts`, matching the serialized fields of Rust's `commands/wallet.rs::WalletInfo`: `is_initialized: boolean`, `balance_sats: number`, `mnemonic: string | null`, and `mint_balances: Record<string, number>`. Wallet refresh now calls `invoke<WalletInfoResponse>('wallet_info')` instead of annotating the response as `any`. Transaction typing remains C2.

Verification: checked the type against the Rust struct and both initialized/uninitialized response branches. The installed TypeScript compiler emits identical JavaScript for the wallet store before/after this change. All 165 payment tests, the production build, documentation links and `git diff --check` passed. Existing Vite warnings remain. This is compile-time response typing; it does not introduce runtime schema validation or new test files. C2 remains pending.

### C2 — Typed wallet transaction summaries

Completed on 2026-11-18. Added `WalletTransactionSummary` to the shared wallet types module with `id: string`, the four native status variants (`Pending`, `Success`, `Failed`, `FailedMintError`), and a numeric Unix timestamp in seconds. Wallet refresh now invokes `get_transactions` with that summary-array type and infers the filter callback's transaction type. The history UI's existing `Transaction` interface extends the shared summary, keeping those fields/status variants in one place without making the store depend on a UI component. The remaining transaction payload fields are outside C2.

Verification: checked the consumed fields and status variants against Rust's `Transaction`/`TransactionStatus` serialization and the command's newest-first ordering. The wallet store and history card emit identical JavaScript before/after these type-only changes. All 165 payment tests, the production build, documentation links and `git diff --check` passed; existing Vite warnings remain. No runtime validation or new test files were added. C3's fixture contract checks remain pending.

### C3 — Shared native/frontend contract fixtures

Completed on 2026-11-18. Added [synthetic native responses](cashu-app/tests/fixtures/native-wallet-responses.json) covering initialized/uninitialized wallet info and transactions with all four native statuses. The fixture uses example mint URLs, empty mint outputs/blinding sessions, and no mnemonic or funded token data.

[Rust serialization tests](cashu-app/src-tauri/src/commands/wallet.rs) compare real `WalletInfo` and `Transaction` values against that shared fixture. An exhaustive status match forces new Rust enum variants to be considered when maintaining the fixture. [Frontend contract tests](cashu-app/tests/walletContracts.test.mjs) use the installed TypeScript compiler to check the same fixture against `WalletInfoResponse` and `WalletTransactionSummary`. Negative cases deliberately rename the native balance and timestamp fields and supply the invalid status `Completed`; the compiler must reject each change. The virtual TypeScript input is compiled in memory, without generated source files or new dependencies.

Verification: all 169 frontend/payment tests passed, including the four new contract checks. The native library suite passed all 4 tests, including both new serialization tests, with `CARGO_INCREMENTAL=0 cargo test -p bitnotes --lib --locked --offline`; incremental caching was disabled to limit disk usage, without disabling any tests or assertions. The production build and `git diff --check` passed; existing Vite warnings remain. The focused frontend checks passed again after improving diagnostic assertions. These checks protect fixture serialization/type compatibility; they do not add runtime response validation or exercise funded providers. C4 remains pending.

### C4 — Send-ecash error contract

Completed on 2026-11-18. Selected `send_ecash` for the first structured-error migration and defined [SendEcashError](cashu-app/src/types/sendEcash.ts) as `{ code, message, tx_id }`. The code is a stable application identifier; the message supplies human-readable detail. `tx_id` identifies a transaction to reconcile when known, otherwise null; C5 clarified that a known ID alone does not guarantee persistence. A null ID does not prove that nothing happened or make a retry safe.

| Code | Meaning for the native adapter in C5 |
| --- | --- |
| `INVALID_REQUEST` | The new send is rejected by request validation, such as mismatched request/cap fields, an oversized request, or a duplicate payment request. |
| `WALLET_LOCKED` | Authentication prevents access to the wallet before the send operation starts. |
| `INSUFFICIENT_FUNDS` | Spendable proofs cannot cover the requested amount and applicable fees. |
| `REVIEW_REQUIRED` | The current fees exceed the user's approved cap; obtain a fresh review before another attempt. |
| `SERVICE_UNAVAILABLE` | A read-only preparation dependency is unavailable before a send or proof-changing operation could have started. |
| `OUTCOME_UNKNOWN` | Spending or proof mutation may have started, but its result or durable recovery state cannot be confirmed. Reconcile the existing operation; do not automatically resend. |
| `INTERNAL_ERROR` | An unexpected local failure with a confirmed non-submitted outcome. If that cannot be established, use `OUTCOME_UNKNOWN`. |

C5 must assign codes at failure sites using operation state, not by parsing error messages. No code on its own authorizes an automatic retry. This step defines the TypeScript boundary contract and its semantics only: the existing native command still rejects the same string errors, with the Rust adapter and compatibility tests reserved for C5 and the frontend caller migration for C6.

Verification: temporary TypeScript compiler probes accepted all seven code/message/nullable-ID examples and rejected an unknown code, an omitted `tx_id`, and a non-string message. Synthetic examples retained their fields through JSON round trips; this does not establish native serialization, which is C5 work. All 169 payment tests, the production build, documentation links and `git diff --check` passed; existing Vite warnings remain. No application behavior, Rust code, dependency, or permanent test file changed. C5 remains pending.

### C5 — Compatible structured native send adapter

Completed on 2026-11-18. The adapter uses a versioned native command boundary:

| Command | Success | Application failure |
| --- | --- | --- |
| `send_ecash` | Existing `{ token, token_v3, token_v4, tx_id }` result | Existing human-readable string |
| `send_ecash_v2` | Same result and arguments as `send_ecash` | `{ code, message, tx_id }`, matching the C4 contract |

Both handlers call one shared send operation, once. That operation classifies errors at known failure sites. Typed wallet access distinguishes authentication failures from local load failures while preserving the original lock sequence and string-error API for other commands. Quote preparation similarly preserves the existing quote command's message response. No error-code classification parses human-readable messages, and no automatic retry or legacy-command fallback was introduced.

The send retains its proof selection, fee caps, pending-record persistence, swap and result construction. Duplicate requests return the known transaction ID. Unconfirmed swaps and failures after proof allocation return `OUTCOME_UNKNOWN`; a previously persisted pending ID is included when available. A transaction ID does not guarantee the latest state was saved, and its absence does not authorize another send. Receive and deferred-save operations are unchanged. The existing discarded secondary save error in the swap-failure branch remains G1 work; it is already classified as an unresolved outcome here.

Both commands are registered in Tauri. Current frontend callers still invoke the legacy command; migrating one caller is C6. Tauri-level argument or invocation failures may remain strings, so C6 must tolerate those errors as well as structured application errors and must not automatically resubmit a failed v2 call through the legacy command.

Coverage includes a [shared error fixture](cashu-app/tests/fixtures/send-ecash-errors.json) checked against real Rust serialization and the TypeScript contract, legacy string serialization for every code, and [send operation tests](cashu-app/src-tauri/src/commands/send_tests.rs) for authentication/load failures, validation, missing funds, duplicate requests, quote outages, fee-cap boundaries, durable pending recovery, failed final persistence and the unchanged success shape. Tests use synthetic unfunded proofs and an unavailable loopback mint; no funded provider is contacted. The new send tests live outside the command implementation to keep it navigable.

Verification: the initial serialization tests failed because the native structured types did not yet exist, then passed after implementation. All 171 frontend/payment tests and the production build passed. The targeted native library suite passed all 15 tests; the full Rust workspace passed all 86 tests with `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` and local mock-server port access (0 failed, ignored, or filtered out). Receive/deferred-save command bodies were compared with their pre-C5 snapshots and remain unchanged. Documentation links and `git diff --check` passed. The existing verifier unused-import and Vite bundle warnings remain. Release validation still fails with exactly A5's ten version-consistency errors; none were suppressed or changed for this task. No dependencies or payment/provider configuration changed. Native IPC registration was compiled; no device or live-payment testing was performed. C6 remains pending.

### C6 — Frontend send caller uses native error codes

Completed on 2026-11-18. The send function in [useEcash](cashu-app/src/hooks/useEcash.ts) now invokes `send_ecash_v2` with the typed success result. Its receive flow and public return shape remain unchanged. Both existing UI consumers of that hook keep their string-message callback and result handling; the separate invoice/request caller in `EcashRequestPayment.tsx` remains on the compatible legacy command.

[Send-error handling](cashu-app/src/services/sendEcashError.ts) validates the rejection's object shape and known code before assigning a user-facing message and reconciliation requirement. It never parses message wording. Unrecognized codes, malformed objects, raw strings and invocation errors all take the conservative unconfirmed-outcome path. Any known transaction ID also requires checking the existing record. No failure triggers an automatic resend or fallback invocation of `send_ecash`.

An unconfirmed outcome blocks further native send calls within the same hook instance and directs the user to History. This is a form-lifetime guard, not a persistent wallet-wide lock across navigation or restart; durable recovery remains the native journal/History workflow. Unfinished transaction IDs are not used as recipient-claim IDs, and a new attempt clears old claim tracking. A confirmed token remains a successful result if the subsequent balance refresh fails. Read-only preparation failures allow a later explicit attempt, while the existing in-flight ref prevents concurrent submission.

Verification: before the hook migration, five new caller tests failed, exposing the legacy invocation, repeated unresolved sends, message-based display, and loss of a confirmed result on balance-refresh failure. After migration, all 182 frontend/payment tests passed, including 11 new error/adapter tests covering all seven codes with changed message wording, invalid payloads, saved/absent transaction IDs, explicit retry after a preparation failure, no legacy fallback, concurrent calls, claim-tracking reset and refresh failure after success. Tests execute the actual hook with mocked React effects/native dependencies; they do not perform a browser or funded-provider journey. The production build, documentation links and `git diff --check` passed; existing Vite warnings remain. Release validation still reports A5's ten version-consistency errors. No Rust code or dependencies changed for C6. C7 remains pending.

### C7 — Spark conversion minimum-error adapter

Completed on 2026-11-18. Moved the conversion minimum diagnostic parser out of [transfer amount calculations](cashu-app/src/services/transferAmount.ts) into [sparkConversionError.ts](cashu-app/src/services/sparkConversionError.ts). The provider-specific adapter exposes `parseSparkConversionMinimum(error: unknown)`, returning typed `attempted` and `minimum` values in source-currency base units, or null when the existing recognition/amount checks fail. [The quote workflow](cashu-app/src/services/stableBalanceService.ts) consumes that result; only the adapter interprets this diagnostic's prose.

The extraction preserves the existing message pattern, Error/string handling, bigint arithmetic and guards: the attempted amount must be positive, the minimum must exceed it, and the minimum must fit within JavaScript's safe integer range. The original parser export was removed after checking its only production caller. Existing budget ceilings, quote resizing, fee-inclusive minimum handling and saved operations remain unchanged. This task isolates one parser; the separate presentation/recovery error handling in `transferError.ts` remains outside this slice.

Added twelve [synthetic diagnostic fixtures](cashu-app/tests/fixtures/spark-conversion-errors.json) covering bare/wrapped messages, case differences, the largest safe minimum, changed/incomplete wording, zero/negative amounts, non-increasing minimums and unsafe values. [Adapter tests](cashu-app/tests/sparkConversionError.test.mjs) check each fixture as both a string and an Error, plus unsupported payloads. These examples characterize the currently recognized wording; they do not guarantee future provider message stability. Two additional [quote-workflow tests](cashu-app/tests/stableBalanceService.test.mjs) verify that unrecognized errors and minimum errors without a source budget propagate the original error after one quote call, without funding, sending or saving an operation.

Verification: all 73 focused adapter/workflow tests passed against the original parser before extraction. After extraction, all 197 frontend/payment tests passed (15 new checks), including the existing quote-resizing, spending-ceiling and recovery tests. The TypeScript/production build, documentation links and `git diff --check` passed; existing Vite import/chunk-size warnings remain. Release validation still reports exactly A5's ten version-consistency errors. No Rust code, dependencies or provider configuration changed; no live provider or funded-payment testing was performed. C8 remains pending.

### C8 — Serialized Rust conversion stages

Completed on 2026-11-18. Added `StableStage` to [the conversion journal model](crates/ecash-wallet/src/stable.rs) and replaced `StableOperation.stage: String` with that enum. Serde preserves all ten existing JSON values exactly: `quoted`, `funding`, `funded`, `converting`, `settling`, `returnQuoted`, `returning`, `complete`, `cancelled` and `refunded`. No journal rewrite or format-version change is required for valid saved operations. Unknown, misspelled and missing stages are rejected during deserialization rather than mapped to a default or discarded from the wallet.

The journal's review, recovery, active-state and transition methods now use enum variants. [Native conversion commands](cashu-app/src-tauri/src/commands/stable.rs) and [receive preparation](cashu-app/src-tauri/src/commands/receive.rs) use the same type. `stable_advance` accepts `StableStage` for both expected/next stage arguments, preserving the JSON strings sent by existing callers while rejecting invalid values before the handler runs. Spending, confirmation, persistence and recovery conditions remain unchanged. A normalized comparison with the previous native command code found only the enum migration/formatting changes; the eleven allowed journal transition pairs are identical.

Added a [synthetic saved-operation fixture](crates/ecash-wallet/tests/fixtures/stable-operation.json) containing no funded proofs, private keys or live invoices. Three journal tests verify exact operation round trips and wallet loading for each stage, rejection of invalid values in both operations and wallets, and rejection of a missing stage. Existing tests continue to cover legacy field defaults, wallets without a conversion journal, irreversible-stage restrictions, protected reviews and legacy/live-rejection recovery.

Verification: the new invalid-stage test failed against the string model before implementation; all 11 focused journal tests passed after migration. The final full Rust workspace run passed all 89 tests (0 failed, ignored or filtered out) using `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` with local mock-server port access. All 197 frontend/payment tests and the TypeScript/production build passed. The journal module's formatting, documentation links and `git diff --check` passed. Existing verifier unused-import and Vite import/chunk-size warnings remain; release validation still reports A5's ten version-consistency errors. No dependencies, frontend stage definitions or provider configuration changed. Native commands compiled, but no device IPC or funded-provider journey was performed. C9's explicit Rust/TypeScript stage-and-transition agreement checks remain pending.

### C9 — Shared conversion-stage and transition contract

Completed on 2026-11-18. Added a [shared stage fixture](crates/ecash-wallet/tests/fixtures/stable-stages.json) listing all ten serialized stages, their active/terminal classification and the journal's eleven allowed ordinary transitions. The fixture is test data consumed by both Rust and frontend tests; application code does not import it.

[Rust contract tests](crates/ecash-wallet/tests/stable_stage_contract.rs) require every enum variant to appear once, check active-state classification, reject duplicate destinations and compare the actual `can_transition` result against the fixture for all 100 stage pairs: eleven allowed and 89 forbidden. An exhaustive enum match forces a new Rust variant to be considered when maintaining the contract. C8's journal serialization, invalid-stage rejection and recovery tests remain intact.

[TypeScript contract tests](cashu-app/tests/stableStageContracts.test.mjs) compile the same fixture against both `StableStage` and `StableOperation['stage']`, checking coverage in both directions and checking every transition destination. Negative cases must reject a changed wire spelling, an omitted supported stage and an invalid destination. The compiler inputs exist only in memory; no generated source files or new dependencies are needed.

[Frontend workflow tests](cashu-app/tests/stableBalanceService.test.mjs) now reject native stage requests that disagree with the shared ordinary-transition policy. Two additional scenarios check active/terminal handling for every stage and exercise all eleven ordinary transitions through actual frontend service calls using mocked native/SDK boundaries. These include both conversion directions, cancelling a review, preparing/cancelling/executing a funding return, and reconciling a provider-confirmed refund without another send. Confirmed-funding reconciliation (`funding` to `funded`) and same-stage payment-ID recording remain explicit native-command exceptions in the mock, outside the ordinary-transition table. Native receipt, quote, persistence and recovery guards remain authoritative; the mock is not a substitute for those checks.

Verification: both new Rust contract tests and all 62 focused workflow tests passed. Deliberately removing `quoted` to `cancelled` from the fixture made the Rust matrix test fail on that pair; the original fixture was restored before final verification. The full Rust workspace then passed all 91 tests (0 failed, ignored or filtered out) using `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` with local mock-server port access. All 203 frontend/payment tests passed, including six new frontend checks, and the TypeScript/production build passed. The new Rust test's formatting, documentation links and `git diff --check` passed. Existing verifier unused-import and Vite warnings remain; release validation still reports A5's ten version-consistency errors. Application behavior, journal formats, dependencies and provider configuration are unchanged. No device IPC or funded-provider journey was performed. C10 remains pending.

### C10 — Explicit proxy balance availability

Completed on 2026-11-18. Moved the read-only proxy balance request from [flowServices.ts](cashu-app/src/services/flowServices.ts) into [proxyBalanceService.ts](cashu-app/src/services/proxyBalanceService.ts). `fetchProxyBlinkBalance` now returns a discriminated result: `{ status: 'available', balanceSats }` or `{ status: 'unavailable', reason }`. HTTP failures also carry `statusCode`; the other reasons distinguish a timeout, a network failure and an invalid response. A confirmed BTC balance of zero remains available with `balanceSats: 0`.

The adapter treats JSON as unknown and requires a BTC wallet with a nonnegative safe-integer balance. Missing wallet data, partial responses with provider errors, malformed JSON and invalid amounts no longer become zero. The existing deadline still covers both the request and the response-body read and still aborts on timeout. [ProxyRequestTimeoutError](cashu-app/src/services/proxyRequest.ts) identifies that outcome without parsing its message; it remains a `ProxyRequestError` with the same message, `submission: 'unknown'` and `retryable: true` behavior for existing consumers.

[MomoTransferView](cashu-app/src/features/momo/MomoTransferView.tsx) now keeps an unavailable result separate from its initial null state and compares amounts against gateway liquidity only when the result is available. This removes the false insufficient-liquidity message after a failed balance read. The check remains advisory, matching its existing behavior while the balance is loading; an unavailable result does not establish sufficient liquidity. No payment-submission, confirmation or recovery behavior changed, and no automatic payment retry was added. The configured proxy endpoint and request deadline are unchanged.

Eight new [balance tests](cashu-app/tests/momoFlows.test.mjs) cover a confirmed zero, positive BTC sats alongside another currency, HTTP 401/503 responses, connection failures, a request that never settles, a stalled body, invalid wallet data and malformed JSON. The two timeout cases use a fake clock to exercise the existing 60-second deadline without waiting in real time. [Deadline tests](cashu-app/tests/proxyRequest.test.mjs) also verify the timeout subtype's compatibility with the existing error contract.

Verification: all eight new tests failed against the previous numeric fallback and passed after implementation; all 30 focused balance/flow/deadline tests passed. The full frontend/payment suite passed all 211 tests, and the TypeScript/production build passed. Both existing Chrome browser suites passed (seven bottom-sheet checks and seven success-overlay checks). With DevTools MCP unavailable, a temporary isolated Chrome fixture exercised the actual Mobile Money view, form and new balance adapter with synthetic HTTP responses and disabled payment submissions. Confirmed zero retained the liquidity warning and disabled review; positive, HTTP-failure and timeout cases produced the expected advisory behavior. The fixture shortened only its own deadline timer; no application deadline was changed. These rendered caller checks do not constitute a full visual or accessibility audit. Documentation links and `git diff --check` passed. Existing Vite warnings remain; release validation still reports A5's ten version-consistency errors. No Rust code, dependencies or provider credentials changed, and no funded provider or device IPC was exercised. D1 remains pending.

### A6 — Release metadata alignment

Completed on 2026-11-18 as a separately approved baseline follow-up after C10. The user selected 0.1.20, retaining the highest existing version instead of lowering the Rust crates to the app's previous 0.1.19 metadata. The npm package and both npm lockfile root versions, native crate manifest, Tauri config, Cargo lockfile's native package entry, website download URLs and desktop/mobile labels now agree at 0.1.20. The other six Rust crate manifests already used that version and required no edits.

The npm CLI updated its own lockfile with lifecycle scripts disabled; Cargo refreshed its own lockfile offline. Structural comparisons confirm that npm dependency resolutions are unchanged and that the only Cargo package change is the native app's version. [The changelog](CHANGELOG.md), [release guide](RELEASING.md) and [current verification report](RELEASE_CHECKS.md) now distinguish source metadata alignment from publication. The existing local `v0.1.20` tag predates the current working tree and was not changed; publishing newer code needs a new version and tag.

Added explicit follow-up tasks instead of relying on warnings to disappear during unrelated refactors: A7 removes the unused verifier-test import, and H4a–H4e inventory/fix mixed import paths, establish bundle measurements and make a measured startup split after the structural work. No warning threshold or validation rule was weakened.

Verification: the release checker first reproduced the ten version errors. After alignment, both the normal and extended `--history` release checks pass. All 211 frontend/payment tests, the TypeScript/production build and all 91 Rust workspace tests pass; the Rust run used `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` with local mock-server port access (0 failed, ignored or filtered out). Documentation links and `git diff --check` pass. Existing Rust/Vite warnings remain as the named follow-ups. No application logic, dependency versions, provider credentials or release artifacts changed. No APK was built, no tag was created or moved, and no release or website was published; download-asset availability and device behavior were not verified. A7 and D1 remain pending.

### A7 — Unused verifier-test import removed

Completed on 2026-11-18. Removed the unused `use std::collections::HashMap;` from [verifier_tests.rs](crates/ecash-tests/tests/verifier_tests.rs). Its map constructors already use fully qualified names. Comparing the file with its pre-A7 snapshot confirms that this one import line is the only source change; the A1/A2 fixture fixes and every test assertion are preserved.

Verification: `CARGO_INCREMENTAL=0 cargo test -p ecash-tests --test verifier_tests --locked --offline` passed all four tests with no compiler warnings, failures, ignored tests or filtered tests. Both the normal and extended `--history` release checks, documentation links and `git diff --check` pass. The unchanged frontend and full Rust workspace suites were not rerun for this import-only cleanup; A6 records their most recent results. [The current verification report](RELEASE_CHECKS.md) now reflects removal of this warning. Vite import/chunk-size warnings remain assigned to H4a–H4e. D1 remains pending.

### D1 — Typography documentation matches the app

Completed on 2026-11-18. Updated [the app design document](cashu-app/DESIGN.md) to describe Poppins for interface text, headings, amounts and labels, JetBrains Mono for code/identifiers and the status-pill class, and Playfair Display for the italic auth-screen accent. The typography frontmatter now mirrors all fourteen named roles in `App.css`, including the previously omitted `display-lg` and `label-caps`. Font families and fallback stacks, sizes, weights, line heights and declared letter spacing match the implementation. Related status-pill and address/hash guidance no longer names the obsolete fonts.

The typography section links to its CSS, Fontsource imports, HTML font request and auth-screen caller. It explains the locally bundled Poppins/JetBrains weights, the existing remote Google Fonts requests and the hero accent's Georgia/serif fallback. No font-loading behavior, stylesheet, component or package changed; this task updates the documentation to describe the existing appearance.

Verification: a temporary source comparison checked the complete documented role set and every role's typography properties against `App.css`. Fontsource weight imports and the Playfair request/fallback were checked against `main.tsx`, `index.html` and the accent rule. SHA-256 fingerprints confirm that the app source, HTML entry and npm manifests/lockfile are unchanged. Both release checks, documentation links and `git diff --check` pass. No runtime tests, build or rendered UI audit was rerun for this documentation-only change. D2 remains pending.

### D2 — Page header uses semantic theme colors

Completed on 2026-11-18. Replaced every literal color class in [PageHeader](cashu-app/src/components/shared/PageHeader.tsx) with semantic surface, container, hover and foreground utilities. [App.css](cashu-app/src/App.css) adds `on-surface-muted` and `outline-subtle` because the existing palette had no exact matches for the header's muted text and soft border. Their dark values preserve the previous colors; their light values follow the existing `on-surface-variant` and `outline-variant` roles. [DESIGN.md](cashu-app/DESIGN.md) documents both roles and the header's theme mapping.

The back button now has an explicit two-pixel keyboard focus outline with a two-pixel offset, using `on-surface` for contrast in either theme. A source comparison confirms that only the header's color classes and this focus outline changed. Its props, navigation/callback behavior, disabled/hidden states, content slots, typography, spacing and sticky configuration are preserved.

Added a focused [browser fixture](cashu-app/tests/browser/pageHeader.fixture.tsx) and [regression checks](cashu-app/tests/browser/pageHeader.test.mjs), available through `npm --prefix cashu-app run test:page-headers`. That command builds current production CSS before testing the actual header in an isolated Chrome profile. The fixture serves only its bundle and local CSS/fonts, blocks remote font requests, and uses MemoryRouter instead of native navigation or payment services. Checks cover both themes at 390px and 1024px, long text/overflow, text/icon contrast, keyboard focus and activation, hover colors, default/custom back behavior, disabled/hidden buttons, child/action slots and sticky/non-sticky behavior.

Verification: four theme-contract cases failed against the original header while its navigation and sticky checks passed. After migration, all eight header browser tests pass. Default dark screenshots are byte-identical before/after at both tested widths; their computed text, icon, button and surface colors also match. Subtitle contrast measures 6.78:1 in dark mode and 6.48:1 in light mode; the tests enforce at least 4.5:1 for text and 3:1 for the back icon. All 211 payment tests, both existing browser suites (seven bottom-sheet and seven success-overlay tests), the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. Vite import/chunk-size warnings remain assigned to H4a–H4e.

The Impeccable detector reports no PageHeader findings. Its scan of the shared stylesheet reports 41 advisories and one warning, all on unchanged declarations: legacy palette/motion guidance and the Playfair Display accent being documented in prose rather than typography frontmatter. No findings were suppressed; this broader stylesheet/documentation reconciliation remains for H4's residual review. D2 is a scoped header check, not a full accessibility audit of every caller. No Rust code, dependencies, font loading, provider configuration or payment operations changed. D3 remains pending.

### D3 — Segmented controls use semantic theme colors

Completed on 2026-11-18. Replaced the literal color classes in [SlidingSegmentedControl](cashu-app/src/components/shared/SlidingSegmentedControl.tsx) with semantic utilities. [App.css](cashu-app/src/App.css) adds three selected-state roles: `selection-container`, `on-selection-container` and `selection-outline`. Their dark values retain the existing green pill, amber text and green border; their light values follow `secondary-container`, `on-secondary-container` and `outline`. The control reuses existing surface, muted-text and hover tokens. Its keyboard outline now uses `on-surface` for contrast in either theme, and its decorative highlight follows `primary` at 40% opacity. [DESIGN.md](cashu-app/DESIGN.md) documents the mappings.

Only color classes changed in the component: normalizing those replacements reproduces its pre-D3 source exactly. Props, selection handlers, ARIA relationships, roving tab focus, spacing, indicator measurement and reduced-motion behavior are preserved. Default dark computed colors match before/after for both regular and compact variants at 390px and 1024px. Three of the four dark screenshots are byte-identical; the desktop regular capture differs by one pixel in the decorative highlight. Light-mode captures show dark selected text on a pale green pill instead of the previous fixed dark surface.

Added a focused [fixture](cashu-app/tests/browser/segmentedControl.fixture.tsx) and [browser checks](cashu-app/tests/browser/segmentedControl.test.mjs), available through `npm --prefix cashu-app run test:segmented-controls`. The command builds production CSS before testing the real component. Extracted the header fixture's Chrome setup, cleanup, navigation and contrast helpers into [browserFixture.mjs](cashu-app/tests/browser/browserFixture.mjs); the header suite retains all eight tests. Fixtures run with isolated temporary profiles and local CSS/fonts, without importing the application or contacting payment providers.

Verification: the new theme-contract and light-hover checks failed against the original component while its click, keyboard and indicator checks passed. All thirteen segmented-control tests now pass, covering both themes, widths and variants, selected/unselected colors, hover, keyboard focus, click/Enter selection, tab-panel links, arrow wrapping, Home/End, resize alignment and reduced motion. Selected/inactive text contrast measures 6.59:1/6.27:1 in dark mode and 13.24:1/5.83:1 in light mode; the tests enforce at least 4.5:1 for text and 3:1 for keyboard outlines. The full browser run passes all 35 tests across the segmented-control, header, bottom-sheet and success-overlay suites. All 211 payment tests and the TypeScript/production build pass. Both release checks, documentation links and `git diff --check` pass. Existing Vite warnings remain assigned to H4a–H4e.

The Impeccable detector reports no segmented-control findings. Its shared-stylesheet scan reports 37 advisories and one warning, all on pre-D3 declarations; these remain part of the broader palette/motion and Playfair documentation reconciliation recorded under D2. No findings were suppressed. This is a focused component review, not a full accessibility audit of every caller. No Rust code, dependencies, font loading, provider configuration or payment operations changed. D4 remains pending.

### D4 — Mint-picker interaction fixture and initial focus repair

Completed on 2026-11-18. Added a focused [browser fixture](cashu-app/tests/browser/mintBalancePicker.fixture.tsx) and [interaction checks](cashu-app/tests/browser/mintBalancePicker.test.mjs) for the actual `MintBalancePicker`, including its real `MintName`, `MintIcon` and metadata hook. Twelve synthetic, unfunded `.example.test` mints include a zero balance, a long name and enough rows to require scrolling. The fixture seeds fresh synthetic metadata before importing the component, so it needs no remote mint requests, wallet state, native bridge or provider credentials. Its trigger sits inside an intentionally clipped parent to verify that the menu's body portal escapes that parent.

The initial run exposed a first-open keyboard bug: the component tried to focus the selected row while its portal still had `visibility: hidden`, before the position state update committed. The selected row therefore did not receive focus, and the next Tab/Enter sequence selected the wrong mint. [MintBalancePicker](cashu-app/src/components/shared/MintBalancePicker.tsx) now schedules that focus for the next animation frame with `preventScroll: true` and cancels the frame during cleanup. Its props, selection/dismissal callbacks, positioning calculations, classes and appearance are unchanged. This is the only application-source change in D4.

The fixture checks both themes at 390×844, 320×240 and 1024×600, with the trigger near the top and bottom edges. Assertions cover initial selected-row focus without page scrolling, pointer and keyboard selection, one selection callback per action, trigger balance updates, reopening on the selected mint, Escape without selection, disabled pointer/keyboard activation, outside-click dismissal and focus return. Layout checks enforce viewport bounds, trigger alignment, internal scrolling, long-name containment, resize/scroll repositioning and access to the last mint. Eight screenshots were captured; the dark mobile and short light viewport captures were visually reviewed. These checks use emulated Chrome viewports and mouse/keyboard input, not a physical-device or screen-reader audit.

Added `npm --prefix cashu-app run test:mint-picker`, which builds production CSS before running the fixture. [The shared browser helper](cashu-app/tests/browser/browserFixture.mjs) gains only the Escape key mapping. No dependencies or lockfile changes were needed.

Verification: the original picker failed the selected-row focus and keyboard-selection assertions; the disabled-state check already passed. After the repair, all 15 picker tests pass. The final full browser run passes all 50 tests across five suites, and all 211 payment tests and the TypeScript/production build pass. Both release checks, documentation links and `git diff --check` pass. A source fingerprint comparison confirms that every other app source file and the npm lockfile match their pre-D4 contents. The Impeccable scan has no primary findings; its two advisories concern existing 10px fallback-icon labels, whose styling was not changed or suppressed. Existing Vite warnings remain assigned to H4a–H4e. No Rust code, payment behavior or caller migrations changed. D5 remains pending.

### D5 — Bitcoin custom picker uses the shared component

Completed on 2026-11-18. Replaced the legacy modal's custom dropdown in [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) with `MintBalancePicker`. Removed its two dropdown state variables, toggle/close helpers, 160ms close timer, duplicated option rendering, mint-key list and unused chevron import. The shared component now owns dropdown interaction, focus and portal positioning in both Bitcoin paths. The feature still owns the selected mint and its on-chain selection callback: when the legacy receive view already has a Bitcoin address, selection continues to call `receiveOnChain` with the selected mint and the existing amount/fallback.

The legacy modal immediately redirects to `/send-bitcoin` or `/receive-bitcoin`; those pages already used the shared picker before D5. That redirect is preserved. The page picker JSX is byte-for-byte identical to its pre-D5 form, including its disabled predicate and visibility conditions. It remains disabled while paying, requesting or fetching a Lightning invoice, and hidden during send confirmation or after an invoice/address is generated. The legacy branch retains its previous enabled-state behavior. The initial migration incorrectly replaced its styling and omitted its dropdown motion; the correction recorded below restores its presentation and caller-specific animations through the shared component.

Added a [Bitcoin-view fixture](cashu-app/tests/browser/bitcoinMintPicker.fixture.tsx), explicit [wallet/provider boundary doubles](cashu-app/tests/browser/bitcoinMintPicker.boundaries.ts), and [caller checks](cashu-app/tests/browser/bitcoinMintPicker.test.mjs). These exercise the actual view, picker, metadata presentation, amount keypad and router with synthetic unfunded balances and mocked receive/estimate results. Payment execution throws if attempted. The fixture deliberately keeps the legacy view mounted after its redirect to exercise that compatibility branch; this does not represent the normal page lifecycle. [The shared browser helper](cashu-app/tests/browser/browserFixture.mjs) accepts optional esbuild plugins so the fixture replaces only the listed wallet/history/provider modules without changing production imports. Added `npm --prefix cashu-app run test:bitcoin-mint-picker` to build production CSS before running the checks.

Verification: before migration, the caller selection, page locking, confirmation/receive visibility and legacy address-refresh checks passed, while the shared-portal assertion failed as expected. After migration, all 16 Bitcoin caller tests pass, including both redirect destinations, selected balances reaching the Bitcoin hook, paying/requesting/invoice-fetch locks, confirmation Back behavior, generated invoice/address visibility, and the legacy on-chain callback's exact amount/mint arguments. The migrated menu's body portal, viewport bounds, selected-row focus, Escape and focus return pass in both themes at 390px and 1024px. Four screenshots were captured; the light mobile and dark desktop captures were visually reviewed. The final browser run passes all 66 tests across six suites. All 211 payment tests, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass.

A source fingerprint comparison confirms that the Bitcoin view is the only changed app source file and the npm lockfile is unchanged. The Impeccable scan reports four warnings and seven advisories, all on unchanged declarations: existing tab/border treatment and typography overrides remain for the residual UI review; no findings were suppressed. Existing Vite warnings remain assigned to H4a–H4e. No Rust code, dependencies, provider configuration or ecash picker changed. These are isolated Chrome caller checks, not funded-provider, device IPC or physical-device verification. D6 remains pending.

### D6 — Ecash balance selector uses the shared picker

Completed on 2026-11-18. Replaced the custom selector in [EcashModal](cashu-app/src/components/home/EcashModal.tsx) with `MintBalancePicker` for both page and legacy modal rendering. Removed its dropdown state/ref, position state, layout effect and event listeners, toggle/close helpers, 160ms close timer, duplicated option list and separate page/inline menu branches. Removed the now-unused `useRef`, `useLayoutEffect` and chevron imports. [SendEcashPage.css](cashu-app/src/components/home/SendEcashPage.css) loses only the unused `.ecash-mint-options` rule; the shared picker's `overscroll-contain` utility supplies that behavior.

The feature still owns the selected mint. Its existing visibility guard is identical: the selector stays hidden for a busy send request, a created send token or a receive preview when the scanner is closed. Its enabled-state behavior and adjacent scan action are preserved. The token-input handler, initial-token effect, `mintUrls` lookup and balance calculation are byte-for-byte unchanged, including trailing-slash matching against known mints and selection of a token's unlisted mint. The legacy redirects, outer modal portal and feature payment handlers remain intact. The initial migration incorrectly replaced the selector's presentation and motion with shared defaults; the correction recorded below restores those caller variants.


Added a focused [ecash-view fixture](cashu-app/tests/browser/ecashMintPicker.fixture.tsx), explicit [boundary doubles](cashu-app/tests/browser/ecashMintPicker.boundaries.ts), and [caller tests](cashu-app/tests/browser/ecashMintPicker.test.mjs). The actual view, picker, metadata presentation, amount keypad, receive-invoice component, token parser and preview render with synthetic unfunded data. Wallet/invoice operations, the merchant-request busy callback, clipboard and UR transport hooks are isolated; no claim, invoice submission, camera or provider connection is needed. The synthetic send double records its mint/amount and returns a display-only token. Merchant payment preparation/delivery and UR transport are outside these checks. The resize scenario owns a separate Chrome profile because reusing that emulated viewport interfered with later pointer tests. No test was skipped or disabled. Added `npm --prefix cashu-app run test:ecash-mint-picker`, which builds production CSS before running the fixture.

Verification: against the original selector, ten existing-behavior checks passed while the eight new shared-focus/modal-portal cases failed. After migration, all 19 ecash browser tests pass. They cover send/receive selection on pages and legacy modals, displayed balances, the mint reaching the ecash and invoice hooks, both redirect destinations, hiding after synthetic token creation or the existing busy callback, known/unlisted token-mint auto-selection and a pasted-token preview. Portal bounds, trigger alignment, selected-row focus, Escape and focus return pass in both themes at 390px and 1024px; a separate check verifies alignment after resizing to 320×480. Eight screenshots were captured; the dark mobile page and light desktop modal captures were visually reviewed.

The final browser run passes all 85 tests across seven test files, with no failures, cancellations or skipped tests. All 211 payment tests, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. Source fingerprints confirm that only `EcashModal.tsx` and its one CSS rule changed among app sources; the npm lockfile is unchanged. The Impeccable scan has no primary findings and reports seven advisories on unchanged declarations: six existing typography overrides and one existing color override. No findings were suppressed. Existing Vite warnings remain assigned to H4a–H4e. No Rust code, dependencies, provider configuration or shared-picker implementation changed. These are isolated Chrome caller checks, not funded-provider, device IPC, physical-device or full accessibility verification. D7 remains pending.

### D5/D6 correction — Preserve selector appearance and animation

Completed on 2026-11-18 following the user's correction that cleanup must preserve UI/UX. The initial D5/D6 migrations omitted the custom selectors' animations and substituted shared default styling. Their settled screenshots and interaction checks did not detect that regression. Section 9 now explicitly requires preserving appearance, caller variants and animation timing during refactors; intentional UI/UX changes need separate user authorization.

[MintBalancePicker](cashu-app/src/components/shared/MintBalancePicker.tsx) now supports the three motion variants already present before migration: `none` for existing static callers, `items` for the ecash page's staggered rows, and `dropdown` for the legacy Bitcoin/ecash modals' animated menu and rows. It reuses the original, unchanged [App.css](cashu-app/src/App.css) keyframes: 240ms opening with `cubic-bezier(0.16, 1, 0.3, 1)`, 160ms closing with `cubic-bezier(0.32, 0.72, 0, 1)`, and 200ms row reveals staggered by 30ms. Animated callers retain the 300ms chevron transition. Selection/pointer dismissal keeps the menu mounted for the original closing interval, with timer cleanup on unmount. Escape still dismisses immediately and restores focus. Reduced motion removes spatial animation and the closing delay through selectors scoped to this picker.

The migrated callers also opt into `appearance="detailed"`, restoring their framed mint icons, original body typography, numeric weights, row separators, responsive trigger padding, menu shadow and 250px height cap. The default appearance and nonanimated behavior remain available for the existing Bitcoin page and other shared-picker callers. The feature changes are only those presentation props; selection callbacks, payment operations, locks and visibility conditions are unchanged.

Extended [the shared fixture](cashu-app/tests/browser/mintBalancePicker.fixture.tsx) and added [motion/presentation checks](cashu-app/tests/browser/mintBalancePickerMotion.test.mjs). The tests first demonstrated the missing variants, exit interval and styling. They now assert all three motion modes, exact durations/easing/stagger, chevron timing, original icon/type/border/height details, mounting during closing, reopening, immediate Escape, unchanged static dismissal and reduced motion. The [Bitcoin caller tests](cashu-app/tests/browser/bitcoinMintPicker.test.mjs) and [ecash caller tests](cashu-app/tests/browser/ecashMintPicker.test.mjs) additionally require their original variants at both tested widths and themes. `test:mint-picker` now includes the new checks.

Verification: all nine focused motion/presentation tests and all 94 tests in the final full browser run pass, with no failures, cancellations or skipped tests. All 211 payment tests, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. All eight default-picker screenshots are byte-identical to the pre-correction reference captures, covering both themes and the tested viewport sizes. Updated migrated-caller screenshots were captured, and the dark ecash page and light Bitcoin modal were visually reviewed. The original dropdown keyframe block is byte-for-byte unchanged. The detector reports no primary shared-picker findings; its aggregate scan has five pre-existing warnings in the Bitcoin view/shared stylesheet and 50 typography/color advisories, including the existing small fallback-icon labels. No findings were suppressed. Existing Vite warnings remain assigned to H4a–H4e. No dependencies, lockfiles, Rust code, font loading or provider configuration changed. D7 remains pending.

### Shared mint-selector clarification — One animated presentation on all payment pages

Completed on 2026-11-19. The user clarified that Mobile Money, Bitcoin and ecash pages should share the animated selector rather than preserving nonanimated/page-specific variants. [MintBalancePicker](cashu-app/src/components/shared/MintBalancePicker.tsx) now has one presentation and motion contract. Removed the `animation` and `appearance` props, their fallback variants and conditional class/height choices. All callers receive the framed icons, established typography, row separators, 250px menu cap, 240ms opening, 160ms pointer/selection closing, 200ms item reveal with 30ms stagger, and 300ms chevron transition. Escape still dismisses immediately; reduced motion disables spatial animation and the closing delay.

[BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) and [EcashModal](cashu-app/src/components/home/EcashModal.tsx) only lose their presentation overrides. The existing [Mobile Money form](cashu-app/src/features/momo/MomoPaymentForm.tsx) inherits the shared behavior without a source edit or opt-in. Feature selection callbacks, review transitions, payment submission, locking and visibility conditions are unchanged. The separate wallet-card selector and legacy Mobile Money view are outside this payment-page correction.

Added a focused [Mobile Money fixture](cashu-app/tests/browser/momoMintPicker.fixture.tsx) and [caller tests](cashu-app/tests/browser/momoMintPicker.test.mjs) using the real form, review calculation and cached synthetic mint metadata. Eight theme/viewport/direction cases first reproduced the missing animation on top-up and cashout; the existing review and submitting-action checks already passed. The fixture runs no wallet/provider requests and forbids payment confirmation. It verifies the form-level selector and review contract, not the full Mobile Money transaction controller.

Updated the [shared fixture](cashu-app/tests/browser/mintBalancePicker.fixture.tsx), [interaction checks](cashu-app/tests/browser/mintBalancePicker.test.mjs) and [motion checks](cashu-app/tests/browser/mintBalancePickerMotion.test.mjs) to require animation without configuration. [Bitcoin caller tests](cashu-app/tests/browser/bitcoinMintPicker.test.mjs) now explicitly cover the live page and legacy modal in both themes at 390px/1024px, as well as animation during send/receive selection. [Ecash caller tests](cashu-app/tests/browser/ecashMintPicker.test.mjs) require the same full menu animation for both render paths. Added `npm --prefix cashu-app run test:momo-mint-picker`.

Verification: all 32 focused shared-control/Mobile Money tests and the final full browser run of 106 tests across nine test files pass, with no failures, cancellations or skipped tests. All 211 payment tests, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. Captured the Mobile Money, Bitcoin and ecash selectors in both themes and viewport sizes; visually reviewed the dark Mobile Money cashout form, dark Bitcoin page and light desktop ecash page. Source comparisons confirm that the feature edits only remove presentation overrides, the Mobile Money form and payment logic are unchanged, and no stylesheet, lockfile or dependency changed. The detector reports four warnings on unchanged Bitcoin declarations and twelve advisories; no findings were suppressed. Existing Vite warnings remain assigned to H4a–H4e. No Rust code, native/device IPC or funded-provider operation was exercised. D7 remains pending.

### D7 — Shared primary-action primitive prepared without migrating callers

Completed on 2026-11-19. Compared the primary action in [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) and the conversion actions in [TransferFundsForm](cashu-app/src/components/home/TransferFundsForm.tsx). Their styles share full width, a 44px minimum height, 16px corners, amber/dark colors, 15px text and weight 600. Their padding, layout, hover, focus offset and short-screen rules differ, so those differences remain feature-owned. No existing button or feature was migrated in D7; D8/D9 remain separate tasks.

Added [PrimaryActionButton](cashu-app/src/components/shared/PrimaryActionButton.tsx). It requires an explicit native `type` and label content. Plain text supplies the accessible name; composed content requires `aria-label`. `loading` sets `aria-busy` and native `disabled`; clearing it preserves any independent caller `disabled` condition. Native attributes, events and refs are forwarded. The component renders children unchanged, with no injected spinner, label replacement, wrapper markup, payment state or submission logic. Its UI blocking does not replace the feature's payment/recovery guards.

The scoped [stylesheet](cashu-app/src/components/shared/PrimaryActionButton.css) extracts only the matching base declarations and disabled treatment. It is imported from [App.css](cashu-app/src/App.css) in the components layer; existing unlayered feature rules retain their spacing, hover and responsive behavior. The fixed colors intentionally match the existing actions in both themes. The default focus outline uses `on-surface`; existing feature focus rules can retain their current treatment. [DESIGN.md](cashu-app/DESIGN.md) records this contract. When removing conversion CSS in D9, preserve the effective 44px height/16px corners: its combined primary/secondary rule otherwise supplies 52px/26px before the primary override.

Added five [type-contract tests](cashu-app/tests/primaryActionButtonContracts.test.mjs), a focused [browser fixture](cashu-app/tests/browser/primaryActionButton.fixture.tsx), and [browser checks](cashu-app/tests/browser/primaryActionButton.test.mjs). The initial positive type contract failed before the component existed; final positive/negative cases enforce explicit type, required content, explicit naming for composed content, native attributes and boolean loading. The browser fixture renders the new component alongside the original native button patterns using their actual feature CSS, without importing payment services or submitting a payment.

All 26 focused browser checks pass. Twelve pattern/theme/viewport cases compare computed presentation against the native references at 390×844, 1024×844 and 390×480. They additionally freeze the original colors, corners, weight, font size, height and padding so a future change to both references cannot hide a regression. Other checks cover accessible names through Chrome's accessibility tree, disabled/loading activation, caller-owned labels/icons, button/submit/reset semantics, controlled loading and re-enabling, independent disabled state, native attributes, refs, keyboard focus, hover and the standalone base. Twelve screenshots were captured; the dark Mobile Money and short light conversion comparisons were visually reviewed. Added `npm --prefix cashu-app run test:primary-actions`.

Verification: all 216 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. The final complete browser run passed all 132 tests across ten test files with `node --test --test-concurrency=1 tests/browser/*.test.mjs`, with no failures, cancellations or skipped tests. Earlier concurrent runs hit existing Bitcoin/ecash fixture timeouts, including one Bitcoin timeout with concurrency limited to two; serial execution passed without changing timeouts or assertions. This remains a browser-fixture concurrency limitation rather than evidence of a diagnosed product defect. The new component's focused checks passed independently as well. The Impeccable scan reports no findings in the new component or stylesheet. Existing Vite warnings remain assigned to H4a–H4e.

Source fingerprints confirm that every pre-existing app source file and the npm lockfile is unchanged except for the one stylesheet import in `App.css`. No existing production element uses the new class yet. No dependencies, font loading, native commands, Rust code or payment behavior changed; no funded-provider or device IPC journey was performed. D8 and D9 remain pending.

### D8 — Mobile Money primary action uses the shared primitive

Completed on 2026-11-19. Replaced the single primary action in [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx), which serves both top-up and cashout entry/review states, with `PrimaryActionButton`. It keeps `type="button"`, the same `actionLabel`, the same `review ? onConfirm : onReview` callback selection and the same feature class. `loading={submitting}` plus `disabled={!valid}` preserves the original `submitting || !valid` guard. Rate fetching remains a feature-owned label state; a valid form is not newly blocked merely because `loadingRate` is true. Submitting now also exposes the shared `aria-busy` state. No spinner or new label was introduced.

Removed the duplicate common base declarations and disabled treatment from [MomoPages.css](cashu-app/src/features/momo/MomoPages.css). The shared stylesheet now supplies those values. Mobile Money keeps its padding, focus styling and short-screen overrides, including the 36px minimum height and 13px text. [DESIGN.md](cashu-app/DESIGN.md) reflects the migration. The shared button implementation and all conversion code remain unchanged; D9 is pending.

Extended [the existing Mobile Money fixture](cashu-app/tests/browser/momoMintPicker.fixture.tsx) with review/confirmation counters and an emulated parent submitting flag. These callbacks are synthetic and import no payment provider. Added [primary-action caller checks](cashu-app/tests/browser/momoPrimaryAction.test.mjs) for both directions: entry → review → confirming, correct callback counts, keyboard activation, blocked repeated confirmation once submitting, invalid forms, rate-loading labels/guards and the shared busy state. The initial run passed the 22 existing-behavior cases and failed the new busy-state case before migration; all 24 tests now pass, including the parent test. The native reference in [the shared-button fixture](cashu-app/tests/browser/primaryActionButton.fixture.tsx) now freezes the original Mobile Money CSS so deleting production duplication cannot silently alter both sides of the comparison. Added `npm --prefix cashu-app run test:momo-primary`.

Verification: all 61 relevant browser tests pass when run sequentially: 24 Mobile Money action checks, eleven existing mint-selector checks and 26 shared-button checks. All 36 before/after screenshots are byte-identical, covering both directions, both themes, 390×844/1024×844/390×480 and entry/review/confirming states. Visually reviewed the short light cashout review and dark desktop top-up confirming state. All 216 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and `git diff --check` pass. Unrelated browser fixtures and Rust suites were not rerun for this scoped frontend migration; D7 records the most recent complete browser run.

Normalizing the tag/import and guard-factorization changes reproduces the pre-D8 form source exactly. Source fingerprints confirm that only the form and its CSS changed among app sources; the Mobile Money controller, review calculations, shared primitives, conversion code, lockfile and dependencies are unchanged. The Impeccable scan reports twelve advisories, all on unchanged declarations, with no primary findings or suppressed checks. Existing Vite warnings remain assigned to H4a–H4e. The fixture verifies UI/callback blocking, not funded-provider execution or the controller's native payment/recovery guarantees. D9 remains pending.

### Ecash field fix — before D9

Completed on 2026-11-19 in response to the supplied Receive ecash screenshot. The description and public-key inputs combined a local focus border/ring with an offset page-level outline, producing doubled, clipped strokes. The token textarea had a separate wrapper focus treatment. All three now use [EcashFields.css](cashu-app/src/components/home/EcashFields.css), with one 2px inset outline per field and semantic surface/text/border colors. Placeholders are opaque and readable in both themes. The token wrapper owns its textarea/toolbar focus; button focus styling is preserved. Both [EcashModal](cashu-app/src/components/home/EcashModal.tsx) and [EcashReceiveInvoice](cashu-app/src/components/home/EcashReceiveInvoice.tsx) import the stylesheet so the standalone invoice also receives the fix. [SendEcashPage.css](cashu-app/src/components/home/SendEcashPage.css) no longer adds a second input outline.

Extended the existing [ecash fixture](cashu-app/tests/browser/ecashMintPicker.fixture.tsx) with an invalid-token state and added [field regression checks](cashu-app/tests/browser/ecashMintPicker.test.mjs). The baseline run failed the twelve new field-presentation cases before the fix. All 35 ecash browser checks now pass: keyboard focus across three fields, two themes and mobile/desktop widths; one inset stroke with no shadow ring; unchanged field bounds on focus; placeholder contrast of at least 4.5:1 and focus contrast of at least 3:1; description typing/160-character limit; public-key normalization; token editing/clearing; and existing picker behavior. Twelve screenshots were captured before and after; the dark and light mobile description fields were visually reviewed. These checks use synthetic wallet boundaries and perform no payment operations.

All 216 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. Normalizing class strings and the stylesheet imports reproduces the two component sources before this fix; handlers, limits, labels, spacing and typography are unchanged. The page CSS change only narrows its focus selector to buttons. Other app sources and the lockfile are unchanged. The Impeccable scan reports eight advisories on unchanged declarations, with no primary findings or suppressed checks. Existing Vite warnings remain assigned to H4a–H4e. No Rust, dependency or financial logic changed. D9 remains pending.

### Scan field focus fix — before D9

Completed on 2026-11-19. Removed textareas from the page-level focus-outline selector in [Scan.css](cashu-app/src/pages/Scan.css). The paste field's rounded container already supplies its focus indicator; the global rule overrode the textarea's `focus:outline-none` and added the unwanted inner rectangle. Button/input focus outlines and the container's existing presentation are unchanged. The scan redemption textarea also retains its wrapper-owned focus styling. No component, handler, validation, spacing or color changed.

An isolated local Chrome check mounted the actual `ScanNoteForm` with synthetic clipboard/decoder/address-book boundaries. Before the fix, all six theme/viewport cases reproduced the inner outline. Afterward, all six pass at 390×844, 1024×844 and 390×480 in dark/light themes: keyboard focus has no inner outline or shadow, the outer highlight remains, bounds do not change, and typing, Process callbacks, clearing, trimmed paste and toolbar keyboard focus work. Visually reviewed the focused dark mobile field. The check and screenshots remain temporary artifacts outside the repository. The TypeScript/production build and whitespace checks pass. The design scan reports only two advisories on unchanged font sizes; existing Vite warnings remain assigned to H4a–H4e. D9 remains pending.

### D9 — Conversion primary action uses the shared primitive

Completed on 2026-11-19. Migrated the primary action family in [TransferFundsForm](cashu-app/src/components/home/TransferFundsForm.tsx) to `PrimaryActionButton`: entry review, transfer/return confirmation, progress/continuation and completion. Migrating all four states allows the common style to be removed without leaving a native button dependent on it. Each action has an explicit `type="button"`; composed content has a matching accessible label. Named label values remain in the feature, alongside the original icons and callbacks. `loading` supplies the original busy/refreshing/checking guard and exposes `aria-busy`; independent expiry, quote-error, balance, mint and cooldown guards remain intact. Completion retains its original enabled state. The route renders no enclosing native form.

[TransferFundsForm.css](cashu-app/src/components/home/TransferFundsForm.css) now keeps conversion layout, icon gap, padding, hover/focus and short-screen overrides. The shared primitive supplies the common base. Declarations that belonged to the secondary button moved into its own rule, preserving its 52px minimum height and 26px corners; the primary stays 44px/16px, or 32px minimum height on short screens. The native conversion reference in [the shared-button fixture](cashu-app/tests/browser/primaryActionButton.fixture.tsx) freezes the original styles so removing production duplication cannot silently change both sides of a comparison. [DESIGN.md](cashu-app/DESIGN.md) records these boundaries. Added `npm --prefix cashu-app run test:conversion-primary` in [package.json](cashu-app/package.json).

Added [synthetic conversion boundaries](cashu-app/tests/browser/conversionPrimaryAction.boundaries.ts), [a fixture mounting the actual form](cashu-app/tests/browser/conversionPrimaryAction.fixture.tsx), and [caller checks](cashu-app/tests/browser/conversionPrimaryAction.test.mjs). The initial baseline passed 31 existing-behavior checks and failed the new explicit-type/shared-busy contract check. The final conversion run passes all 34 checks, including both directions, dark/light themes, 390×844/1024×844/390×480, review through completion, repeated activation, missing/insufficient inputs, limits, expiry, refresh failures, cooldown, returning funds, progress, edit/cancel, accessible loading labels, keyboard focus and secondary styling. The existing disclosure remains before the action in Tab order. An isolated bundle with the expiry guard inverted fails the expiry case; production files were never mutated. These fixtures fake provider/native services, review-refresh state and the success overlay; they establish UI behavior rather than funded execution or recovery guarantees.

Verification: 34 final conversion checks plus 50 shared-button/Mobile Money checks pass, as do all 216 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks. Before/after captures cover both directions, themes and three viewport sizes; visually reviewed the dark entry, dark desktop confirming state and short light review. Raw captures contain timing-dependent hover/spinner pixels, so no pixel-identity claim is made. Additional optional settled-capture replays timed out in the temporary browser fixture; normal interaction runs pass without changing timeout limits or behavior assertions. The conversion receipt's pre-existing light-theme contrast remains for H5/H6 to address separately.

AST comparisons confirm every click handler is identical and the rest of the form is unchanged after excluding the four migrated actions, their labels and import. Source fingerprints confirm only the conversion form and its CSS changed among existing app sources; the lockfile, shared primitive, payment calculations/services, native code and dependencies are unchanged. The design scan reports 25 advisories on existing values/declarations, including values moved into the secondary rule, with no primary findings or suppressed checks. Existing Vite warnings remain assigned to H4a–H4e. D10 remains pending.

### D10 — Shared icon-only button

Completed on 2026-11-19. Compared the identical address-book styles in [ScanNoteForm](cashu-app/src/components/scan/ScanNoteForm.tsx) and [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx), plus the identical copy styles in [MintInfoModal](cashu-app/src/components/home/MintInfoModal.tsx) and [TransactionDetailsModal](cashu-app/src/components/history/TransactionDetailsModal.tsx). These compact controls share icon alignment and interaction needs; their sizes, colors, padding, corners, hover effects and feedback remain caller-owned. No existing caller was migrated in D10.

Added [IconButton](cashu-app/src/components/shared/IconButton.tsx), requiring an explicit native button type, an `aria-label` and one icon element. It forwards native attributes, events and refs without wrapping the icon or adding tooltip, copy, contact, loading or payment logic. Its scoped [stylesheet](cashu-app/src/components/shared/IconButton.css), imported in [App.css](cashu-app/src/App.css), centers the icon, provides native disabled styling and a 2px semantic keyboard-focus outline with a 3px offset. The components layer permits deliberate caller styling; migrations should remove redundant `cursor-pointer` utilities so they do not override its disabled cursor. [DESIGN.md](cashu-app/DESIGN.md) documents the contract. Text-and-icon buttons are outside this primitive.

Added five [type-contract checks](cashu-app/tests/iconButtonContracts.test.mjs) and an isolated [browser fixture](cashu-app/tests/browser/iconButton.fixture.tsx) with [23 browser checks](cashu-app/tests/browser/iconButton.test.mjs). The type checks initially failed while the component was absent and now all pass. Twelve pattern/theme/viewport cases compare the new control with frozen native styles at 390×844, 1024×844 and 390×480, including actual dimensions, padding, radius, colors, border, shadow and hover. The dimensions correctly retain the app's existing 17px root sizing. Other checks cover accessible names, caller-controlled feedback icons/tooltips, disabled pointer/keyboard activation and Tab order, re-enabling, repeated-click blocking, native button/submit/reset behavior, refs/attributes and contrasting keyboard focus in both themes. Twelve screenshots were captured; the dark mobile address-book and short light copy comparisons were visually reviewed. An isolated bundle that drops native disabling fails both disabled cases and the repeated-click case; production files were never mutated. The fixture performs no clipboard, address-book or payment operation.

Added `npm --prefix cashu-app run test:icon-buttons` in [package.json](cashu-app/package.json), running the type and browser checks serially after building. All 23 browser checks and 221 frontend/payment/type checks pass, as do the TypeScript/production build, both release checks, documentation links and whitespace checks. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm every existing app source and the npm lockfile is unchanged except for the one stylesheet import; the package change is exactly one test script. No dependencies, native code or existing UI/UX changed. Unrelated browser/Rust suites were not rerun for this scoped, not-yet-used primitive. D11 remains pending.

### D11 — Address-book and copy caller migrations

Completed on 2026-11-19 in two verified slices. First migrated the address-book controls in [ScanNoteForm](cashu-app/src/components/scan/ScanNoteForm.tsx) and [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx); all 16 focused checks passed before starting the copy migration. Then migrated the URL copy in [MintInfoModal](cashu-app/src/components/home/MintInfoModal.tsx) and five copy controls in [TransactionDetailsModal](cashu-app/src/components/history/TransactionDetailsModal.tsx): transaction/request ID, token, quote/invoice, Bitcoin TxID and address. Eight controls now use `IconButton`. Text-and-icon copy actions, external links, QR launchers and other icon designs remain separate callers to assess on their own merits.

Removed redundant cursor utilities and address-book centering utilities; kept all feature colors, dimensions, padding, corners, hover effects and transitions. Each migrated control has an explicit native button type and accessible name, with decorative SVGs hidden from the accessibility tree. The quote copy action's accessible name identifies invoice versus quote ID; its existing `Copy` tooltip is unchanged. Scan/Bitcoin keep their page-owned amber focus styling, while modal copy controls use the shared semantic focus default. The handlers, exact copy payloads, toasts, checkmark state and two-second reset timers are unchanged. [DESIGN.md](cashu-app/DESIGN.md) records the migrated ownership.

Added [synthetic boundaries](cashu-app/tests/browser/iconButtonCallers.boundaries.ts), [a fixture mounting the actual callers](cashu-app/tests/browser/iconButtonCallers.fixture.tsx) and [caller checks](cashu-app/tests/browser/iconButtonCallers.test.mjs). The address-book picker, contact filtering/selection, shared button and bottom-sheet hooks remain real; contacts, wallet/provider data, clipboard writes, toasts, UR encoding and the unrelated invoice subview are synthetic. The baseline passed 38 existing-behavior checks and failed the two new shared-button contract cases and their parents. The final serial run passes all 64 caller/shared-button checks with no failures, cancellations or skips. It covers both themes at 390×844, 1024×844 and 390×480; keyboard/pointer contact selection and phone filtering; every migrated copy payload/label/toast branch; retained feedback/reset timing; thrown clipboard failures; and no unintended submission or modal dismissal. Contract assertions run within their existing payload cases rather than repeating page reloads. An earlier focused copy run timed out in the redundant reload loop; the final run retains the original timeout limits and behavior coverage. An isolated bundle that inverts the Scan address-book callback fails its pointer and keyboard cases; production files were never mutated. Added `npm --prefix cashu-app run test:icon-button-callers` in [package.json](cashu-app/package.json).

All 24 before/after control-presentation measurements match, including position, size, colors, border, shadow, padding, typography and transition duration. Seven of eight captured screenshots are byte-identical; the remaining transaction capture contains an existing animated QR glow, so no complete pixel-identity claim is made. Visually reviewed the light Bitcoin page and dark transaction detail. All 221 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. AST comparisons confirm every click handler and all code outside the eight migrated elements/imports are identical. Source fingerprints confirm only the four caller files changed among app sources; shared primitives, CSS, services, stores, native code, lockfile and dependencies are unchanged. The design scan reports six warnings and nineteen advisories, all on unchanged lines; none were suppressed. Existing Vite warnings remain assigned to H4a–H4e. Unrelated browser/Rust suites were not rerun for this scoped UI migration. D12 remains pending.

Existing clipboard limitation, preserved and tested: these handlers treat a resolved `false` from `writeClipboardText` as success; only a thrown failure triggers their error feedback. A separate fix should check the boolean before reporting success and update the false-result regressions. This migration does not change that behavior or claim native clipboard reliability.

### D12 — Shared field label and message composition

Completed on 2026-11-19. Compared the label/control stacks in [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) and [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx). The phone field groups an input with an address-book action; the destination field groups a textarea with a toolbar. Both can share label/message association and vertical structure while preserving their own controls, spacing and appearance. No existing feature field was migrated; D13/D14 remain separate tasks.

Added [FormField](cashu-app/src/components/shared/FormField.tsx) with a required visible label and render callback. React `useId` supplies stable, unique control IDs by default; an optional explicit ID preserves a caller's existing identifier. The callback receives `id`, `aria-describedby` and `aria-invalid` to spread onto the primary input/textarea. Mounted hint/error nodes use that control's ID namespace. External descriptions remain first and duplicate references are removed. Null, empty and omitted messages produce no nodes or dangling references; errors mark the control invalid and render an alert. The input remains caller-owned, including its value, native attributes, events, ref and adjacent actions. No control cloning, payment validation, input normalization or automatic sibling disabling was added. Callers retain responsibility for unique explicit IDs and field-specific error content.

The scoped [stylesheet](cashu-app/src/components/shared/FormField.css), imported in [App.css](cashu-app/src/App.css), supplies vertical stacking, block labels and semantic hint/error colors. It sets no input skin, spacing, typography or focus treatment. Root/label/hint/error class props preserve the two features' presentation. [DESIGN.md](cashu-app/DESIGN.md) documents ownership, ID namespaces, message behavior and a usage example. Added `npm --prefix cashu-app run test:form-fields` in [package.json](cashu-app/package.json), running type and browser checks serially after building.

Added six [type-contract checks](cashu-app/tests/formFieldContracts.test.mjs), a [browser fixture](cashu-app/tests/browser/formField.fixture.tsx) with frozen native layout references and [25 browser checks](cashu-app/tests/browser/formField.test.mjs). The type checks failed before implementation; a further failing case established nullable-message compatibility with the existing callers before the contract was extended. All six now pass within the 227-check frontend suite. Browser checks compare both layouts in dark/light themes at 390×844, 1024×844 and 390×480; all twelve field comparisons match their native references. Other checks cover repeated labels with distinct control/hint/error IDs, native accessible names/descriptions, label-click focus, null/empty messages, external-description deduplication, invalid/error-alert state, dynamic message removal, stable IDs across updates/keyed reordering, controlled input/textarea events, refs/native attributes, independent action buttons, disabled inputs and long-message wrapping. Hint/error colors meet 4.5:1 contrast in the tested themes. Six screenshots were captured; the dark mobile and light desktop comparisons were visually reviewed. An isolated bundle with the invalid-state condition inverted fails the validity cases; production files were never mutated.

Verification: all 25 browser checks and 227 frontend/payment/type checks pass, along with the TypeScript/production build, both release checks, documentation links and whitespace checks. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm every pre-existing app source and the npm lockfile is unchanged except for the one scoped stylesheet import; the package change is exactly one test script. Shared primitives, feature workflows, native code, dependencies and existing UI/UX are unchanged. Unrelated browser/Rust suites were not rerun for this new, not-yet-used field primitive. D13 and D14 remain pending.

### D13 — Mobile Money phone field uses FormField

Completed on 2026-11-19. Replaced the manual phone-field wrapper and label in [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) with `FormField` for both top-up and cashout. It keeps `momo-page-phone`, the same conditional label, telephone/autofill attributes, placeholder, controlled value, digit filtering, ten-digit limit, Enter-to-blur and address-book callback. The grouped input/button markup and all feature classes remain. The feature-owned address-book button retains its existing size and styling; the shared field supplies the label association and native control bindings.

Entry validation stays in the same `aria-live="polite"` element, with the same `validation || error` priority and rate-retry action. Review feedback keeps its existing alert. These messages combine phone, amount, rate and payment failures, so they are not passed wholesale to the phone field's `error` prop or announced twice. The parent controller, validation rules, review/confirmation logic, shared primitives and all CSS are unchanged. [DESIGN.md](cashu-app/DESIGN.md) records this ownership.

Extended [the existing Mobile Money fixture](cashu-app/tests/browser/momoMintPicker.fixture.tsx) with synthetic feedback setters/counters and a real address-book picker backed by isolated fixture contacts. Added [22 phone-field checks](cashu-app/tests/browser/momoPhoneField.test.mjs). The baseline passed 20 existing-behavior cases and failed the new shared-field contract case and its parent. All 22 now pass, covering both directions/themes at 390×844, 1024×844 and 390×480; native metadata/labels; pointer and keyboard focus; digit filtering/truncation/blur; contact filtering/selection and its review value; entry feedback priority/live-region identity; and the review alert. Twelve before/after presentation records match exactly, including field, label, input, address button, amount and primary-action measurements. All twelve screenshot pairs are byte-identical; visually reviewed the short light cashout and dark desktop top-up states. An isolated bundle that changes the input limit to nine digits fails both typing cases; production files were never mutated. The fixture simulates the parent's callbacks and message updates and does not execute payments or prove the controller's provider/recovery guarantees.

Added `npm --prefix cashu-app run test:momo-phone-field` in [package.json](cashu-app/package.json). Verification: all 82 relevant browser checks pass serially—22 phone-field, eleven existing Mobile Money mint-picker, 24 primary-action and 25 shared-field checks—with no failures, cancellations or skips. All 227 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. AST comparisons confirm all click/change/keyboard handlers and all code outside the phone field/import are identical. Source fingerprints confirm only `MomoPaymentForm.tsx` changed among app sources; the controller, services, CSS, shared controls, lockfile and dependencies are unchanged. Unrelated browser/Rust suites were not rerun for this scoped frontend migration. D14 remains pending.

### D14 — Bitcoin send destination uses FormField

Completed on 2026-11-19. Migrated the send-destination label and control shell in [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx), shared by the page and legacy compatibility branch, to `FormField`. The visible `Pay to:` paragraph becomes a native label associated with the textarea through a generated control ID. The textarea's controlled value, attributes, input handler, paste/clear toolbar, address-book/autocomplete actions and scanner callbacks are unchanged. Invoice amounts, balance errors, address detection and LNURL status remain in their feature-owned elements, with the same messages, border states and action guards. No validation policy or payment logic moved into the primitive.

Preserved the existing `gap-1.5` spacing and label styles. On short page layouts, [BitcoinPages.css](cashu-app/src/features/bitcoin/BitcoinPages.css) now uses `display: contents` on the field wrapper and assigns its label/control shell to the same grid cells previously occupied by the paragraph and shell. Those three scoped rules replace the two obsolete direct-child selectors; all other CSS is identical. The legacy layout retains the ordinary vertical stack. [DESIGN.md](cashu-app/DESIGN.md) records this ownership and layout adaptation.

Added [synthetic boundaries](cashu-app/tests/browser/bitcoinDestinationField.boundaries.ts), [a fixture mounting the real view](cashu-app/tests/browser/bitcoinDestinationField.fixture.tsx), and [38 field checks](cashu-app/tests/browser/bitcoinDestinationField.test.mjs). The baseline passed 36 existing-behavior cases and failed the new shared-field/associated-label case and its parent. The final field run passes all 38, including label-click focus in every viewport, toolbar Tab access, both page/legacy paths, dark/light themes and 390×844/1024×844/390×480 sizes. Other cases cover trimmed Lightning-address/on-chain paste, empty/failed clipboard reads, clearing, phone-contact filtering and Bitcoin-contact selection, scanner error/cancel/result callbacks, invalid input, LNURL checking/invalid/valid states, insufficient invoice balance and on-chain detection. No fixture payment submission or receive request occurs. The real picker, parser, status component and bottom-sheet hook are exercised; wallet/provider resolution, clipboard and camera data are synthetic. This does not verify hardware-camera capture, native clipboard access or funded execution.

All twelve before/after presentation records match, including label, textarea, control shell, toolbar, scan control and primary-action measurements. All twelve screenshot pairs are byte-identical; visually reviewed the short light page and dark legacy sheet. An isolated bundle that drops clipboard trimming fails the four nonempty paste cases; production files were never mutated. Added `npm --prefix cashu-app run test:bitcoin-destination-field` in [package.json](cashu-app/package.json).

Verification: all 83 relevant browser checks pass across the scoped serial runs—38 destination-field, twenty existing Bitcoin mint-picker/payment-path and 25 shared-field checks—with no failures, cancellations or skips. All 227 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. AST comparisons confirm identical click/change/scanner/selection handlers, identical control-shell content apart from the supplied control attributes, and identical code outside the field/import. Source fingerprints confirm only the Bitcoin view and its CSS changed among app sources; shared controls, services, stores, other features, native code, lockfile and dependencies are unchanged. The design detector reports four warnings and fifteen advisories, all on unchanged lines; none were suppressed. Existing Vite warnings remain assigned to H4a–H4e. Unrelated browser/Rust suites were not rerun for this scoped frontend migration. D15 remains pending.

### D15 — SafeQRCode fallback and payload recovery

Completed on 2026-11-19. Confirmed that [SafeQRCode](cashu-app/src/components/shared/SafeQRCode.tsx) stayed on its error fallback after a child render failure, even when given a new valid payload. The boundary now receives the payload and clears its error only after a previous failure and a payload change. Size/instruction changes alone do not retry the failed payload. Healthy updates keep the same SVG element; no payload-based remount was introduced. The public props, size defaults, styling, fallback messages, logging and caller-owned animations/copy actions are preserved.

Added [an isolated fixture](cashu-app/tests/browser/safeQRCode.fixture.tsx) and [focused browser tests](cashu-app/tests/browser/safeQRCode.test.mjs). Normal payloads use the installed QR encoder; only synthetic failure payloads throw deliberately. Before the fix, fourteen tests passed and three recovery cases plus the parent failed. All eighteen now pass, covering initial and later render failures, consecutive failures, unchanged-payload updates, guard-to-valid recovery, SVG identity/path updates, default/custom dimensions and copy instructions. Empty, oversized ASCII, multibyte and emoji values retain the existing guard; exactly 2,000-byte ASCII/emoji payloads reach the real encoder. The byte limit remains a conservative application policy, not a physical QR capacity guarantee. Corrected the old comment that incorrectly described every payload above that limit as an encoder overflow.

Fallback checks confirm the sibling copy action remains enabled and receives the exact current synthetic payload, including after a renderer exception. The fixture records that callback in state; it does not access the native clipboard, test funded operations or guarantee a caller's actual clipboard feedback. The existing empty-value fallback still says `Data too large for QR`; this task preserves that wording. [DESIGN.md](cashu-app/DESIGN.md) records the component/caller responsibilities. Added `npm --prefix cashu-app run test:safe-qr` in [package.json](cashu-app/package.json), building before the browser run.

Verification: all eighteen browser tests, 227 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. All eight before/after screenshots are byte-identical across dark/light themes at 390px and 1024px widths; visually reviewed the dark mobile and light desktop fallbacks. The design detector reports three advisories on unchanged font-size lines; none were suppressed. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm only `SafeQRCode.tsx` changed among pre-existing app sources; all caller files, CSS, services, native code, dependencies and the lockfile are unchanged. Unrelated browser/Rust suites were not rerun for this scoped boundary fix. D16 remains pending; no direct QR caller was migrated.

### D16 — Pending invoice uses SafeQRCode

Completed on 2026-11-19. Replaced the direct QR renderer in [InvoicePaymentPending](cashu-app/src/components/issue/InvoicePaymentPending.tsx) with `SafeQRCode`. This is a static invoice display with an existing full-text copy action, so it can use the shared wrapper without changing animated UR workflows. The invoice value is passed unchanged at the existing 200px size. Successful SVG markup, black/white colors, frame, spacing and surrounding controls are preserved. The caller now adopts the wrapper's conservative 2,000-byte guard and render-error recovery; oversized invoices remain available in full through the copy action.

The fallback instruction names `Copy Lightning Invoice`. Two selectors on the existing white frame style only a fallback `div` and its paragraphs, using an opaque theme surface and foreground. This avoids translucent, low-contrast fallback text over the white frame without affecting successful SVGs or other callers. The copy handler, copied-state timeout, status and cancel callbacks, loading guards, invoice amount, error and debug feedback are identical to the baseline. [DESIGN.md](cashu-app/DESIGN.md) records this ownership.

Added [synthetic clipboard/toast boundaries](cashu-app/tests/browser/invoiceQRCode.boundaries.ts), [a fixture mounting the real caller](cashu-app/tests/browser/invoiceQRCode.fixture.tsx), and [nineteen browser tests](cashu-app/tests/browser/invoiceQRCode.test.mjs). The corrected baseline passed fourteen existing-behavior cases and failed the four new fallback cases plus the parent. All nineteen now pass, including exact SVG comparison with the original direct encoder, SVG identity across payload updates, dark/light themes at 390×844, 1024×844 and 390×480, raw-text/button/keyboard copying, thrown clipboard errors, status/cancel/loading feedback, exactly 2,000-byte encoding, oversized/render-error fallback and payload recovery. QR colors retain 21:1 contrast; fallback text meets 4.5:1 in both themes. The existing resolved-`false` clipboard limitation remains covered and unchanged: this handler still reports success unless the clipboard function throws. The fixture uses synthetic, nonpayable payloads and callback counters; it does not verify native clipboard access, funded execution or physical scanning.

All six normal-state screenshot pairs are byte-identical. Four additional screenshots capture the new oversized/render-error fallbacks; visually reviewed the dark oversized state, light render-error state and short dark normal state. An isolated bundle with the QR size changed to 180px fails the size/output cases; production files were never mutated. Added `npm --prefix cashu-app run test:invoice-qr` in [package.json](cashu-app/package.json).

Verification: all 37 focused browser tests pass serially—nineteen caller and eighteen shared-wrapper tests—along with 227 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm only `InvoicePaymentPending.tsx` changed among pre-existing app sources; the shared wrapper, other QR callers, CSS, services, native code, dependencies and lockfile are unchanged. Unrelated browser/Rust suites were not rerun for this scoped frontend migration. D1–D16 are complete; E1 remains pending.

### E1 — Shared payment page layout

Completed on 2026-11-19. Compared the existing Mobile Money and Bitcoin page shells, which share bounded height, centered responsive widths, a non-scrolling `PageHeader` and space for actions. Added [PaymentPageLayout](cashu-app/src/components/shared/PaymentPageLayout.tsx) with header, body (`children`) and optional footer slots. Its only import supplies React types. Native `main` attributes and root/body class names support composition without workflow flags, payment callbacks, routing, stores or provider dependencies. No feature page was migrated; E2/E3 remain separate tasks.

The [scoped stylesheet](cashu-app/src/components/shared/PaymentPageLayout.css), imported once in [App.css](cashu-app/src/App.css), centralizes the matching 480px mobile / 600px desktop shell widths, padding and body scrolling. The root fills its bounded parent below navigation rather than adding a second viewport height. Header/footer wrappers do not shrink; the body can shrink and scroll independently, with overscroll containment, a required accessible name, keyboard focus and an inset focus outline. Side/bottom safe-area padding stays within the page; `TopNav` retains ownership of the top inset. Feature content still owns spacing, keypad sizing, action state and form submission. [DESIGN.md](cashu-app/DESIGN.md) records these responsibilities, the `PageHeader sticky={false}` requirement, bounded-height assumptions and an external footer button's native `form` association.

Added four [type-contract checks](cashu-app/tests/paymentPageLayoutContracts.test.mjs), [a synthetic fixture](cashu-app/tests/browser/paymentPageLayout.fixture.tsx) and [nineteen browser tests](cashu-app/tests/browser/paymentPageLayout.test.mjs). All four type checks failed before the primitive existed and now pass. Browser coverage includes dark/light themes at 320×568, 390×844, 1024×844 and 390×480; body-only wheel/PageDown scrolling; stationary header/footer; native Tab order and input visibility; accessibility-tree names for the main/scroll regions; exact viewport bounds; external form submission/back callbacks; caller-controlled disabled/loading states; dynamic errors/footer removal; empty content; retained input state/focus during viewport resizing; and portrait/landscape safe-area insets. Insets use Chrome's documented [safe-area override](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setSafeAreaInsetsOverride), with no replacement of production CSS values. Ten screenshots were captured; visually reviewed the short dark phone, light desktop and light landscape safe-area states. An isolated bundle removing the body's Tab stop fails keyboard-access cases; production files were never mutated.

Verification: `test:payment-page-layout` in [package.json](cashu-app/package.json) builds and runs all 23 focused type/browser checks serially; all pass. The expanded frontend/payment/type suite passes all 231 checks. The TypeScript/production build, both release checks, documentation links and whitespace checks pass. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm every pre-existing app source and the lockfile is unchanged except for the one scoped CSS import; the package change is exactly one test script. All feature workflows, existing controls, native code and dependencies are unchanged. Unrelated browser/Rust suites were not rerun for this unused layout primitive.

Limitations: the fixture uses a synthetic navigation shell and native form callbacks, not payment execution. Viewport resizing verifies CSS behavior, not a physical operating-system keyboard or WebView. Callers must supply a bounded parent and header/footer content that can fit that height; the layout does not compact arbitrary keypad content or manage keyboard-overlay geometry. Those feature/device checks belong to E2/E3. E2 remains pending.

### E2 — Mobile Money full-page view uses PaymentPageLayout

Completed on 2026-11-19. Migrated the full-page branch of [MomoTransferView](cashu-app/src/features/momo/MomoTransferView.tsx), shared by top-up and cashout, to `PaymentPageLayout`. The existing `PageHeader` now occupies the header slot, outside the named `Mobile Money transfer` body. Existing entry/review and progress content stays in that body. `MomoPaymentForm` continues to reserve its own keypad/actions and use its existing short-screen grid; review/progress keep their scroll regions. The optional shared footer is unused for this migration, avoiding an early entry/review split ahead of E7/E8. The legacy branch still supplies the same portal/backdrop and content, with unchanged tabs, drag/dismissal hook and handlers.

[MomoPages.css](cashu-app/src/features/momo/MomoPages.css) makes the feature body a column flex container with outer overflow hidden, preserving full control widths and internal action placement. The two old root-sizing selectors now exclude `.payment-page-layout`, so the migrated view uses shared widths/padding/safe areas while the no-mint route and standalone form fixtures retain their existing shell. All other feature declarations are identical. [DESIGN.md](cashu-app/DESIGN.md) records this ownership and compatibility scope. Controller code above the shell is byte-identical after removing the new import; AST comparisons confirm identical JSX event handlers apart from the legacy overlay's equivalent direct `handleClose` binding.

Added [synthetic wallet/transaction/provider boundaries](cashu-app/tests/browser/momoPageLayout.boundaries.ts), [a fixture mounting the real view](cashu-app/tests/browser/momoPageLayout.fixture.tsx) and [25 browser tests](cashu-app/tests/browser/momoPageLayout.test.mjs). A frozen original-view bundle passes 22 tests and fails the new safe-area and shared-header cases plus the parent; the migrated view passes all 25. Coverage includes both directions/themes at 390×844, 1024×844 and 390×480; entry/review/back state; real keypad and contact selection; animated mint dropdown selection; confirmation/back guards; saved-transfer resume into progress; long review feedback scrolling beneath a stationary header/action; legacy tab switching and close-button dismissal; and portrait safe-area padding. Viewport shrinking to 420px and 360px with the phone field focused preserves its value/focus and keeps the field, keypad and action within bounds. This models the existing production `interactive-widget=resizes-content` policy; it does not verify a physical keyboard or WebView. Provider submission is a recorded, never-settling synthetic promise, and transaction persistence/resume is simulated; no funded transfer is executed or durability guarantee inferred.

All 24 before/after presentation records match exactly, covering header, phone, mint, amount, keypad, review and action geometry/styles. The corresponding screenshots are not byte-identical: the unchanged decorative texture now follows the body sheet's containing box after moving the header out; the maximum RGB-channel difference across all 24 pairs is two levels out of 255. Visually reviewed the dark top-up entry, short light cashout entry and light desktop review. Existing light-theme contrast limitations remain tracked under H6. An isolated bundle forcing the body back to a row fails the form-width cases; production files were never mutated. Added `npm --prefix cashu-app run test:momo-page-layout` in [package.json](cashu-app/package.json).

Verification: all 101 relevant browser tests pass serially across the scoped runs—25 page-layout, eleven mint-picker, 24 primary-action, 22 phone-field and nineteen shared-layout tests. All 231 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. The design detector reports sixteen advisories on existing color/font values; none were suppressed. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm only the Mobile Money view and its stylesheet changed among pre-existing app sources; the shared layout, form component, other features, services, stores, native code, dependencies and lockfile are unchanged. Unrelated browser/Rust suites were not rerun for this scoped frontend migration. E3 remains pending.

### E2 follow-up — Unclipped phone-field focus outline

Fixed the reported left-edge clipping on 2026-11-19. The page-wide focus rule placed a 2px outline 3px outside the phone input. Because that input begins at the body's left edge, the body's intentional overflow clipping removed the outline's left stroke. [MomoPages.css](cashu-app/src/features/momo/MomoPages.css) now overrides only that input's outline offset to `-2px`, keeping the existing amber stroke inside its bounds. Field dimensions, spacing, border radius, input behavior, button focus and page overflow are unchanged.

Extended the twelve entry/theme/viewport cases in [the page browser checks](cashu-app/tests/browser/momoPageLayout.test.mjs) to focus the phone input and verify that its full outline fits within every clipping ancestor while remaining visibly drawn. All twelve regressions fail with the original offset and pass with the fix. Reviewed the focused dark cashout capture, confirming the complete rounded left edge. All 47 relevant browser checks pass: 25 page-layout and 22 existing phone-field checks. [DESIGN.md](cashu-app/DESIGN.md) records the field-specific rule. Build, both release checks, documentation links and whitespace checks pass; the design scan reports twelve advisories on existing color/font values, with no suppressions. The only app source change is the two-line stylesheet addition; no payment code or shared component changed. E3 remains pending.

### E3 — Bitcoin forms and setup use PaymentPageLayout

Completed on 2026-11-19. Migrated the page branch of [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) and both no-mint states in [the Bitcoin routes](cashu-app/src/pages/Bitcoin.tsx) to `PaymentPageLayout`. The existing `PageHeader` occupies the shared header slot. The feature body remains a column flex container with outer overflow hidden, retaining Bitcoin's entry/keypad grids and scrollable `.bitcoin-body`. The existing on-chain confirm action and its `bitcoin-actions` wrapper occupy the shared footer, preserving its position, focus outline and shadow outside body clipping. The legacy compatibility branch keeps its original portal/backdrop, header/tabs and dismissal behavior.

Removed duplicated outer width, height, padding and desktop sizing rules from [BitcoinPages.css](cashu-app/src/features/bitcoin/BitcoinPages.css), since all Bitcoin page roots now use the shared shell. Other feature declarations are identical. The no-mint views retain their messages, centered `Manage mints` link and wallet-back destination. The route's preferred-mint, initial invoice/amount and close/navigation expressions are unchanged. Controller code above the shell is byte-identical after removing the new import; AST comparisons confirm identical event handlers in the view and routes, apart from the equivalent direct legacy-backdrop binding. [DESIGN.md](cashu-app/DESIGN.md) records the layout ownership. Receive/send workflow extraction remains E10–E14.

Added [synthetic boundaries](cashu-app/tests/browser/bitcoinPageLayout.boundaries.ts), [a fixture mounting the actual route exports](cashu-app/tests/browser/bitcoinPageLayout.fixture.tsx) and [41 browser checks](cashu-app/tests/browser/bitcoinPageLayout.test.mjs), organized into serial form, route and receive groups with fresh Chrome profiles. Seven focused shared-header/safe-area cases failed before the migration (plus their parent) and pass afterward. Coverage includes send input, on-chain amount/review, receive entry and no-mint states in dark/light themes at phone/desktop/short viewport sizes; review scrolling at a reduced 360px height beneath a stationary header/confirm action; review back transitions; wallet fallback/history navigation; setup-link navigation; safe areas; animated mint selection; and synthetic Lightning/on-chain QR generation, exact copy payloads and return-to-entry actions. The history-availability flag, wallet, scanner, clipboard and providers are synthetic; routing uses MemoryRouter. Submissions remain forbidden. These checks do not prove funded execution, physical camera/clipboard access, native browser history or WebView/device behavior.

All 32 before/after presentation records match exactly. All eight no-mint screenshot pairs are byte-identical; the 24 form/review pairs differ by at most one RGB-channel level out of 255 as the existing decorative texture follows its new containing box. Visually reviewed the short dark destination page, short light on-chain review and dark setup view. Existing light-theme contrast limitations remain tracked under H6. An isolated bundle narrowing the body to 80% fails the width case; production files were never mutated. Added `npm --prefix cashu-app run test:bitcoin-page-layout` in [package.json](cashu-app/package.json).

Verification: all 118 relevant browser checks pass across the serial runs—41 new layout, twenty existing Bitcoin mint-picker/payment-path, 38 destination-field and nineteen shared-layout checks—with no skips, cancellations or failures. All 231 frontend/payment/type checks, the TypeScript/production build, both release checks, documentation links and whitespace checks pass. The design detector reports four warnings and fifteen advisories on existing values; none were suppressed. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm only the Bitcoin view, its stylesheet and its route file changed among pre-existing app sources; the shared layout, Mobile Money focus fix, other controls/features, services, stores, native code, dependencies and lockfile are unchanged. Unrelated browser/Rust suites were not rerun for this scoped frontend migration. E4 remains pending.

### E4 — Bottom-sheet callers and dismissal inventory

Completed on 2026-11-19. Added [BOTTOM_SHEET_INVENTORY.md](cashu-app/BOTTOM_SHEET_INVENTORY.md), tracing all ten component consumers of `useBottomSheet` to their application render/import paths: seven ordinary dialogs, two payment views whose legacy branches redirect, and Mobile Money's active page/unmounted modal-wrapper distinction. The inventory records backdrop, close, drag, Escape, busy guards, focus/naming behavior and close side effects. It also distinguishes custom dropdowns, nested contact dialogs, maintenance UI, QR dialogs, loading/result overlays, scanners, reset pages and unmounted modal definitions. No caller was migrated or removed.

Key findings: the hook supplies animation/gestures/scroll locking, not dialog semantics or keyboard focus. Async state does not consistently block dismissal: PendingNwcModal remains dismissible while processing, and CleanWalletModal retains a Minimize action while guarding its backdrop/footer. Mobile Money's raw drag callback bypasses its explicit close cleanup. TransactionDetailsModal's existing focus/name behavior must be preserved; nested Escape ownership and sheet reduced-motion coverage remain gaps for E5. Result-overlay Done navigation, result Escape dismissal, pending behavior and optional background action are documented separately.

Recorded E5 constraints and proposed ActionMenuModal for E6 because its two live Send/Receive menus have no owned async submission state. The inventory preserves callback-before-close ordering and existing motion/appearance requirements. [DESIGN.md](cashu-app/DESIGN.md) links this ownership reference. Documentation links, whitespace, hook-consumer coverage and runtime/source/test/package fingerprints are checked. This is a static source audit: browser, build and payment suites were not newly run for documentation-only changes, and no runtime guarantee is inferred from source inspection. E5 and E6 remain pending.

### E5 — Shared bottom-sheet shell

Completed on 2026-11-19. Added [BottomSheet](cashu-app/src/components/shared/BottomSheet.tsx), its [dialog helper](cashu-app/src/components/shared/useBottomSheetDialog.ts) and [component stylesheet](cashu-app/src/components/shared/BottomSheet.css), imported by [App.css](cashu-app/src/App.css). The shell requires exactly one accessible name and owns portal/backdrop semantics, initial focus, dynamic Tab containment, connected-opener/explicit-target focus return and Escape. Callers supply content, skin, handle presentation, close controls and business cleanup. It wraps one unchanged `useBottomSheet` instance, retaining drag thresholds, scroll locking, entry/exit timing, first-following-interaction completion and cancellation on unmount.

One explicit `dismissible` policy guards backdrop, supplied close button, caller `close()`, drag and Escape. Owned nested sheets give focus/Escape only to the top, with lower panels inert and hidden from the accessibility tree. A separate `suspended` policy yields to foreign overlays without reactivating lower sheets. Such overlays still need their own focus, keyboard and pointer coverage; the shell does not automatically manage existing loaders, results, dropdowns or legacy dialogs. Reduced motion removes visual transitions for this shell while preserving hook lifecycle timing. Normal sheet motion and all existing callers remain unchanged.

Added [five type-contract tests](cashu-app/tests/bottomSheetContracts.test.mjs), a [synthetic shell fixture](cashu-app/tests/browser/bottomSheetShell.fixture.tsx), [27 browser tests including their four parent groups](cashu-app/tests/browser/bottomSheetShell.test.mjs), and `test:bottom-sheet-shell` in [package.json](cashu-app/package.json). Coverage includes both name sources and descriptions in Chrome's accessibility tree; explicit/default/empty focus; Tab/Shift+Tab, native radio keys and dynamic controls; editor-consumed Escape; every guarded close path; live policy changes; nested/suspended ownership and initial nested StrictMode mounts; explicit/missing-opener/navigation focus; mouse/touch dismissal, cancellation, first-press reopening and first-touch input focus; callback/scroll-lock cleanup; native wheel/touch content scrolling and 34px safe-area padding; dark/light 320×568, 390×480 and 1024×844 layouts; caller skin retention; text/action contrast; and reduced motion.

Verification: all five contract tests first failed while the module was absent and now pass. The final shell browser run passes all 27 checks, and the original hook suite passes all seven. A temporary bundle that disables Tab handling fails the empty-panel and boundary-wrap checks; production source is never mutated by that probe. The fixture explicitly brings Chrome to the foreground and asserts visibility after navigation, since hidden headless pages defer timers and entrance frames. Callback completion uses a bounded wait where needed without changing the hook's asserted 280ms exit transition. The full frontend/payment suite passes all 236 tests, TypeScript/production build passes, and both release checks pass. Local documentation links and `git diff --check` pass. The design detector reports one radius advisory: 28px mobile top corners intentionally preserve the existing sheet family and are now recorded in DESIGN.md; no detector rules were suppressed. Existing Vite warnings remain assigned to H4a–H4e.

[DESIGN.md](cashu-app/DESIGN.md#shared-shell-contract-e5) documents the shell API, ownership, lifecycle and caller styling responsibilities. [The inventory addendum](cashu-app/BOTTOM_SHEET_INVENTORY.md#e5-addendum-shared-shell-available-callers-unchanged) distinguishes the new shell from the ten unchanged original consumers. Before/after fingerprints confirm that no existing runtime/test/Rust/lockfile changed except the App.css import and package test command. No application caller was migrated; ActionMenuModal remains E6. These synthetic Chrome checks do not establish live-caller integration, screen-reader behavior or native-device behavior. No paid operations, provider credentials, native IPC or APK build were exercised.

### E6 — First live bottom-sheet migration

Completed on 2026-11-21. [ActionMenuModal](cashu-app/src/components/home/ActionMenuModal.tsx) now delegates its portal, backdrop, naming, focus and dismissal to BottomSheet. Its generated heading ID names the dialog; the X button receives the shell's native type/disabled behavior and a contextual `Close Send menu` / `Close Receive menu` label. The original handle/header drag targets, options and callback-before-close order remain. WalletBalanceCard's two live mounts and all seven route callbacks are unchanged. Initial focus, Tab containment, Escape, trigger return and reduced-motion handling now come from the shared shell; normal hook animation/cleanup remains intact.

Preserved all original skin/content classes. Added `max-h-none` to avoid introducing the shell's height cap, and passed the original `p-0 sm:p-4` backdrop utilities to preserve desktop padding: the application's 17px root font makes `sm:p-4` resolve to 17px, whereas the shell default is 16px. This intentionally preserves the original Send menu's top overflow at 390×480; short-screen content redesign is outside this migration. No other sheet, dropdown, payment workflow or shared primitive changed.

Added [synthetic external boundaries](cashu-app/tests/browser/actionMenu.boundaries.ts), a [fixture mounting the real menu and WalletBalanceCard](cashu-app/tests/browser/actionMenu.fixture.tsx), [caller checks](cashu-app/tests/browser/actionMenu.test.mjs), and `test:action-menu` in [package.json](cashu-app/package.json). The card, router, menu, shared shell, hook and mint presentation components remain real; wallet/currency/stable-balance/mint-info/native boundaries are synthetic. The initial fixture's numeric stable balance was corrected to the application's bigint contract before route verification; no application contract was weakened. Baseline cases demonstrate the previous missing dialog/focus labels and reduced-motion behavior. The existing seven destination paths, forwarded mint state and no-mint guarded callbacks pass before and after migration.

Verification: all 36 caller checks pass. All twelve original panel captures match byte-for-byte after migration, and recorded geometry/styles match for both menus in dark/light themes at 320×568, 390×480 and 1024×844. Committed assertions also retain measured geometry, colors, spacing, radii, borders, blur, normal transition and option order without requiring temporary capture files. Interaction checks cover naming in the accessibility tree, labelled close/initial focus, Tab containment, native keyboard card activation/Escape trigger return, backdrop/close/option dismissal, option completion before close request, touch/mouse header drag, first-press reopening, touch cancellation, scroll-lock cleanup, pending-callback cancellation and reduced motion. An isolated temporary bundle that requests close before the option callback causes the ordering check to fail; production source is never mutated by this probe.

The original hook/shared-shell regression run passes all 34 checks; all 236 frontend/payment tests and the TypeScript/production build pass. Both release checks, local documentation links and `git diff --check` pass. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints confirm that ActionMenuModal is the only pre-existing runtime file changed; WalletBalanceCard, the shared hook/shell, other callers, existing tests, Rust and lockfiles remain unchanged. [DESIGN.md](cashu-app/DESIGN.md#action-menus-e6) and [the inventory](cashu-app/BOTTOM_SHEET_INVENTORY.md#e6-addendum-actionmenumodal-migrated) record the integration and unchanged policies. These synthetic Chrome checks do not establish screen-reader/native-device behavior or funded provider execution. No APK was built. E7 remains pending.

### E7 — Mobile Money entry presentation

Completed on 2026-11-22. Added [MomoEntryForm](cashu-app/src/features/momo/MomoEntryForm.tsx) and its explicit entry-only prop contract. It renders the existing animated mint picker, phone/address-book controls, amount/Max, live feedback/rate retry and keypad. It receives controlled entry values/actions without review, submitting, confirmation, saved-transfer or provider-execution props. [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) extends that contract, forwards only individually named entry props and retains the existing review, primary action labels/guards and saved-transfer list. Its caller API remains compatible. E8/E9 remain pending.

The entry JSX is identical apart from indentation; review, action and saved-transfer JSX is byte-identical. The extracted component returns a fragment, keeping the four entry sections as direct children of the existing flex/short-screen grid. No CSS, shared primitive, transfer controller, review calculation or persistence logic changed. Existing digit filtering, ten-digit phone limit, Enter-to-blur, amount formatting, six-digit keypad guard, cashout Max, validation/error priority, contact selection and mint animation are preserved. Existing feature colors, including light-theme amount/label contrast limitations, remain unchanged; this extraction does not claim contrast remediation.

Added [four compiler contract tests](cashu-app/tests/momoEntryFormContracts.test.mjs) and [18 entry browser checks including their parent groups](cashu-app/tests/browser/momoEntryForm.test.mjs), plus `test:momo-entry` in [package.json](cashu-app/package.json). The compiler tests first fail with the module absent and now pass, including rejection of review/submission/saved-transfer props, numeric entry and execution callbacks. Browser checks exercise the real parent/shared controls through the existing synthetic fixture. Only the new test supplies the standalone fixture's missing flex reservation; existing fixtures/tests are unchanged. Native pointer cases cover keypad/delete/clear/Max and phone entry, contact and mint choices reaching the same review; feedback priority, review/confirm transitions and action disabling also pass. A temporary bundle accepting a seventh keypad digit fails both direction-specific limit cases; production files are never mutated by this probe.

Verification: all 100 entry/mint-picker/real-page/phone-field/primary-action browser checks pass. Exact DOM geometry/style records match for all 24 entry/review captures across top-up/cashout, dark/light and 390×844, 1024×844 and 390×480. Paired PNG inspection finds 19 byte-identical captures; five differ at 14–68 rounded-edge pixels, by at most two channel levels. The unchanged original component also fails PNG byte comparison against itself at these edges, so byte identity is diagnostic rather than an automated gate; exact geometry/style comparisons remain assertions. Captures wait for settled paint without disabling production animation or adding pixel tolerances. No byte-identical visual claim is made for all 24 images.

All 240 frontend/payment tests and the TypeScript/production build pass, as do both release checks, documentation links and whitespace checks. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Source fingerprints show that only MomoPaymentForm changed among pre-existing runtime files; styles, shared controls, other workflows, existing tests, Rust and lockfiles are untouched. [DESIGN.md](cashu-app/DESIGN.md) records the entry boundary and unchanged parent responsibilities. No funded operation, native IPC or APK build was exercised; native-device and screen-reader behavior are not newly established.

### E8 — Mobile Money review presentation

Completed on 2026-11-22. Added [MomoReview](cashu-app/src/features/momo/MomoReview.tsx), which renders a required non-null review snapshot plus direction and validation/error feedback. It preserves reviewed phone/mint, RWF amount, cashout fixed fee/reserve, wallet estimate, note and alert. The existing service model is imported as a type alias to distinguish it from the UI component; no calculation, provider, approval or lifecycle logic moved into the presentation component. Draft entry values and editing/submission/saved-transfer callbacks are outside its prop contract.

[MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) passes individually named review props and keeps the single shared PrimaryActionButton outside the entry/review conditional. Its `onReview`/`onConfirm` selection, `valid`/`submitting` guards and loading-label precedence remain explicit and unchanged. Keeping that same DOM button preserves native keyboard focus across the entry-to-review transition, allowing the next Enter to confirm once. Entry and saved-transfer presentation remain untouched; E9 is pending. Review JSX is identical apart from indentation, while entry, shared-action and saved-transfer JSX is byte-identical. No wrapper or CSS change was introduced, and existing color/contrast limitations remain outside this extraction.

Added [four compiler contract tests](cashu-app/tests/momoReviewContracts.test.mjs), [16 focused review browser checks including parent groups](cashu-app/tests/browser/momoReview.test.mjs), and `test:momo-review` in [package.json](cashu-app/package.json). All four compiler tests first fail with the module absent and now pass, verifying the snapshot requirement and rejection of draft edits and parent-owned controls. Browser checks preserve exact reviewed values/labels/notes for both directions, absence of editable controls, shared-button identity and focus, separate review/confirmation callbacks, native double-confirmation blocking and alert priority/fallback. They mount the real parent/shared controls through the existing synthetic fixture. A temporary bundle that displays the mint URL in place of the reviewed phone fails all six cashout detail cases; production source is never mutated by that experiment.

Verification: all 116 review/entry/mint-picker/real-page/phone-field/primary-action browser checks pass. Exact geometry/style records match the 12 review baselines across top-up/cashout, dark/light and 390×844, 1024×844 and 390×480; all 12 paired review PNG captures are also byte-identical in this run. All 244 frontend/payment tests, the TypeScript/production build, both release checks, local documentation links and whitespace checks pass. The design detector reports no findings. Existing Vite warnings remain assigned to H4a–H4e. Fingerprints confirm that only MomoPaymentForm changed among pre-existing runtime sources; entry/shared UI, controllers, review calculations, styles, existing tests, Rust and lockfiles are unchanged. [DESIGN.md](cashu-app/DESIGN.md) records the review boundary and parent confirmation ownership. Native-device/screen-reader behavior and funded execution are not newly established; no APK was built.

### E9 — Mobile Money saved-transfer list

Completed on 2026-11-22. Added [MomoSavedTransfers](cashu-app/src/features/momo/MomoSavedTransfers.tsx) with readonly ID/direction/RWF-amount rows and an explicit `onResume(id)` callback. It retains the existing native details/summary, count, labels, View text, row order, ID keys, button types and scrolling classes, and returns nothing for an empty list. [MomoPaymentForm](cashu-app/src/features/momo/MomoPaymentForm.tsx) composes it below the unchanged shared action and hides it during review. The list JSX is unchanged apart from indentation and prop qualification; entry/review/shared-action JSX is byte-identical. No wrapper, style, transaction filtering, persistence, resume or payment policy changed. The separately styled legacy sheet list remains unchanged. E10 is pending.

Added [four compiler contract tests](cashu-app/tests/momoSavedTransfersContracts.test.mjs), [synthetic external boundaries](cashu-app/tests/browser/momoSavedTransfers.boundaries.ts), a [real-store fixture](cashu-app/tests/browser/momoSavedTransfers.fixture.tsx), [17 saved-list browser checks including parent groups](cashu-app/tests/browser/momoSavedTransfers.test.mjs), and `test:momo-saved-transfers` in [package.json](cashu-app/package.json). The compiler tests first fail with the module absent and now pass, accepting minimal readonly rows/string-ID callbacks and rejecting missing inputs, numeric IDs and foreground/payment controls. The new browser fixture retains the actual transaction store and persistence in a temporary Chrome profile; wallet, provider and result-overlay boundaries are synthetic. It verifies top-up/cashout selection by pointer and keyboard, stable-ID behavior after reorder, retained disclosure state, empty history/review hiding, and actual-page resumption without altering the other history record or submitting a payment.

Foreground protection stays with the existing store, which refuses resume while an active transaction exists. The form harness intentionally keeps the list mounted while a funding foreground transaction starts, exercising a late selection. The selected ID reaches the callback, but resume is rejected: active transaction, history and foreground error remain unchanged, and no payment is submitted. Production MomoTransferView keeps its existing success-only local state updates; its callback/store implementation is not modified. A temporary bundle that always passes the first row's ID fails the cashout pointer/keyboard/page and selected-ID checks; production files are never mutated by that experiment.

Verification: all 133 saved-list/review/entry/mint-picker/real-page/phone-field/primary-action browser checks pass; the final focused saved-list rerun also passes all 17 checks after making the new fixture's review direction explicit and checking hiding in both review modes. Geometry/style records exactly match six open-list baselines across dark/light and 390×844, 1024×844 and 390×480. Four paired PNGs are byte-identical; two differ at 131/16 edge pixels by at most two channel levels, consistent with the previously observed Chrome raster variability. No universal PNG byte-identity claim is made. All 248 frontend/payment tests, TypeScript/production build, both release checks, documentation links and whitespace checks pass. The design detector reports no findings. Existing Vite warnings and feature contrast limitations remain unchanged. Fingerprints confirm that only MomoPaymentForm changed among existing runtime sources; controllers, transaction store, recovery/flow services, entry/review/shared UI, styles, existing tests, Rust and lockfiles are untouched. [DESIGN.md](cashu-app/DESIGN.md) records the ownership boundary. No funded execution, native IPC or APK build was exercised; native-device/screen-reader behavior is not newly established.

### E10 — Bitcoin receive presentation

Completed on 2026-11-22. Added [BitcoinReceive](cashu-app/src/features/bitcoin/BitcoinReceive.tsx) with explicit supplied display values/actions for success, Lightning invoice, on-chain address and amount entry. Four early returns retain the original priority without adding DOM wrappers. The component imports UI primitives and the existing QR encoder; it owns no payment hook, quote/history tracking, SDK/client, clipboard or explorer utility. Existing mint display components retain their established metadata behavior. Mode/amount, invoice/address/deposit/fee, copy feedback, limits and disabled/requesting values are supplied by [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx).

The parent retains request generation, all state/effects, quote settlement, overlays, copy timers/toasts, navigation and reset policy. Original mode/amount reset bodies are supplied as explicit callbacks, and invoice/address Back actions retain their previous scope. Request, clipboard/timer and tab-reset handlers and send JSX remain byte-identical. All receive templates retain their original markup/classes/text/formatting after value/action renaming. QR size remains 200px; BIP-21 still uses the supplied deposit amount with its original zero/null fallback, and fee zero/dash behavior, copy payload types/feedback, mint display, keypad/mode controls, warnings and animation remain intact. Lifecycle cancellation/stale-result behavior is not changed; E11 remains pending.

Added [four compiler contract tests](cashu-app/tests/bitcoinReceiveContracts.test.mjs), a [controlled presentation fixture](cashu-app/tests/browser/bitcoinReceive.fixture.tsx), [26 focused caller/presentation browser checks including parent groups](cashu-app/tests/browser/bitcoinReceive.test.mjs), and `test:bitcoin-receive` in [package.json](cashu-app/package.json). Compiler tests first fail with the module absent and now pass, enforcing supplied actions/modes and rejecting transport clients, quote/history and wallet-store props. Actual receive-page cases verify Lightning/on-chain requests, amount/mint forwarding, original copy payloads and Back. Direct cases record QR payloads while using the real encoder, exercise all four views/priority, distinguish deposit amount from displayed amount, cover zero/null deposits/fees, copy/explorer/Done callbacks, mode/keypad entry, limits and disabled/requesting states. Clipboard, explorer and providers are synthetic. A temporary bundle encoding the displayed amount instead of the deposit amount fails the QR/priority checks; production source is never mutated by that experiment.

Verification: all 26 new browser checks plus all 99 existing Bitcoin destination, animated mint-picker and page-layout regressions pass (125 total). Geometry/style records and QR SVG markup match all 24 baseline entry/output captures across both modes, dark/light and 390×844, 1024×844 and 390×480. Eighteen PNG pairs are byte-identical in this run; spinner/pulse animations remain enabled, so universal PNG identity is not asserted. Existing short-height mode-label clipping is preserved rather than redesigned. All 252 frontend/payment tests, TypeScript/production build, both release checks, documentation links and whitespace checks pass. Existing Vite warnings remain assigned to H4a–H4e.

Design-scan findings were reviewed in context: the existing 10–11px receive text is retained and documented as feature-specific typography; four scanner-corner warnings refer to the unchanged send-scanner glyph rather than added card accents, and the remaining parent font advisory is also pre-existing. No detector rules were suppressed and no style changes were made. Fingerprints confirm that BitcoinPaymentView is the only pre-existing runtime source changed; hooks, transport/provider/clipboard/explorer services, shared controls, styles, other workflows, existing tests, Rust and lockfiles are untouched. [DESIGN.md](cashu-app/DESIGN.md) records the boundary. No funded execution, native IPC, camera hardware or APK build was exercised; native-device and screen-reader behavior are not newly established.


### E11 — Bitcoin receive lifecycle

Implemented on 2026-11-22. [useBitcoinReceive](cashu-app/src/features/bitcoin/useBitcoinReceive.ts) owns receive entry, validation, accepted invoice/address/quote, matching settlement, copy feedback/timers and session retirement. It accepts typed request, history, clipboard and notification ports; it imports no provider SDK, native command, router, store or toast. [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) supplies those adapters, shares limits with send, maps receive events to the existing overlays/toasts and retires the session on tab changes, close/exit and legacy redirects. Its limits prefetch ignores completions after cleanup. E12 remains pending.

Amount/mode edits, Back, reset, mint changes and unmount invalidate the previous generation. A synchronous guard prevents duplicate dispatch and remains held until non-abortable provider work settles, including after cancellation. Cancellation retires displayed output; it does not abort provider work, remove history or undo wallet refreshes. A late quote cannot reopen success after Back, and only the current accepted quote can celebrate once per generation. Copy feedback, errors and the two-second timer belong to that session and the latest copy. Reset clears only the receive-owned stamp. The compatibility mint picker now retires the previous address and waits for an explicit request instead of dispatching a regeneration whose returned address was ignored. The [existing picker regression](cashu-app/tests/browser/bitcoinMintPicker.test.mjs) now verifies both retirement and the next explicit request to the selected mint.

[useBitcoin](cashu-app/src/hooks/useBitcoin.ts) adds optional silent/error-callback options to its two receive methods. Default callers keep their existing messages, payloads, dispatch guard and refresh behavior. The view opts into lifecycle-scoped errors so a retired request cannot emit a global toast. Send methods are unchanged. [BitcoinReceive](cashu-app/src/features/bitcoin/BitcoinReceive.tsx), styles, shared controls, QR formatting and animations are unchanged.

Added [four compiler contract tests](cashu-app/tests/bitcoinReceiveLifecycleContracts.test.mjs), [deferred synthetic boundaries](cashu-app/tests/browser/bitcoinReceiveLifecycle.boundaries.ts), a [StrictMode hook fixture](cashu-app/tests/browser/bitcoinReceiveLifecycle.fixture.tsx), an [actual-view fixture](cashu-app/tests/browser/bitcoinReceiveLifecycleView.fixture.tsx), a [real-adapter fixture](cashu-app/tests/browser/bitcoinReceiveAdapter.fixture.tsx) and [lifecycle browser tests](cashu-app/tests/browser/bitcoinReceiveLifecycle.test.mjs). They cover duplicate dispatch, retained guards while retired work is pending, null/error/retry paths, amount/mode/mint/activity changes, matching settlement, per-generation celebration, copy races/timers, unmount, Back, navigation and legacy mint switching. The adapter fixture retains the actual useBitcoin receive methods with synthetic native/Spark/wallet boundaries, verifying default errors, suppressed retired errors, one current error and successful retry/refresh. Added `npm --prefix cashu-app run test:bitcoin-receive-lifecycle` in [package.json](cashu-app/package.json). [DESIGN.md](cashu-app/DESIGN.md) records the ownership and cancellation semantics.

The initial compiler checks failed with the lifecycle module absent. Actual-view regressions reproduced old-quote success after Back and a clipboard toast after navigation; adapter regressions reproduced late global receive errors. Fixture clicks wait for the existing entry animation to finish, and unmount cases resolve deferred work after navigation commits; animations and production timing are not disabled.

Verification: all 256 frontend/payment tests pass, including the four new compiler contracts. All 153 Bitcoin browser checks pass: 28 lifecycle/adapter/view checks and 125 receive-presentation, destination, animated-picker and page-layout regressions. All 24 saved receive entry/output records match geometry, computed styles and QR SVG markup across both modes, light/dark and 390×844, 1024×844 and 390×480. An isolated test bundle removing the epoch comparison fails the four amount/mode/cancel/reset stale-result cases; production source is never mutated. TypeScript/production build, both release checks at 0.1.20, E11 documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain assigned to H4a–H4e.

The design scan reports the same four existing send-scanner corner-stroke findings and the pre-existing parent font-size advisory; no styles, detector rules or thresholds changed. Source fingerprints confirm only BitcoinPaymentView and useBitcoin changed among pre-existing runtime sources. The four send handlers are byte-identical; BitcoinReceive, shared UI, styles, provider/clipboard/explorer services, Rust and lockfiles are unchanged. Other pre-existing work is preserved. No funded execution, actual native/provider transport, system clipboard, camera hardware, APK or screen-reader verification was performed; browser boundaries use synthetic data. E12 has not been started.


### E12 — Bitcoin send destination entry

Implemented on 2026-11-22. [BitcoinDestinationEntry](cashu-app/src/features/bitcoin/BitcoinDestinationEntry.tsx) extracts the destination field/toolbar, shared contact autocomplete, scanner frame, validation feedback and Next/Pay Invoice controls. Its typed contract accepts supplied destination/parsed values, LNURL status, balance/processing flags, on-chain minimum, scanner content and explicit UI actions. It adds no wrapper, state, transport client, parser, clipboard, camera, router or payment dependency. The existing shared autocomplete retains its own contact-store behavior. Shared FormField, IconButton and LnurlValidationStatus remain in use.

[BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) supplies the actual Scanner as ReactNode content and retains all destination/scanner/address-book state, scanner result/error callbacks, modal selection, parser/validation hooks, external actions and send transitions. The clipboard read/trim/error body moves unchanged into a named parent callback. Source comparisons confirm the four send handlers, receive-hook configuration, tab/back/close callbacks are unchanged; all JSX from send amount entry through review, receive, overlays and the address-book modal is byte-identical. Presentation classes, labels, feedback, scanner decorations, dropdown animation, minimum fallback and disabled/loading guards are preserved. E13–E14 have not been started.

Added [four compiler contracts](cashu-app/tests/bitcoinDestinationEntryContracts.test.mjs), a [supplied-value/action fixture](cashu-app/tests/browser/bitcoinDestinationEntry.fixture.tsx) and [seven direct browser checks including the parent group](cashu-app/tests/browser/bitcoinDestinationEntry.test.mjs). Compiler tests first fail with the module absent, then enforce required actions, parsed/validation contracts and separation from external clients. Direct checks cover typed edits, paste/clear, address-book actions and real shared autocomplete, supplied scanner content/visibility, balance/busy/empty guards, supplied invoice amount/on-chain minimum, LNURL status and explicit Pay/Next callbacks. The [existing destination suite](cashu-app/tests/browser/bitcoinDestinationField.test.mjs) now supports before/after presentation comparisons and enables Chrome focus emulation/foregrounding for keyboard checks. Timeouts and assertions are unchanged. The initial unchanged-source baseline stalled at its final keyboard check; the focused baseline passes after that harness correction. Added `npm --prefix cashu-app run test:bitcoin-destination-entry` in [package.json](cashu-app/package.json), and documented ownership in [DESIGN.md](cashu-app/DESIGN.md).

Verification: all 260 frontend/payment tests pass, including the four new contracts. All 160 Bitcoin browser checks pass across the component, destination field, animated mint picker, page layout, receive presentation and receive lifecycle suites (counts include parent groups). The destination suite was rerun successfully after three capture writes failed because a temporary output directory was missing; comparison assertions and production source needed no changes. All twelve field/toolbar/scanner/action geometry/style records match the pre-extraction baseline across page/legacy, light/dark and 390×844, 1024×844 and 390×480. All twelve PNG pairs are byte-identical. Visually reviewed the short dark legacy view and desktop light page. An isolated bundle removing the invoice insufficient-balance disabled guard fails its direct test; production files are never mutated by that experiment.

TypeScript/production build, both release checks at 0.1.20, E12 documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain assigned to H4a–H4e. Design-scan findings concern the retained scanner corner strokes and the pre-existing parent font-size advisory; no detector suppressions, style changes or lowered thresholds were introduced. Existing short legacy-sheet clipping and light-theme contrast limitations remain unchanged (H6). Fingerprints confirm BitcoinPaymentView is the only pre-existing runtime source changed; hooks, shared controls, styles, provider/clipboard/explorer services, Rust and lockfiles are untouched. Other pre-existing work is preserved. No funded/native provider operation, actual system clipboard, camera hardware, APK or screen-reader verification was performed; browser adapters are synthetic. E13 remains pending.


### E13 — Bitcoin send review presentation

Implemented on 2026-11-22. [BitcoinSendReview](cashu-app/src/features/bitcoin/BitcoinSendReview.tsx) renders explicit mint/destination, amount, network/bridge fee, Lightning/mint fee and total props, an explicit Back action and supplied confirmation content. The same file exports BitcoinSendConfirmation with only `paying` and `onConfirm` props. It retains the native button, busy/disabled behavior, spinner, text, classes and animation. There is no new wrapper, state, fee calculation, provider/native command, router, store or payment-hook dependency. Shared MintIcon/MintName retain their existing metadata behavior and initials.

[BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) explicitly maps `amount`, `ark_fee`, `cashu_fee` and `total_cost` from the owned estimate into display props. It retains all estimate/payment ownership and execution, navigation, overlays and transitions. Page confirmation remains in the existing fixed footer; legacy confirmation and Back remain inline. Source comparisons confirm all four send handlers, paste, receive-hook configuration, tab/back/close and renderContent are unchanged, as are destination/amount templates. E14 remains pending; duplicate-submission lifecycle changes are not included in this extraction.

Added [four compiler contracts](cashu-app/tests/bitcoinSendReviewContracts.test.mjs), a [supplied-value/action fixture](cashu-app/tests/browser/bitcoinSendReview.fixture.tsx) and [six direct checks including the parent group](cashu-app/tests/browser/bitcoinSendReview.test.mjs), plus [synthetic boundaries](cashu-app/tests/browser/bitcoinSendReview.boundaries.ts), an [actual-view fixture](cashu-app/tests/browser/bitcoinSendReviewView.fixture.tsx) and [15 page/legacy checks including the parent group](cashu-app/tests/browser/bitcoinSendReviewView.test.mjs). Compiler tests first fail with the component absent, then enforce explicit values/actions and reject raw estimates, clients and malformed display values. Direct checks distinguish the supplied total from amount-plus-fees, preserve zero values and long destination text, exercise Back/confirmation placement, and verify busy text/spinner/native disabled behavior. Actual-view checks use distinct synthetic fees to catch swapped provider-field mappings and verify Back and forwarding the exact reviewed estimate/destination to a recorded execution adapter that never contacts a provider or completes payment. Added `npm --prefix cashu-app run test:bitcoin-send-review` in [package.json](cashu-app/package.json). [DESIGN.md](cashu-app/DESIGN.md) records the boundary.

Verification: all 264 frontend/payment tests and all 181 relevant Bitcoin browser checks pass (counts include parent groups): 21 review checks and 160 destination/component, animated-picker, page-layout, receive-presentation and receive-lifecycle regressions. All twelve review geometry/style/text/action-placement records match across page/legacy, light/dark and 390×844, 1024×844 and 390×480. All twelve PNG pairs are byte-identical after allowing the existing hover transition to finish. The initial capture waited only 100 ms after moving the pointer; the test now waits 250 ms, without disabling animations or changing production code, assertions or test timeouts. The settled baseline is rendered from the frozen pre-E13 source through an isolated build plugin, without reverting workspace files. Visually reviewed the short light page and short dark legacy review. An isolated bundle removing the confirmation button's busy guard fails its direct regression; production source is never mutated by that experiment.

TypeScript/production build, both release checks at 0.1.20, E13 documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain assigned to H4a–H4e. The design scan reports only the existing 10px mint-initials advisory, now located in the extracted component; no style changes, suppressions or lowered thresholds were introduced. Existing short-view clipping and light-theme contrast limitations remain unchanged (H6). Fingerprints confirm BitcoinPaymentView is the only pre-existing runtime source changed; hooks, other presentation components, shared UI, styles, services, Rust and lockfiles are untouched. Other pre-existing work is preserved. No funded/native provider operation, actual camera/clipboard hardware, APK or screen-reader verification was performed; provider execution is synthetic and never completed. E14 has not been started.


### E14 — Bitcoin send lifecycle

Implemented on 2026-11-22. [useBitcoinSend](cashu-app/src/features/bitcoin/useBitcoinSend.ts) owns destination/amount state and parsing, input/amount/review transitions, accepted LNURL parameters and estimate, paste preparation, submission attempts, result display state and explicit retry. Typed ports supply live validation reads, clipboard, LNURL resolution/invoice creation, estimation, payment, errors and successful-contact bookkeeping. It imports no runtime provider SDK, native command, wallet/contact store, toast or router. The previous untyped LNURL parameter state is removed. [BitcoinPaymentView](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx) supplies adapters, keeps scanner/address-book visibility and live validation, shares limit data with receive, composes presentation and coordinates navigation/close. Send and receive results no longer share retry or recipient/error state. The redundant on-chain limits request in Next is removed; the shared prefetch retains its retirement guard.

One synchronous operation lock spans preparation and payment. Each accepted review captures its mint, destination, requested amount input and estimate. An attempt is recorded before dispatch, blocking rapid duplicate confirmation, confirmation after success and duplicate Retry. Reported failure permits explicit Retry using captured values; choosing Go back after failure also leaves the existing confirmation action usable. Neither path automatically resubmits. Dismissing success retains the consumed-attempt guard. Edits, mint/activity changes, Back, reset, close and unmount retire old results/retries. The lock remains held until dispatched work settles. A retired LNURL invoice never reaches payment, and destination-bound validation reads prevent same-turn edits from using a previous address's cached result. Clipboard reads belong to the current session and latest paste.

Cancellation retires foreground ownership, without aborting or undoing payment. Native adapter wallet refreshes still run, successful contact usage records the captured destination even after navigation, and bookkeeping failure cannot turn payment success into failure. Late results cannot replace a new flow's overlay. [useBitcoin](cashu-app/src/hooks/useBitcoin.ts) adds optional scoped error reporting to estimation and execution, using the same helper/options as receive. Default callers retain their messages, native guards, payloads and refresh behavior; lifecycle callers suppress retired notifications. The native Lightning adapter is byte-identical. This is a guard for one mounted foreground owner, not durable backend idempotency or unknown-outcome recovery; native/provider recovery policy is unchanged.

Added [four compiler contracts](cashu-app/tests/bitcoinSendLifecycleContracts.test.mjs), [deferred synthetic boundaries](cashu-app/tests/browser/bitcoinSendLifecycle.boundaries.ts), a [StrictMode hook fixture](cashu-app/tests/browser/bitcoinSendLifecycle.fixture.tsx), an [actual-view fixture](cashu-app/tests/browser/bitcoinSendLifecycleView.fixture.tsx), a [real-adapter fixture](cashu-app/tests/browser/bitcoinSendAdapter.fixture.tsx) and [lifecycle/adapter/view checks](cashu-app/tests/browser/bitcoinSendLifecycle.test.mjs). Tests first reproduce two execution calls from rapid confirmation and a payment dispatched after navigation during invoice creation. A further regression reproduced an initially over-restrictive failure-dismissal path, which now preserves Go back and explicit resubmission while retaining duplicate guards. Compiler checks first fail with the new module absent; their environment now includes the app's Vite declarations and TypeScript-extension option, matching production settings without suppressing diagnostics. Added `npm --prefix cashu-app run test:bitcoin-send-lifecycle` in [package.json](cashu-app/package.json), and updated current ownership descriptions in [DESIGN.md](cashu-app/DESIGN.md).

Verification: all 268 frontend/payment tests pass, including the four new compiler contracts. All 225 Bitcoin browser checks pass (counts include parent groups): 44 send lifecycle/adapter/view checks and 181 existing destination, animated-picker, layout, review, receive and receive-lifecycle checks. They cover duplicate estimate/confirmation/retry, pending and consumed attempts, failed-result dismissal, current/null/error/retry paths, initial/fixed amounts, bounds/balance, destination/amount/mint/activity changes, StrictMode unmount, stale resolution/invoice/paste results, captured payment arguments, contact bookkeeping and default/scoped adapter errors with wallet refreshes. The final failure-dismissal correction is verified by both hook and actual-view regressions. Isolated bundles removing the consumed-attempt guard and epoch comparison fail the replay and stale-LNURL tests respectively; production files are never mutated by those experiments.

All twelve pre-E14 review geometry/style/text/action-placement records match across page/legacy, light/dark and 390×844, 1024×844 and 390×480. Ten PNG pairs are byte-identical; the two desktop legacy captures differ in only 50 and 47 mint-badge pixels out of 864,256, with maximum RGB-channel differences of 10 and 7. No universal PNG identity is asserted. Visually reviewed the desktop dark legacy before/after pair and short light page. All parent presentation class attributes are byte-identical. Review, destination and receive components, shared controls, CSS and provider arithmetic are unchanged. Existing short-view clipping and light-theme contrast limitations remain unchanged (H6).

TypeScript/production build, both release checks at 0.1.20, E14 documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain assigned to H4a–H4e; the source design scan adds no findings, and no suppressions or thresholds changed. Fingerprints confirm only BitcoinPaymentView and useBitcoin changed among pre-existing runtime sources; receive lifecycle, shared UI, services, Rust and lockfiles are untouched. Other pre-existing work is preserved. Native/provider transports and refreshes in the integration checks are synthetic; no funded payment, actual device clipboard/camera, APK or screen-reader verification was performed. Milestone E is complete; F1 has not been started.


### F1 — Shared cash-in review/execution calculation

Completed on 2026-11-22. [flowServices](cashu-app/src/services/flowServices.ts) now retains the complete fresh review instead of returning just its rate and repeating the cash-in arithmetic. currentMomoQuote fetches one rate, calls the existing buildMomoReview and checks any approved snapshot. Confirmed execution uses that retained quote; unreviewed direct calls build the same quote inside the existing transaction flow. Its sats supply both receive_lightning and Mobile Money initiation, its amount supplies the charged RWF, and its rate/spread preserve effective-rate metadata. Stored transaction fee remains zero; the review's embedded spread is not added as a separately charged fee. The duplicated floor expression and spread comment are removed. The pure calculator itself is unchanged.

The original minimum/maximum and phone prechecks, approved-rate check before transaction creation, post-check foreground claim, transaction/request order, error/recovery handling and public calculateQuote signature remain intact. Existing cash-out rate checking delegates to the same fresh-review helper, while the cash-out execution arithmetic and every function from handleFulfillOrder onward are byte-identical. Cash-out execution reuse remains F2. Direct cash-in calls now inherit the existing review validation for whole-RWF amounts, required mint/positive rate and a positive safe-integer sats result, blocking fractional RWF, invalid rate/mint and zero-sat invoices before provider/native work. Normal UI review already enforced those checks.

Added six execution regressions in [momoFlows.test.mjs](cashu-app/tests/momoFlows.test.mjs) and two calculator regressions in [momoReview.test.mjs](cashu-app/tests/momoReview.test.mjs). They verify inclusive 100/200,000 RWF limits, floor rounding and the existing maximum-amount floating-point edge, exact native/provider arguments, one fresh rate request, a favorable fresh quote instead of stale approved sats, unchanged zero fee/effective rate, early boundary messages and invalid direct-call rejection. The new direct-call checks first fail against the old implementation and now pass. An isolated module-loader mutation changing cash-in review rounding from floor to ceil fails the execution rounding check, confirming that execution consumes the shared calculator result. Production source is never mutated by the experiment.

All 37 focused calculator/flow tests and all 276 frontend/payment tests pass. TypeScript/production build, both release checks at 0.1.20, documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain tracked under H4a–H4e. [DESIGN.md](cashu-app/DESIGN.md) documents ownership and the distinction between embedded spread and stored transaction fee. Only flowServices changed among runtime sources; UI, shared controls, styles, pure calculators, stores, polling/fulfillment bodies, native code and lockfiles are unchanged. Tests use synthetic rate/native/provider adapters; no funded execution or APK build was performed. F2 has not been started.


### F2 — Shared cash-out review/execution calculation

Completed on 2026-11-23. [flowServices](cashu-app/src/services/flowServices.ts) now retains the complete fresh cash-out review from currentMomoQuote, reusing buildMomoReview instead of recomputing fixed payout fees, spread and funding sats. The receiving Lightning invoice and stored satsAmount use quote.fundingSats. The reviewed wallet budget uses quote.sats, which adds the routing reserve; adding that reserve to the funding invoice would incorrectly increase its face value. Stored transaction fee remains zero and rate metadata stays the quote's raw rate, preserving existing fee semantics. The now-unused reviewedMomoRate projection is removed. The pure calculator is unchanged.

Approval still happens before transaction/invoice creation and compares rounded wallet budgets, including reserve. One sat above the approved total is rejected; a higher raw rate may pass when its rounded total remains equal. A favorable fresh quote funds the current amount instead of the older approved amount. Inclusive 100–200,000 RWF bounds, limit/phone messages and request/phase ordering remain intact. Direct execution now shares the review's whole-RWF, valid-mint/rate and safe-sats validation before creating a funding invoice. Cash-in execution, fulfillment/cash-in polling, funding payment, payout and recovery function bodies are byte-identical. F3 has not been started.

Added seven execution regressions in [momoFlows.test.mjs](cashu-app/tests/momoFlows.test.mjs) and two calculator regressions in [momoReview.test.mjs](cashu-app/tests/momoReview.test.mjs). The existing Lightning invoice stub now delegates to a fixture callback that defaults to the same rejection; success cases record an unfunded invoice request without paying it or initiating payout. Tests cover fixed fee plus rounded spread, ceiling funding, inclusive bounds, exact stored/invoice values, zero stored fee/raw rate, one fresh rate fetch, no reserve in the invoice, favorable rates, one-sat approval increases, unchanged rounded bounds, reserve-only approval changes and invalid direct-call rejection. The direct-call regression first fails against the old implementation and now passes. Isolated module-loader mutations adding the reserve to the invoice or changing spread ceiling to floor both fail the execution regression; production files are never mutated by those experiments.

All 46 focused calculator/flow tests and all 285 frontend/payment tests pass. TypeScript/production build, both release checks at 0.1.20, documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain tracked under H4a–H4e. [DESIGN.md](cashu-app/DESIGN.md) documents funding amount versus wallet budget and current shared calculation ownership. Only flowServices changed among runtime sources; UI, shared controls, CSS, the pure calculator, stores, native code and lockfiles are unchanged. Tests use synthetic rate/Lightning/native/provider adapters; no funded execution or APK build was performed.


### F3 — Injected cash-in polling scheduler

Implemented on 2026-11-23. Added [Scheduler/timeoutScheduler](cashu-app/src/services/scheduler.ts), a single schedule(callback, delayMs) port returning an idempotent cancellation callback. [startPaymentVerification](cashu-app/src/services/flowServices.ts) receives that scheduler and an optional isCurrent guard, owns its poll/deadline cancellations, and returns cleanup synchronously, including while the first status request is pending. It no longer accepts React timer refs or a stopPolling callback. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) injects the real timeout adapter and invokes returned cleanup on effect replacement/unmount. Payout refs and payout behavior remain for F6.

Immediate status checking, configured interval/deadline values and the deadline start after the first nonterminal/error response are preserved. Polls remain sequential, with the next interval starting after each request settles; transient status errors continue polling. Terminal success/failure, explicit cleanup or deadline stop both timers, and stopped owners ignore queued/in-flight callbacks. Unknown outcomes remain pending in recovery with the existing message. Cleanup does not abort provider HTTP or undo already-started fulfillment. Store/provider access remains direct for F4/F5, and fulfillment/payout orchestration is not migrated in this task.

Added a [manual scheduler helper](cashu-app/tests/helpers/manualScheduler.ts), [two timeout-adapter tests](cashu-app/tests/scheduler.test.mjs), and ten service cases plus their parent group in [momoFlows.test.mjs](cashu-app/tests/momoFlows.test.mjs). The existing obsolete-effect test now uses the scheduler API. Cases cover immediate/polled success/failure, exact interval timing, transient errors, non-overlap, cleanup before the first response, idempotent cancellation, already queued callbacks, recovery deadline with a later success/failure and no foreground transaction. The scheduler-module check first fails with the module absent; service checks also fail against the old async/ref API. Initial success assertions were corrected to the existing already-claimed mint-status path, whose fulfillment body is unchanged.

Added [synthetic clock/provider/native boundaries](cashu-app/tests/browser/cashInPolling.boundaries.ts), a [real processor/store StrictMode fixture](cashu-app/tests/browser/cashInPolling.fixture.tsx) and [five browser checks including the parent group](cashu-app/tests/browser/cashInPolling.test.mjs). They verify phase replacement retires the original pending request, active polling reaches fulfillment once, unmount before/after scheduling cancels ownership and subscriptions, queued callbacks remain inert, and a late poll cannot undo deadline recovery. No funding requests are allowed in the fixture. Added `test:momo-cash-in-polling` in [package.json](cashu-app/package.json). [DESIGN.md](cashu-app/DESIGN.md) documents the new API, ownership and deferred boundaries.

Verification: all 52 scheduler/flow tests and all 298 frontend/payment tests pass, as do all five processor/store browser checks. Isolated module-loader removal of the stopped-owner guard fails initial-response cancellation, queued-callback and deadline/late-result checks; an isolated browser bundle omitting the processor cleanup leaves both jobs scheduled and fails its unmount regression. Production files are never mutated by these experiments. TypeScript/production build, both release checks at 0.1.20, documentation links and whitespace checks pass. Existing Vite mixed-import/chunk warnings remain tracked under H4a–H4e.

Fingerprints confirm only flowServices and useTransactionProcessor changed among pre-existing runtime sources, plus the new scheduler adapter. All service code outside cash-in verification is byte-identical apart from its scheduler type import; saved-transfer/backend processor effects, quote/fulfillment/payout bodies, UI, CSS, stores, providers, native code and lockfiles are unchanged. Other pre-existing work is preserved. No funded execution, actual provider/native operation, device or APK verification was performed; browser tests retain the real processor/store in an isolated profile with synthetic external boundaries. F4 has not been started.


### F4 — Cash-in transaction access by ID

Implemented on 2026-11-23. [startPaymentVerification](cashu-app/src/services/flowServices.ts) now receives transactionId and the [MomoTransactionAccess](cashu-app/src/types/momo.ts) port alongside its scheduler/ownership guard. Every status request, phase/result/deadline update and fulfillment call uses the captured ID. The verifier no longer reads the global active transaction directly. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) injects the [store adapter](cashu-app/src/services/momoTransactionAccess.ts); its existing React cleanup/guard still retires replaced owners.

The adapter looks up active/history records by ID and delegates to the existing ID-based update action without promoting a saved record into the foreground. A new atomic setErrorForTransaction action in [transactionStore](cashu-app/src/store/transactionStore.ts) updates the presentation error only when that ID is active. Failed provider results also preserve their reason in that transfer's existing recoveryMessage. Missing, completed, recovery or otherwise ineligible targets cannot receive late verification results; their owner stops polling. Fulfillment receives the explicit ID while its internal implementation remains unchanged for F8.

Verification:

- Red: new ownership tests failed against the pre-F4 verifier because stale callbacks queried or changed the foreground transfer.
- Green: all 59 flow tests and all 307 frontend/payment tests pass.
- All 11 isolated Chrome processor/store tests pass, including saved-transfer success/failure, scoped error updates, polling/deadline ownership, removed targets and processor replacement.
- In-memory mutations independently removed the fulfillment ID and reversed the store error guard. Tests failed on the resulting wrong-foreground completion/error changes; production files were not mutated.
- TypeScript/Vite production build passes. Existing mixed-import/chunk-size warnings remain tracked under H4a–H4e.
- Both release checks pass for 0.1.20, including history hygiene. Task-only diff/whitespace and file fingerprints checked.

Only the verifier, its processor wiring, transaction access types/adapter, scoped store error action, focused tests and these architecture/review documents change. Other service bodies and saved-transfer/backend processor effects are byte-identical. UI/CSS/animations, quote calculations, payout policy, persistence schema, providers and native code are unchanged. Tests use synthetic external boundaries; no funded operations, actual provider/native execution, device or APK verification was performed. F5 has not been started.


### F5 — Injected cash-in provider status access

Implemented on 2026-11-23. [startPaymentVerification](cashu-app/src/services/flowServices.ts) now requires checkPaymentStatus(transactionId), used by both the immediate request and scheduled polls. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) supplies the existing provider adapter at the composition point. No implicit provider fallback is used by the verifier.

The [MomoPaymentStatusResult](cashu-app/src/types/momo.ts) contract defines SUCCESSFUL, FAILED, PENDING and UNKNOWN plus an optional message. [momoService](cashu-app/src/services/momoService.ts) annotates its existing normalizer with that result type; HTTP calls, raw-response normalization, provider aliases and ambiguous-outcome behavior are unchanged. The shared payout helper gains the same explicit return type without a runtime change.

[Polling tests](cashu-app/tests/momoFlows.test.mjs) now inject ordinary status functions directly, including deferred promises and rejected requests. A new regression runs two owners with independent fakes and verifies that their initial/polled outcomes stay separate while the module adapter is never called. Loader interception remains for unrelated flow dependencies, recovery status and fulfillment until their planned tasks; it no longer supplies this verifier's status results. The [browser fixture](cashu-app/tests/browser/cashInPolling.fixture.tsx) also supplies status explicitly for direct verifier calls.

Verification:

- Red: converted/new tests failed against the F4 verifier, which ignored the supplied function and called the module adapter instead.
- Green: all 60 flow tests and all 308 frontend/payment tests pass, including existing provider-normalization coverage.
- All 11 isolated Chrome processor/store tests pass with synthetic providers, covering processor wiring, replacement/unmount, saved-transfer updates and deadlines.
- TypeScript/Vite production build and both 0.1.20 release checks (including history hygiene) pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Byte comparisons confirm other service bodies, provider runtime implementation and saved-transfer/backend processor effects are unchanged. Fingerprints and an F5-only review patch preserve the earlier uncommitted F4 work; diff/whitespace and documentation links checked.

UI, CSS, animations, transaction persistence, calculations, timing/cancellation, failure messages, payout/recovery behavior and fulfillment policy are unchanged. No funded operation, actual provider/native execution, device or APK verification was performed. F6 has not been started. Changes are left uncommitted and unpushed for review.


### F6 — Explicit payout polling dependencies and owned cleanup

Implemented on 2026-11-23. [initiateAndVerifyPayout](cashu-app/src/services/flowServices.ts) now receives transactionId, MomoTransactionAccess, checkPayoutStatus, Scheduler and an optional isCurrent guard. It returns idempotent cleanup synchronously, including during an unresolved initiation request. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) injects the same store/scheduler adapters used for cash-in plus the normalized payout status function; its Mobile Money timer refs and stopPolling callback are removed.

All payout transaction reads, writes, status queries and error updates target the captured ID. Callbacks check existence, direction, pending status, expected phase and ownership before changing state. Saved payouts can be verified directly without taking the foreground. Removed/settled/recovery targets and canceled owners cannot restart timers or apply late results to another transfer. Success retains wallet refresh and recording the selected recipient in the address book.

The existing delayed first poll, sequential request scheduling and interval/deadline values are preserved. PENDING, UNKNOWN and rejected status requests remain unresolved until recovery; a deadline or explicit funded provider failure preserves the funding and pending record without resubmission. The deadline now mirrors recovery into history through the existing ID-based store action. Cleanup cannot undo a dispatched provider request; canceled initiation results leave the submitting intent for recovery. Existing funding/intent guards, submission request format and failure/support messages are retained, including empty-exception fallback messages.

Initiation remains inside this operation and still calls the existing adapter directly; extracting it is F7. Wallet/contact effects remain direct service dependencies. This task does not claim that payout initiation or all processor responsibilities have been migrated.

Verification:

- Red: the new dependency/cleanup tests failed against the prior React-ref API; a separate failing regression caught the empty-exception fallback during implementation.
- Green: all 75 flow tests and all 323 frontend/payment tests pass.
- All 20 isolated Chrome payout/cash-in processor/store tests pass: 9 payout tests including the suite parent, plus 11 cash-in tests. Coverage includes delayed polling, success/contact recording, unknown/rejected/late outcomes, deadlines, saved-ID isolation, queued callbacks, unmount/replacement, initiation handoff and lost-response remount without resubmission.
- TypeScript/Vite production build and both 0.1.20 release checks, including history hygiene, pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Byte comparisons confirm every service body outside payout and the saved-transfer/backend processor effects are unchanged. File fingerprints preserve earlier uncommitted F4/F5 work. The F6-only review patch, whitespace and documentation links are checked.

Added [payout browser boundaries](cashu-app/tests/browser/payoutPolling.boundaries.ts), [fixture](cashu-app/tests/browser/payoutPolling.fixture.tsx), [tests](cashu-app/tests/browser/payoutPolling.test.mjs) and the test:momo-payout-polling command in [package.json](cashu-app/package.json). The command builds and runs scheduler/flow/browser checks serially. Tests use synthetic provider/native/funding boundaries; no funded operation, actual provider/native execution, device or APK verification was performed. UI/CSS/animations, quote calculations, persistence schema, provider adapters and native code are unchanged. F7 has not started. Changes are uncommitted and unpushed for review.


### F7 — Separate payout initiation from verification

Implemented on 2026-11-23. New [startPayoutInitiation](cashu-app/src/services/payoutInitiation.ts) receives transactionId, MomoTransactionAccess, an injected submitPayout function and an optional lifecycle guard. It owns the funding/intent checks and submission response, returns synchronous cleanup and has no scheduler, provider-module or transaction-store imports. [startPayoutVerification](cashu-app/src/services/flowServices.ts) replaces the combined initiateAndVerifyPayout API and owns only verification/completion/recovery; it cannot dispatch a payout. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) wires the two phases to these separate operations.

Only a funded pending initiation record explicitly marked not_started can submit. The service synchronously writes submitting through updateById before invoking the provider and rechecks ownership before dispatch. A failed intent write prevents dispatch. The access contract now states the synchronous persistence requirement; the production adapter retains its existing localStorage-backed Zustand write. Existing references advance directly to verification. Submitting/accepted/rejected/missing markers do not submit again; duplicate ownership retains conservative recovery behavior. Confirmed responses save the reference and accepted marker before entering verification. Unknown/rejected/exception results preserve funding and recovery messages, and canceled/obsolete results cannot update a replacement transfer. Recovery-write failures are reported without retrying submission.

Added the typed [MomoPayoutSubmissionResult](cashu-app/src/types/momo.ts) and applied it to the existing [provider adapter](cashu-app/src/services/momoService.ts). Its HTTP implementation, request format and normalization behavior are unchanged. The guarantee is client-side guarding of a persisted intent; provider-side idempotency and coordination across multiple app instances are unchanged. An asynchronous replacement for transaction storage must introduce an awaited persistence boundary before dispatch.

Verification:

- Red: initiation/polling separation tests failed before the new entry points existed.
- Green: all 79 flow tests and all 327 frontend/payment tests pass. Tests use ordinary injected submission functions and cover intent-before-dispatch, duplicate starts, existing interrupted/rejected markers, accepted references, persistence failure, lost responses and canceled results.
- All 22 isolated Chrome payout/cash-in processor/store tests pass. The payout boundary inspects actual localStorage when synthetic dispatch occurs; it sees the saved submitting marker and funded transaction ID. Additional checks prove one dispatch across duplicate owners and zero dispatch after a real Storage.setItem failure. Existing interval/deadline, recovery, phase-handoff, unmount and saved-ID isolation checks still pass.
- In-memory mutations independently removed the submitting write and the marker guard. Tests failed on missing persisted intent and duplicate dispatch respectively; production files were not mutated.
- TypeScript/Vite production build and both 0.1.20 release checks, including history hygiene, pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Byte comparisons confirm unrelated flow bodies and saved-transfer/backend processor effects are unchanged, and provider changes are type-only. Fingerprints preserve prior uncommitted F4–F6 work. F7-only diff, whitespace and documentation links checked.

Updated the existing flow and payout browser tests/fixtures and [DESIGN.md](cashu-app/DESIGN.md); the existing test:momo-payout-polling command exercises both operations. Transaction persistence schema/store implementation, UI/CSS/animations, quote calculations, polling timing, wallet/contact completion policy and native code are unchanged. Tests use synthetic external boundaries; no funded operation, actual provider/native execution, device or APK verification was performed. F8 has not started. Changes remain uncommitted and unpushed for review.


### F8 — Injected fulfillment payment and mint-status operations

Implemented on 2026-11-23. New [fulfillMomoTransaction](cashu-app/src/services/momoFulfillment.ts) receives a transaction ID, transaction access, typed payment/mint-status/wait/clock operations and a completion callback. It owns fulfillment/recovery without importing a provider, native API, store or real timer. New [momoFulfillmentOperations](cashu-app/src/services/momoFulfillmentOperations.ts) composes the existing Lightning payment adapter, native status check with a twenty-second deadline, waits and clock. [handleFulfillOrder](cashu-app/src/services/flowServices.ts) remains the existing caller-facing wrapper, supplying the store adapter and wallet/address-book effects; cash-in/recovery caller signatures and the React processor are unchanged.

The existing quote-first recovery behavior, exact saved invoice/quote, two-second retry delay, twenty-attempt maximum, ninety-second between-attempt budget and normal failure/completion messages are preserved. The budget does not abort an in-flight twenty-second status request. Confirmed claimed quotes skip payment, including older records without a saved invoice. A missing quote blocks native work; a missing invoice blocks payment with a support message. An unresolved payment still requires recovery/status reconciliation; this change does not establish provider-side exactly-once payment.

The per-ID guard remains, with state checks after async boundaries. Missing, completed, cash-out or changed invoice/quote records cannot be fulfilled by an obsolete owner. A newer recovery/terminal phase is not rolled back. Saved targets retain their own updates while another foreground transfer/error remains unchanged. The extracted implementation removes the old fulfillment non-null assertions and any catches.

Verification:

- Red: new ordinary-fake operation tests failed before the extracted entry point existed.
- Green: all 347 frontend/payment tests pass, including 19 fulfillment tests and 80 existing flow/adapter tests. Coverage includes unavailable preflight, payment rejection/exception, post-payment mint errors, retry/budget exhaustion, interrupted waits, phase/completion save failures, retry after recovery, missing/changed data, concurrent owners and late results for removed/newer targets.
- A deterministic adapter test verifies that an unresolved initial native status check reaches recovery after twenty seconds without asking the gateway to pay.
- All 25 isolated Chrome cash-in/fulfillment/payout tests pass. Real store/wrapper/adapter wiring with synthetic external boundaries verifies preflight failure on a saved ID, unknown payment recovery followed by claimed-quote completion without another payment, and post-payment mint-status failure/retry without paying again.
- In-memory mutations forced payment of an already claimed quote and ignored a rejected payment result. Tests failed on the extra payment and incorrect completion respectively; production files were not mutated.
- TypeScript/Vite production build and both 0.1.20 release checks, including history hygiene, pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Byte comparisons confirm all flow service bodies outside fulfillment are unchanged. File fingerprints preserve earlier uncommitted F4–F7 work. F8-only diff, added-line whitespace and documentation links checked.

Added [momoFulfillment.test.mjs](cashu-app/tests/momoFulfillment.test.mjs), updated the existing flow and cash-in browser tests/fixtures, documented the boundary in [DESIGN.md](cashu-app/DESIGN.md), and added test:momo-fulfillment in [package.json](cashu-app/package.json). The command builds and runs fulfillment/flow/browser checks serially. Save-failure fakes verify recovery control flow, not process-crash durability or successful persistence while storage remains unavailable. UI markup/CSS/animations, quote calculations, transaction schema/store implementation, provider implementations, payout operations, processor and native code are unchanged. No funded operation, actual provider/native execution, device or APK verification was performed. F9 has not started. Changes remain uncommitted and unpushed for review.


### F9 — Lifecycle wiring for migrated Mobile Money flows

Implemented on 2026-11-23. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) now starts active/saved Mobile Money owners and returns cleanup. It no longer imports Mobile Money phases/providers/flow functions or owns saved-transfer filtering/backoff/timers. New [momoProcessing](cashu-app/src/services/momoProcessing.ts) owns those decisions using typed operation/snapshot/scheduler/clock dependencies, with no React/store/provider imports. New [active processing adapter](cashu-app/src/services/momoProcessingAdapter.ts) and [saved recovery adapter](cashu-app/src/services/savedMomoRecoveryAdapter.ts) compose the existing production services. The adapters make dependency wiring explicit without putting payment decisions back into React.

Phase routing remains cash-in verification for PENDING_PAYMENT/VERIFYING_PAYMENT, payout initiation for INITIATING_PAYOUT, payout verification for VERIFYING_PAYOUT, the existing funding action for AWAITING_INVOICE_PAYMENT, and refresh for AWAITING_ASP_BOARDING/READY_TO_CLAIM. Active cleanup retires its guard before cancelling delegated work, is idempotent and detects foreground ID replacement. The legacy funding action's internal store/native behavior is unchanged; this extraction does not make a dispatched funding request abortable.

Saved reconciliation retains its five-second initial/cadence delay, one eligible non-active transfer per pass, sequential requests, existing phase/direction/status eligibility, and 30/60/120/240/300-second capped per-ID backoff. Ineligible IDs lose attempt state as before. Cleanup now additionally ignores already queued callbacks before state reads/provider checks. A recovery request already dispatched can still settle by ID, but cannot schedule more work after cleanup. Unknown funded payouts remain unresolved without resubmission. The separate backend/Spark effect is outside the migrated flows and is byte-identical.

Verification:

- Red: new ordinary-fake phase/ownership/reconciliation tests failed before the extracted service entry points existed.
- Green: all 359 frontend/payment tests pass, including 12 new processing tests. They cover every routed phase, stale selections, cancellation ordering/idempotence, eligibility, selection, exact backoff/cap, error continuation, non-overlap, queued callbacks, pending-request cleanup and attempt reset.
- All 28 isolated Chrome cash-in/fulfillment/payout tests pass. New real processor/store checks cover saved top-up completion without changing the foreground/error, unknown funded saved payout recovery without resubmission, and queued recovery callbacks after unmount. Existing F3–F8 regressions remain green.
- Browser fixtures give active and saved scheduling independent manual clocks; production retains the existing stateless timeoutScheduler for both. Added [saved recovery clock boundary](cashu-app/tests/browser/savedMomoRecovery.boundaries.ts); external payment/provider/native boundaries remain synthetic.
- In-memory mutations disabled active-owner retirement and the queued saved-callback guard. Tests failed on the live cancellation guard and an unwanted post-cleanup state read respectively; production files were not mutated.
- TypeScript/Vite production build and both 0.1.20 release checks, including history hygiene, pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Byte comparison proves the backend/Spark effect is unchanged. File fingerprints preserve previous uncommitted F4–F8 work. F9-only diff, whitespace and documentation links checked.

Added [momoProcessing.test.mjs](cashu-app/tests/momoProcessing.test.mjs), updated existing cash-in/payout browser tests and fixtures, documented ownership in [DESIGN.md](cashu-app/DESIGN.md), and added test:momo-processing in [package.json](cashu-app/package.json). Flow/fulfillment/payout/provider implementations, transaction persistence schema/store, UI/CSS/animations, quote calculations and native code are unchanged. No funded operation, actual provider/native execution, device or APK verification was performed. F1–F9 are complete; G1 has not started. Changes remain uncommitted and unpushed for review.


### Targeted fix — Separate Lightning/Cashu checking from Spark reconciliation

Implemented on 2026-11-23 at the user's request, before G1. New [walletReconciliation](cashu-app/src/services/walletReconciliation.ts) and [sparkReconciliation](cashu-app/src/services/sparkReconciliation.ts) provide typed, independently owned jobs. [walletReconciliationAdapter](cashu-app/src/services/walletReconciliationAdapter.ts) supplies native commands, state, existing Spark operations and timers. [TransactionProcessor](cashu-app/src/hooks/useTransactionProcessor.ts) now starts these owners and returns cleanup, with no native polling or Spark payment decisions in React. Its migrated Mobile Money lifecycle wiring remains unchanged.

Ordinary Lightning/Cashu automatic and manual status checks no longer call or await Spark. The Cashu scanner starts immediately, scans again two seconds after its list read settles, and launches independent per-receipt jobs rather than waiting for an entire status batch. A slow receipt cannot block new or unrelated Lightning receipts. Per-owner outstanding IDs and a shared production status reader prevent duplicate outstanding checks across automatic/manual/remount callers. Results are not cached after settlement. Existing eligible native types and exclusion of the active Mobile Money quote are preserved.

On-chain automatic/manual jobs retain Spark-before-native ordering inside their own asynchronous job. Other receipts proceed independently while they wait. Automatic jobs recheck lifecycle after awaiting Spark, so unmount cannot dispatch a late native status request. [History](cashu-app/src/hooks/useHistory.ts) routes from existing transaction metadata; missing metadata is looked up rather than treating every history action as Spark work. Existing toast/status messages and subsequent wallet/history refresh behavior are retained, including checking native on-chain status if Spark reconciliation fails.

The Spark owner keeps an initial check, fifteen-second periodic triggers, the existing SDK event types, and earlier pending-on-chain hints. A shared single-flight coordinator joins outstanding timer/event/manual reconciliation. Pending on-chain preferred-mint selection and active-quote exclusion are preserved before initial/periodic work. Hints received during outstanding work are coalesced; pending receipts are reconsidered on later scans. Existing Spark send workflows that directly use the balance lock remain intact. The existing sweep algorithm, isSweeping/send-reservation guards, balance lock, SDK/native operations and money movement implementation are unchanged.

Verification:

- Red: regression tests failed before the separated service entry points existed.
- Green: all 377 frontend/payment tests pass, including 18 new service tests covering stalled Spark, slow/native-status isolation, per-ID coalescing, preferred mints, eligibility, manual type routing, per-on-chain ordering, periodic/events/error recovery and cancellation after Spark waits.
- All 36 isolated Chrome reconciliation/cash-in/fulfillment/payout tests pass. New real processor/store/production-adapter tests verify Lightning and manual Lightning progress with Spark unresolved; discovery of new receipts while another status check is pending; on-chain ordering; timer/event/manual coordination; Spark retry after failure; preferred-mint retention; and cleanup without late refreshes/restarts. The previous 28 Mobile Money/fulfillment tests remain green.
- In-memory mutations restored unconditional Spark work for manual checks and disabled shared in-flight Spark coordination. Tests failed on the unexpected Lightning-triggered reconciliation and loss of shared work respectively; production files were not mutated.
- TypeScript/Vite production build and both 0.1.20 release checks, including history hygiene, pass. Existing mixed-import/chunk-size warnings remain under H4a–H4e.
- Fingerprints prove Spark financial safeguards, native/Rust code, Bitcoin send adapter and prior Mobile Money operations are unchanged. History changes only its status-routing import/call. The targeted diff preserves previous uncommitted work; whitespace and documentation links checked.

Added [walletReconciliation.test.mjs](cashu-app/tests/walletReconciliation.test.mjs), the [browser fixture](cashu-app/tests/browser/walletReconciliation.fixture.tsx), [synthetic boundaries](cashu-app/tests/browser/walletReconciliation.boundaries.ts), [browser tests](cashu-app/tests/browser/walletReconciliation.test.mjs) and [backend test clock](cashu-app/tests/browser/backendPollingClock.boundaries.ts). Existing cash-in/payout tests give backend scheduling its own clock. Added test:wallet-reconciliation in [package.json](cashu-app/package.json) and documented ownership in [DESIGN.md](cashu-app/DESIGN.md).

This removes frontend sequencing delays; native wallet-lock contention, mint/network latency, encrypted saves and send-side wallet-refresh waits remain unchanged. Already-dispatched work is not aborted. Tests use synthetic external boundaries and prove ordering/ownership, not live settlement speed or SDK/node availability. No funded operation, actual provider/native execution, device or APK verification was performed. UI markup/styles/animations, transaction schema and provider request formats are unchanged. G1 has not started. Changes remain uncommitted and unpushed for review.


### G1 — Surface an eCash send recovery-save failure

Implemented on 2026-11-23. The split-error branch in [send_ecash_operation](cashu-app/src-tauri/src/commands/send.rs) no longer discards the recovery save result with .ok(). A failed save appends its complete error chain to the original split diagnostic, explicitly retains the unknown outcome/do-not-resend instruction, and emits a receipt-correlated stderr diagnostic. The returned OUTCOME_UNKNOWN code and original pending transaction ID are preserved. A successful recovery save retains the previous error message exactly. Both structured v2 and legacy string errors retain the diagnostic; frontend handling remains code-based with its existing safe History message and unresolved-send guard.

No retry, resend, new API field or logging infrastructure is added. Pending state remains pending. The change does not claim that the latest recovery state was saved after a failed write. Receive recovery remains for G2; proof selection, fees, token encoding, locking, normalization, file format and atomic-save implementation are unchanged.

Verification:

- Red: the corrected native regression failed against the original branch because the returned message omitted the failed recovery save. The accepted test socket is explicitly blocking, with bounded local-server waits.
- Green: all 92 Rust workspace tests pass, with zero failures, ignored or filtered tests and no compiler warnings. Command: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline`, with localhost mock-server access. The native library includes the new regression and existing send/API contract tests.
- The new [native regression](cashu-app/src-tauri/src/commands/send_tests.rs) uses an isolated temporary wallet and local synthetic mint. It preserves the initially saved pending receipt, replaces the wallet destination with a directory, then returns a split-preparation error. It asserts the original error, actual OS save error, unknown-outcome code, original pending ID, and legacy error compatibility. Only the two expected GET requests occur; no swap submission/retry occurs in this fixture.
- All 378 frontend/payment tests pass, including the new [caller regression](cashu-app/tests/sendEcashCaller.test.mjs): two send attempts after the combined OUTCOME_UNKNOWN error produce only one native dispatch and retain History guidance.
- Both 0.1.20 release checks, including history hygiene, pass. Added-test rustfmt, added-line whitespace and documentation links checked.
- Byte comparison proves the runtime diff is confined to this one send recovery branch. Receive/G2, all other native/Rust code, frontend runtime, Lightning/Spark separation and prior Mobile Money work are unchanged. Prior test bodies are byte-identical.

The native failure fixture stops during swap preparation; it does not simulate a funded swap, real process termination, disk-full conditions or a mint spending proofs. It verifies a real filesystem save failure and retained diagnostic, not guaranteed recovery persistence while storage remains unavailable. Frontend/UI runtime is unchanged, so browser/device checks were not repeated. No funded operation, actual provider execution, APK build, commit or push was performed. Updated [DESIGN.md](cashu-app/DESIGN.md) with the error policy. G2 has not started.


### G2 — Surface one receive recovery-save failure

Implemented on 2026-11-23. The generic non-spent swap-error branch of [receive_ecash](cashu-app/src-tauri/src/commands/send.rs) now checks its recovery save result instead of discarding it with .ok(). A failed save preserves the original receive diagnostic, appends the save-error chain, states that the outcome remains unknown and advises checking History before claiming again. A receipt-correlated stderr diagnostic is emitted. The receipt remains pending, and the operation returns an error rather than a received amount or a claim of saved recovery. When the recovery save succeeds, the prior error message remains exactly unchanged. No automatic retry or new block on explicit later attempts is introduced.

A thin public Tauri wrapper delegates its original six arguments to a private receive_ecash_operation, matching the existing send test seam. The receive body is byte-identical except for this selected branch. This is not G8's wallet-crate orchestration extraction. Validation, invoice constraints, fees, locking, Nostr handling, proof processing, idempotency, spent-token restore branches and successful receive behavior remain unchanged. G1 send behavior is unchanged.

Verification:

- Red: the native failure regression reproduced the missing recovery-save diagnostic. The existing successful-save error was characterized and retained exactly.
- Green: all 94 Rust workspace tests pass in the full parallel run, with zero failures, ignored or filtered tests and no compiler warnings. Command: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline`, with localhost test-server access. Both receive cases and G1's send-save regression pass.
- The shared [native fault fixture](cashu-app/src-tauri/src/commands/send_tests.rs) uses temporary encrypted wallets and a localhost synthetic mint. It preserves the first pending receipt, replaces the destination with a directory and exercises a real recovery-save rename failure. Assertions cover both causes, the actual OS error, original pending identity, unchanged balance/no incoming credit and exact legacy behavior when saving succeeds. The fixture makes only two GET requests and fails before a funded swap; G1 assertions are retained.
- All 379 frontend/payment tests pass. The new [receive caller regression](cashu-app/tests/sendEcashCaller.test.mjs) checks visible and silent failures: no success amount, balance refresh or automatic retry, and both diagnostics reach onError/the existing error toast.
- Initial full runs exposed intermittent connection errors in existing wallet-client localhost tests; all seven client tests passed in isolation. Their mock server could treat an accepted nonblocking socket's unavailable read as end-of-request and close early. A single test-only set_nonblocking(false) in [client.rs](crates/ecash-wallet/src/client.rs) makes it wait for request bytes with its existing timeout. All assertions and parallel execution are preserved; production HTTP code is unchanged. The final full run passes.
- Both 0.1.20 release checks, including history hygiene, pass. Changed native-test formatting, added-line whitespace and documentation links checked.
- Byte comparisons prove the receive body changes only in the selected error branch, G1 send logic and assertions remain intact, and wallet-client production code is unchanged. File fingerprints preserve prior frontend, Mobile Money and Lightning/Spark work.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the receive durability policy and test limits. These checks do not simulate a mint spending proofs, a funded receive/restore, disk exhaustion or real process termination, and do not guarantee a save while storage remains unavailable. Frontend runtime/UI is unchanged, so browser/device tests were not repeated. Native API signatures, error schema, wallet formats and dependencies are unchanged. No funded operation, actual provider execution, APK build, commit or push was performed. G3 has not started.


### G3 — Extract pure proof selection into the wallet crate

Implemented on 2026-11-23. [proof_selection.rs](crates/ecash-wallet/src/proof_selection.rs) now owns select_exact_proofs, exposed through the wallet crate's module declaration. Both existing native send call sites import this helper instead of a private command-layer implementation. The function borrows proofs, copies credentials without mutation and returns an exact selection or None for the existing swap path. It depends only on the core Proof type; there is no Tauri, wallet-state, mint, storage or asynchronous dependency in the helper.

Stable largest-first ordering, equal-denomination identity, all proof metadata, greedy fallback for arbitrary denominations and the original zero-target behavior are preserved. Subtracting from the remaining target replaces overflow-prone sum + proof.amount; a boundary regression reproduced the old overflow before this correction. Selected proofs are moved from the owned sorted copy rather than cloned a second time. Native send/receive orchestration, G1/G2 recovery diagnostics, fees, locking, token construction, error contracts and wallet formats are unchanged. The native test module now imports Proof directly because production send code no longer needs that type import.

Verification:

- Test-first red: the new public-boundary integration tests initially failed because the wallet module did not exist. After moving the original selection algorithm, six tests passed and the large-denomination regression failed with addition overflow.
- Green: all seven [pure selection tests](crates/ecash-wallet/tests/proof_selection.rs) pass. They cover exact amounts, insufficient funds, missing denominations, input immutability, stable identity and full credential metadata, zero behavior, all 64 binary denominations and neighboring amounts, and repeated large proofs at u64::MAX. An independent subset-sum oracle checks all 81 inventories with zero to two copies of denominations 1, 2, 4 and 8, for every positive target through total + 1; returned proofs must be unique input credentials summing to the target.
- Full native/workspace verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 101 tests, with zero failures, ignored or filtered tests and no compiler warnings. This includes G1/G2 native recovery regressions. Existing localhost tests use synthetic mint responses; pure selector tests need no network.
- Both release checks for 0.1.20 pass, including history hygiene. New Rust files pass rustfmt; whitespace and added documentation links checked.
- Byte comparison proves native runtime changes only in the helper extraction and imports. Existing native test bodies are unchanged apart from the direct Proof import. File fingerprints preserve all other prior G2, Mobile Money and Lightning/Spark work.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the helper location and compatibility policy. Frontend runtime/UI, dependencies and release versions are unchanged; frontend/browser/device suites were not repeated for this Rust-only extraction. Fixtures contain synthetic credentials and do not validate funded mint interoperability. No funded operation, actual provider execution, APK build, commit or push was performed. G4 has not started.


### G4 — Extract outgoing token and result construction

Implemented on 2026-11-23. The new [outgoing.rs](crates/ecash-wallet/src/outgoing.rs) owns encode_outgoing_tokens, OutgoingTokens and the existing serializable SendEcashResult. The native send module re-exports that result type and delegates payload construction. Encoding still runs V3 then V4 with unit sat, before success-record updates. The native command still stores V3 in history, saves the wallet and only then builds the response with the existing success transaction ID. The result definition is copied byte-for-byte: token, token_v3, token_v4 and tx_id, with V3 as the primary token. No Tauri, wallet state, I/O or clock is introduced into the helper.

Encoding-error labels remain exactly Failed to encode token v3/v4: followed by the original error; the native adapter retains OUTCOME_UNKNOWN and the same pending recovery ID. The encoders themselves, proof selection, fee policy, pending/success record construction, save order and G1/G2 recovery behavior are unchanged. G5's pending-record extraction is not included.

Verification:

- Fixed [V3/V4 fixtures](crates/ecash-wallet/tests/fixtures/outgoing_tokens.json), independently constructed from the existing JSON/CBOR layout, first passed against the original encoders before extraction. They cover ordinary proofs, long keyset IDs, object/string witnesses, incomplete DLEQ and wallet-only metadata omission, empty input and multiple keysets. All credentials are synthetic and unfunded; the mint uses the reserved invalid domain.
- Test-first red: new helper/result tests failed because the outgoing module did not exist. Green: all three [outgoing-token tests](crates/ecash-wallet/tests/outgoing_tokens.rs) pass. V3 and single-keyset V4 compare exact bytes. Multiple-keyset V4 compares decoded CBOR with only keyset-entry order normalized, preserving the original HashMap order variability. Input credentials remain unchanged. Serialized response assertions cover all four fields, V3 as default and the supplied transaction ID.
- Mutation check: temporarily changing the default token to V4 made the response-shape fixture fail as expected. The correct V3 implementation was restored before native wiring and full verification.
- All 379 frontend/payment tests pass, with no failures or skipped tests.
- Full workspace verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 104 tests, with zero failures, ignored or filtered tests and no compiler warnings. The existing successful native send-result regression and G1/G2 recovery tests pass unchanged.
- Both 0.1.20 release checks pass, including history hygiene.
- New Rust files and the changed native encoding snippet pass rustfmt. Whitespace checks pass. File fingerprints confine G4 to seven files, preserving all prior work; byte comparisons confirm the native result definition is identical, history still uses V3 and all transaction/recovery/save logic is retained.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the outgoing boundary and fixture policy. The low-level encoders, dependencies, release versions and frontend runtime/UI are unchanged. Fixtures do not establish funded mint interoperability; no funded operation, actual provider execution, device/APK build, commit or push was performed. Browser/device checks were not repeated for this Rust-only extraction. G5 has not started.


### G5 — Extract pending send-record construction

Implemented on 2026-11-23. PendingSend in [outgoing.rs](crates/ecash-wallet/src/outgoing.rs) names the caller-supplied recovery ID, request, selected proofs, amount, fee, timestamp and mint. Its into_transaction method creates the existing Send transaction with an empty token string and Pending status. It moves proof credentials unchanged and has no wallet, Tauri, clock, storage or network dependency. Named fields avoid a long positional argument list with interchangeable amount/fee/time integers.

The native command supplies the same cloned ID/request/proofs and scalar values. Its tx_send_ ID generation, timestamp expression and evaluation location, pending_tx_id assignment, push, encrypted save, swap call and recovery handling remain unchanged. The helper performs no validation, fee arithmetic, normalization or ID generation; those responsibilities stay at their existing boundaries. Successful record construction and G4's token encoding/result construction are unchanged. This does not include G6's send-orchestration move.

Verification:

- Before extraction, the strengthened [native recovery regression](cashu-app/src-tauri/src/commands/send_tests.rs) passes against the original constructor. It reads the encrypted snapshot actually saved before swap preparation and asserts original pending identity, input proof credentials, amount, fee, mint, empty token and no payment request. Existing diagnostic and identity assertions remain intact. The synthetic mint makes only the existing two GET requests and fails before a funded swap.
- Test-first red: [pure pending-record tests](crates/ecash-wallet/tests/pending_send.rs) failed because PendingSend did not yet exist. Green: all three pass after extraction. Assertions cover the complete serialized recovery contract and proof metadata/order, request presence/legacy omission, and preservation of supplied IDs, amounts, fees and timestamps at u64 boundaries. Boundary cases characterize construction only; native validation is not bypassed or changed.
- Mutation check: temporarily producing Success instead of Pending makes the complete record fixture fail. Pending is restored before native integration and full verification.
- Full verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 107 Rust tests, with zero failures, ignored or filtered tests and no compiler warnings. The strengthened native snapshot regression, G1/G2 diagnostics, G3 proof selection and G4 payload/result fixtures pass together.
- Both 0.1.20 release checks pass, including history hygiene.
- Changed Rust files and isolated native construction/test snippets pass rustfmt. Whitespace checks pass. Byte comparison confines native runtime changes to the pending-record constructor and its import; G4 encoding/result methods remain byte-identical. File fingerprints preserve all prior work outside the six G5 files.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the pending-record boundary and test coverage. Wallet formats, dependencies, release versions, public command signatures, frontend runtime/UI and Lightning/Spark behavior are unchanged. Frontend/browser/device checks were not repeated for this Rust-only extraction. Tests use synthetic unfunded credentials and temporary encrypted wallets; they do not establish funded mint interoperability or simulate a mint spend. No funded operation, actual provider execution, APK build, commit or push was performed. G6 has not started.


### G6 — Move send orchestration into a wallet operation

Implemented on 2026-11-23. [send.rs](crates/ecash-wallet/src/send.rs) now owns the complete existing eCash send workflow, accepting an exclusively borrowed WalletState, its existing path/passphrase and a named SendEcashRequest. It has no Tauri/AppState dependency. Validation, duplicate protection, both fee-cap checks, exact selection/spent-proof cleanup, swap preparation, durable pending intent, unknown-outcome diagnostics, token construction, success updates and save ordering are preserved. Storage and mint access remain concrete; this does not implement G9/G10.

The legacy and structured native entry points keep their signatures and shared adapter. Authentication/loading and their distinct error codes remain native, and the same wallet guard stays alive across the awaited operation. The native adapter adds no early unlock, background work, retry or extra provider call. [payment_quote.rs](crates/ecash-wallet/src/payment_quote.rs) owns the unchanged quote implementation shared by review and execution. [send_error.rs](crates/ecash-wallet/src/send_error.rs) owns the exact former structured error definitions. Native modules re-export their former Rust paths and retain legacy message-only conversion. Both dependent extractions are necessary to remove the operation's native-layer dependencies without duplicating policy.

Verification:

- Test-first red: [standalone operation tests](crates/ecash-wallet/tests/send_operation.rs) failed before the wallet send/error modules existed. Baseline characterization then passed against the extracted operation while native sends still used their original workflow.
- A synthetic exact-proof send saves a real temporary encrypted wallet without AppState and returns the existing V3-primary result/history identity. Duplicate requests retain their original receipt across all four statuses and mint differences, with no new save/state change. Fee fixtures verify initial quote rejection, rejection after a later fee increase and acceptance when the later total exactly equals the cap. The accepted case reaches durable Pending recovery, then fails during synthetic preparation before any swap POST. All fee-fixture requests are GETs.
- The new [native concurrency regression](cashu-app/src-tauri/src/commands/send_tests.rs) gates a mint response, checks that the wallet mutex is held during the await, polls another send to prove it queues, releases the gate and checks queued progress/final lock release. Its initial assertion incorrectly expected immediate try_lock availability while a queued waiter had Tokio's FIFO reservation. The test now waits for that queued send with a bounded timeout before checking final availability; production locking is unchanged.
- Mutation check: inverting the wallet duplicate-request predicate makes the duplicate regression fail. The original predicate is restored before native delegation. The existing fee-cap boundary unit test moves intact from the native module to the wallet module; all other pre-existing native test bodies/fixtures are preserved.
- All 379 frontend/payment tests pass with zero failures or skipped tests. The native v2-error fixture, legacy errors, public response contract, G1/G2 recovery diagnostics and G3–G5 contracts pass in the delegated workflow.
- Final verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 111 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings. After extraction, Transaction became test-only in the native module; its import was moved to the test module and the full suite rerun to verify a clean build.
- Both 0.1.20 release checks pass, including history hygiene.
- New Rust files and isolated native adapter/lock-test snippets pass rustfmt. Whitespace checks pass. Formatted-source comparisons prove the moved send and quote bodies preserve their original logic apart from module paths and borrowed path/passphrase arguments. Structured error definitions are byte-identical. Authentication/guard acquisition, native payment command bodies, legacy conversion, receive orchestration and existing native regressions remain unchanged apart from necessary imports and the intact test migration.

Updated [DESIGN.md](cashu-app/DESIGN.md) and the [architecture map](CONTRIBUTING.md) with the new operation/quote/error locations. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. File fingerprints preserve prior Mobile Money, Lightning/Spark and G1–G5 implementation work. G6 remains uncommitted and unpushed. No funded operation, actual provider execution, APK/device build or browser/device check was performed. Synthetic GET-only preparation failures do not prove funded swap interoperability or process-crash recovery. G7 has not started.


### G7 — Extract receive-input normalization and validation

Implemented on 2026-11-23. [receive_input.rs](crates/ecash-wallet/src/receive_input.rs) owns three pure helpers with explicit decoded/prepared values. validate_receive_constraints preserves the original pre-wallet invoice completeness, byte limits and gross-amount/mint checks. decode_receive_token preserves the ordinary parse-error prefix and remains after authentication, Nostr-key update and raw receipt lookup. prepare_receive_input owns the original strict invoice keyset resolution, permissive prefix resolution, checked aggregate fees, positive-net guard and post-fee invoice validation after native mint metadata retrieval. No helper reads wallet/storage/clock state or makes a mint request.

The existing decoder and invoice validators are reused unchanged. Raw token text remains caller-owned and is not rewritten for history or idempotency. Ordinary receives retain their previous first-match keyset resolution and missing-fee fallback; invoice receives retain unique sat-keyset resolution. Native locking, metadata-fetch behavior, receipt checks, pending claim creation, encrypted saves, swap/restore orchestration and G2 recovery diagnostics remain unchanged. This does not implement G8 or alter persisted-wallet normalization.

Verification:

- Original decoder characterization first passed against frozen token fixtures; the final [fixture set](crates/ecash-wallet/tests/fixtures/receive_inputs.json) contains 26 synthetic valid/malformed V3/V4 inputs. Coverage includes URI wrappers/whitespace, padded/standard/URL-safe base64, normalized mint paths, witnesses, lowercase signature aliases, legacy/v2 keyset IDs, missing fields, unsupported units, amount overflow, invalid encodings and zero-value cases.
- Three new [native characterization tests](cashu-app/src-tauri/src/commands/send_tests.rs) passed against the original workflow before extraction. They prove constraint/size/invoice-parse error precedence over locked wallet access, ordinary auth/parse precedence, the existing Nostr-key update before ordinary parse failure, and successful raw receipt return before ordinary decoding. All prior native test bodies and fixtures remain byte-identical.
- Test-first red: the new helper tests failed before the receive_input module existed. Green: all 11 [pure/fixture tests](crates/ecash-wallet/tests/receive_input.rs) pass. They cover all constraint-presence combinations, UTF-8 byte boundaries, ordinary-size compatibility, raw versus contextual parse errors, credential/order preservation, first-match versus strict unique-sat resolution, aggregate rounding, checked sum/rounding overflow, no-net-value rejection and post-fee invoice coverage.
- Mutation check: changing the fee guard to allow fee == token amount makes the zero-net regression fail. The original guard is restored before native integration.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- Full verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 125 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings. The new native ordering cases, G2 receive recovery diagnostics and all G1–G6 send contracts pass with the helpers integrated.
- Both 0.1.20 release checks pass, including history hygiene.
- New Rust files and isolated native integration/test snippets pass rustfmt; whitespace checks pass. Formatted-source comparisons prove the extracted constraint, normalization and fee bodies retain their original logic and error text after module/borrow/error adaptations. The native diff is confined to those staged integrations and imports; all existing auth, Nostr, receipt, claim, recovery, persistence and send code is unchanged.

Updated [DESIGN.md](cashu-app/DESIGN.md) and the [architecture map](CONTRIBUTING.md) with the helper locations and ordering policy. The codec, invoice validators, wallet formats, dependencies, versions, public IPC signatures, frontend runtime/UI and prior Lightning/Spark/Mobile Money work are unchanged. Fixtures use synthetic unfunded credentials and do not establish cryptographic validity or funded mint interoperability. No actual provider execution, funded claim/swap, APK build, browser/device check, commit or push was performed. G8 has not started.


### G8 — Move receive orchestration into a wallet operation

Implemented on 2026-11-23. [receive.rs](crates/ecash-wallet/src/receive.rs) now owns the complete existing eCash receive workflow, accepting an exclusively borrowed WalletState, its existing encrypted wallet path/passphrase and a named ReceiveEcashRequest (or pre-validated ValidatedReceiveRequest). It has no Tauri/AppState dependency. Staged invoice constraint validation, Nostr-key updates, raw-token receipt lookup and invoice-idempotency checks, decoding, strict-invoice versus permissive-ordinary mint metadata fetches, keyset/fee preparation, deferred-claim reuse, durable pending claim saves, swap execution, scoped spent-token restore for ordinary receives, G2 recovery-save diagnostics and final success persistence keep their existing order and exact error strings. Storage and mint access remain concrete; storage injection and implicit persistence normalization remain deferred to G9–G14. The three existing spent-token restore branches retain their `.ok()` save calls as a preserved limitation rather than expanding G8 into a recovery-policy rewrite.

The public native `receive_ecash` command keeps its signature and thin adapter. `receive_ecash_operation` validates pre-wallet invoice constraints via `ReceiveEcashRequest::validate()` before acquiring the authenticated wallet guard, then holds that guard across the awaited `receive_ecash_validated` call. No early unlock, wallet clone, new retry or extra provider call is introduced. `save_ecash_for_later` remains unchanged in the native module.

Verification:

- Test-first red: [standalone receive operation tests](crates/ecash-wallet/tests/receive_operation.rs) failed to compile before `ecash_wallet::receive` existed.
- Green: all 6 standalone wallet receive tests pass without Tauri/AppState, covering raw receipt return before decoding, invoice-identity enforcement, Nostr-key update ordering before ordinary parse failure, pre-wallet invoice constraint checks and strict metadata fetches, deferred `save_for_later` card reuse with durable pending intent, G2 recovery-save failure diagnostics, legacy error text on successful recovery save, and scoped restore on already-spent ordinary receives versus pending preservation on invoice receives.
- New [native receive concurrency regression](cashu-app/src-tauri/src/commands/send_tests.rs) gates `/v1/keysets`, proves the wallet mutex guard stays held across mint awaits while a second receive queues, releases the gate and verifies queued resumption and final lock release. All existing native receive-ordering, G2 recovery and G1–G6 send regressions remain intact and pass.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- Full verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 132 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- `rustfmt --edition 2021 --check` passes on `crates/ecash-wallet/src/receive.rs` and `crates/ecash-wallet/tests/receive_operation.rs`. `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) and the [architecture map](CONTRIBUTING.md) with the receive operation boundary and preserved limitations. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. Synthetic localhost fixtures fail during GET-only preparation before any funded swap or restore and do not prove funded mint interoperability or real process-crash recovery. G8 remains uncommitted and unpushed. G9 has not started.


### G9 — Delegate file read/write through a storage module

Implemented on 2026-11-24. [storage.rs](crates/ecash-wallet/src/storage.rs) now owns encrypted wallet file persistence, atomic replacement, encryption helpers and default/temp path helpers (`EncryptedWallet`, `encrypt_wallet`, `decrypt_wallet`, `default_wallet_path`, `temp_wallet_path`, `save_encrypted_wallet`, `load_encrypted_wallet`, `load_plaintext_wallet`). [state.rs](crates/ecash-wallet/src/state.rs) delegates `WalletState::default_path`, `save_encrypted`, `load_encrypted` and `load_plaintext` to `ecash_wallet::storage` and re-exports `EncryptedWallet`, `encrypt_wallet` and `decrypt_wallet` at their existing paths so no caller imports break.

The v1 AES-256-GCM + Argon2id (`65536` KiB, 3 iterations, 4 lanes, 32-byte key, 32-byte salt, 12-byte nonce) pretty-printed JSON format, plaintext zeroization, parent-directory creation, `.json.tmp` atomic write-and-rename replacement, default `~/.ecash/wallet.json` path, legacy plaintext migration reads and exact error messages remain unchanged. Existing `WalletState` pre-save `dedup_proofs()` and post-load `heal_corrupt_proofs()`/`normalize_mints()` remain in `state.rs` (storage injection is deferred to G10; proof-normalization characterization and removal belong to G11–G14).

Verification:

- Test-first red: [wallet storage tests](crates/ecash-wallet/tests/wallet_storage.rs) failed to compile before `ecash_wallet::storage` existed.
- Green: all 4 standalone storage tests pass, covering v1 encrypted JSON format and secret non-leakage on disk, direct `encrypt_wallet`/`decrypt_wallet` compatibility, missing/wrong-passphrase/unsupported-version/plaintext error messages, `.json.tmp` temp path preservation, protection of an existing wallet file when temp-file creation fails, atomic overwrite, failed final rename behavior and `default_wallet_path` parity.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- Full verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 136 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- `rustfmt --edition 2021 --check` passes on `crates/ecash-wallet/src/storage.rs` and `crates/ecash-wallet/tests/wallet_storage.rs`. `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) and the [architecture map](CONTRIBUTING.md) with the storage module location and preserved normalization boundary. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. G9 remains uncommitted and unpushed. G10 has not started.


### G10 — Inject storage into one operation for failure testing

Implemented on 2026-11-24. [storage.rs](crates/ecash-wallet/src/storage.rs) now defines `WalletStorage` (`fn save(&mut self, state: &mut WalletState) -> Result<()>`) and `EncryptedFileStorage<'a>`, which delegates to `WalletState::save_encrypted` to preserve existing encryption, atomic replacement and pre-save proof deduplication (G11–G14 remain separate). [send.rs](crates/ecash-wallet/src/send.rs) now exposes `send_ecash_with_storage<S: WalletStorage>`, routing all four send-level persistence calls through the injected `WalletStorage`. `send_ecash` constructs `EncryptedFileStorage::new(path, passphrase)` and delegates directly to `send_ecash_with_storage`, keeping the existing signature and production behavior unchanged. Internal swap persistence inside `swap_proofs` still uses the concrete path/passphrase.

Verification:

- Test-first red: [send operation tests](crates/ecash-wallet/tests/send_operation.rs) failed to compile before `WalletStorage` and `send_ecash_with_storage` existed.
- Green: all 3 new injected-storage failure tests in [send_operation.rs](crates/ecash-wallet/tests/send_operation.rs) pass using a scripted in-memory `WalletStorage` without filesystem rename hacks:
  - Pre-swap pending-intent save failure aborts with `InternalError` (`tx_id: None`) after `/v1/keysets` and before `/v1/keys` (swap preparation) is requested.
  - Post-swap recovery save failure (save #1 succeeds and captures the `Pending` snapshot; mint swap preparation fails; save #2 fails) returns `OutcomeUnknown` with the original `tx_id`, both diagnostics and the exact `Recovery state could not be saved: ... Outcome remains unknown; do not resend.` suffix.
  - Exact-send final save failure returns `OutcomeUnknown` (`tx_id: None`) after in-memory proof removal.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- Full verification: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 139 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- `rustfmt --edition 2021 --check` passes on `crates/ecash-wallet/src/storage.rs`, `crates/ecash-wallet/src/send.rs` and `crates/ecash-wallet/tests/send_operation.rs`. `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) and the [architecture map](CONTRIBUTING.md) with the `WalletStorage` trait and `send_ecash_with_storage` boundary. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. Synthetic localhost fixtures fail during GET-only preparation before any funded swap submission and do not prove funded mint interoperability or real process-crash recovery. G10 remains uncommitted and unpushed. G11 has not started.


### G11 — Characterize current proof normalization before persistence

Implemented on 2026-11-24. Added [proof_normalization.rs](crates/ecash-wallet/tests/proof_normalization.rs) with 5 synthetic characterization tests documenting the exact current pre-persistence behavior of `WalletState::save_encrypted` without changing production code:

- Per-mint deduplication keys on `proof.secret`, retaining the first occurrence (including its amount, keyset ID and derivation index) and preserving relative order of distinct proofs.
- Deduplication is scoped per mint entry rather than globally across mints, so identical secrets under distinct mint URLs are both kept.
- Already-normalized wallets (including witnesses, DLEQ metadata and empty mint proof vectors) are unchanged in memory and round-trip identically.
- `WalletState::save_encrypted` mutates `self.proofs` in memory before disk replacement, even when the underlying write/rename fails.
- Raw `storage::save_encrypted_wallet` does not deduplicate proofs, confirming that implicit normalization currently lives strictly in `WalletState::save_encrypted` ahead of G12–G14.

Verification:

- Focused characterization suite: `CARGO_INCREMENTAL=0 cargo test --workspace --test proof_normalization --locked --offline` passes all 5 tests with zero compiler warnings.
- Full Rust workspace: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 144 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- `rustfmt --edition 2021 --check crates/ecash-wallet/tests/proof_normalization.rs`, `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the characterized proof-normalization contract. No production code, dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. G11 remains uncommitted and unpushed. G12 has not started.


### G12 — Add an explicit normalization/preparation call and migrate one save caller

Implemented on 2026-11-24. Exposed `WalletState::normalize_proofs_for_persistence(&mut self)` in [state.rs](crates/ecash-wallet/src/state.rs) with the exact characterized per-mint secret deduplication logic (preserving first occurrence and relative order). `WalletState::save_encrypted` still delegates to `self.normalize_proofs_for_persistence()` until remaining save callers are migrated in G13 and raw persistence drops implicit mutation in G14.

Migrated the first save caller, [send.rs](crates/ecash-wallet/src/send.rs) (`send_ecash_with_storage`), so all four send-level saves call `persist_send_state` (`w_state.normalize_proofs_for_persistence()` followed by `storage.save(w_state)`). Remaining callers (`receive.rs`, `swap.rs`, `melt.rs`, `restore.rs`, `history.rs`, CLI and native commands) are left for G13.

Verification:

- Test-first red: `proof_normalization` failed to compile before `WalletState::normalize_proofs_for_persistence` existed.
- Green: `explicit_normalize_proofs_for_persistence_matches_characterized_behavior` in [proof_normalization.rs](crates/ecash-wallet/tests/proof_normalization.rs) verifies per-mint deduplication, cross-mint preservation and idempotence.
- Caller proof: `send_normalizes_proofs_explicitly_before_calling_injected_storage` in [send_operation.rs](crates/ecash-wallet/tests/send_operation.rs) runs `send_ecash_with_storage` with `ScriptedStorage` (which never calls `WalletState::save_encrypted`) on a wallet with duplicate proofs and proves the saved snapshot is already normalized before `storage.save`.
- Full Rust workspace: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 146 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- `rustfmt --edition 2021 --check` passes on `crates/ecash-wallet/src/send.rs`, `crates/ecash-wallet/tests/proof_normalization.rs` and `crates/ecash-wallet/tests/send_operation.rs`. `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the explicit normalization helper and migrated `send.rs` boundary. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. G12 remains uncommitted and unpushed. G13 has not started.


### G13 — Migrate remaining save callers

Implemented on 2026-11-24. Audited and migrated all 83 remaining production `save_encrypted` call sites across 17 files so every production save caller explicitly invokes `normalize_proofs_for_persistence()` before saving:

- `crates/ecash-wallet/src/`: `receive.rs` (6), `swap.rs` (5), `restore.rs` (3), `history.rs` (3), `direct.rs` (7), `mint.rs` (5), `melt.rs` (20) — 49 sites (plus `send.rs` already migrated in G12).
- `crates/ecash-cli/src/`: `main.rs` (3 sites).
- `cashu-app/src-tauri/src/commands/`: `send.rs` (`save_ecash_for_later`, 1), `receive.rs` (2), `auth.rs` (2), `history.rs` (1), `wallet.rs` (4), `verify.rs` (1), `ecash_invoice.rs` (3), `spark.rs` (8), `stable.rs` (9) — 31 sites.

`WalletState::save_encrypted` itself is unchanged in G13; removing implicit normalization from raw persistence is left strictly for G14.

Verification:

- Automated workspace inventory check confirms **0 unmigrated production `save_encrypted` callers** remain anywhere in `crates/` or `cashu-app/src-tauri/src/` (outside `state.rs`/`storage.rs` and tests).
- Full Rust workspace: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 146 Rust tests, with zero failures, ignored or filtered tests and zero compiler warnings.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- `rustfmt --edition 2021 --check crates/ecash-wallet/src/receive.rs`, `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) with the completed caller-migration inventory. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. G13 remains uncommitted and unpushed. G14 has not started.


### G14 — Remove normalization from raw persistence

Implemented on 2026-11-24. Removed the implicit `normalize_proofs_for_persistence()` call from `WalletState::save_encrypted` in [state.rs](crates/ecash-wallet/src/state.rs) and tightened both `WalletState::save_encrypted(&self, ...)` and `WalletStorage::save(&mut self, state: &WalletState)` (plus `EncryptedFileStorage`) in [storage.rs](crates/ecash-wallet/src/storage.rs) to accept an immutable `&WalletState`. Raw persistence can no longer mutate domain state at compile time; all production callers normalize explicitly beforehand (migrated in G12–G13).

Updated [proof_normalization.rs](crates/ecash-wallet/tests/proof_normalization.rs), [send_operation.rs](crates/ecash-wallet/tests/send_operation.rs) and [wallet_storage.rs](crates/ecash-wallet/tests/wallet_storage.rs) to match the immutable `&WalletState` persistence signature and added `save_encrypted_does_not_mutate_domain_state_on_success_or_failure`, proving an immutable `&WalletState` saves without altering duplicate proofs on either success or write failure while explicit normalization + save round-trips preserve the characterized deduplication contract.

Verification:

- Full Rust workspace: `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` passes all 146 Rust tests (including all 6 `proof_normalization`, 4 `wallet_storage`, 7 `send_operation`, 6 `receive_operation` and 22 native tests), with zero failures, ignored or filtered tests and zero compiler warnings.
- All 379 frontend/payment tests pass with zero failures or skipped tests.
- `rustfmt --edition 2021 --check` passes on `crates/ecash-wallet/src/storage.rs`, `crates/ecash-wallet/tests/proof_normalization.rs`, `crates/ecash-wallet/tests/send_operation.rs` and `crates/ecash-wallet/tests/wallet_storage.rs`. `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

Updated [DESIGN.md](cashu-app/DESIGN.md) to reflect immutable raw persistence. Section G (G1–G14) is complete. No dependencies, release versions, wallet formats, public IPC signatures or frontend runtime/UI changed. G14 remains uncommitted and unpushed. H1 has not started.


### H1 — Add import-boundary checks for extracted frontend workflows

Implemented on 2026-11-24. Added an AST-based import-boundary checker at [check-import-boundaries.mjs](cashu-app/scripts/check-import-boundaries.mjs) using the already-installed `typescript` compiler API (zero new dependencies). It inspects static `import`, `import type`, `export ... from`, dynamic `import(...)` and `require(...)` specifiers without false positives on comments or string literals, and fails if any listed boundary file is missing:

- **18 extracted frontend workflow/service modules** (`scheduler`, `momoReview`, `momoRecovery`, `payoutInitiation`, `momoFulfillment`, `momoProcessing`, `walletReconciliation`, `sparkReconciliation`, `conversionSpendGuard`, `stableBalanceModel`, `transferAmount`, `transferError`, `sendEcashError`, `sparkConversionError`, `receivedTokenPreview`, `cashuRequests`, `qrPayment`, `ecashRequestHistory`): forbids React (`react`, `react-dom`, `react-router-dom`, `react-hot-toast`), Zustand/stores (`zustand`, `*/store/*`) and Tauri (`@tauri-apps/*`).
- **2 extracted React lifecycle hooks** (`useBitcoinReceive`, `useBitcoinSend`): allows React while forbidding Zustand/stores and Tauri.

Exposed `npm --prefix cashu-app run check:boundaries` in [package.json](cashu-app/package.json), wired it into the `Frontend and Release Checks` job in [.github/workflows/ci.yml](.github/workflows/ci.yml), and documented it in [CONTRIBUTING.md](CONTRIBUTING.md).

Verification:

- `npm --prefix cashu-app run check:boundaries` passes (20 files verified, 0 violations).
- [importBoundaries.test.mjs](cashu-app/tests/importBoundaries.test.mjs) adds 5 unit tests verifying the real repository passes, synthetic React/Zustand/store/Tauri imports across all syntax forms fail, comments/strings do not trigger false positives, lifecycle hooks allow React while rejecting stores/Tauri, and missing listed files fail.
- `npm --prefix cashu-app run test:payments` passes all 384 tests (0 failed, 0 skipped).
- `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No production runtime code, dependencies, release versions, wallet formats or UI changed. H1 remains uncommitted and unpushed. H2 has not started.


### H2 — Enforce no new explicit `any` in migrated native adapters

Implemented on 2026-11-24. Added an AST-based explicit-`any` checker at [check-no-explicit-any.mjs](cashu-app/scripts/check-no-explicit-any.mjs) using the already-installed `typescript` compiler API (`ts.SyntaxKind.AnyKeyword`, zero new dependencies). It flags explicit `any` across return types, parameters, generic type arguments (including `invoke<any>`), type assertions (`as any`), and interface/type fields without false positives on comments, identifiers or string literals, and fails if any listed adapter file is missing.

Covers **16 migrated native adapters and typed native wire contracts**: `src/store/wallet.ts`, `src/types/wallet.ts`, `src/types/sendEcash.ts`, `src/types/momo.ts`, `src/services/momoFulfillmentOperations.ts`, `src/services/momoProcessingAdapter.ts`, `src/services/momoTransactionAccess.ts`, `src/services/savedMomoRecoveryAdapter.ts`, `src/services/walletReconciliationAdapter.ts`, `src/services/savedEcashInvoices.ts`, `src/services/sendEcashError.ts`, `src/services/proxyBalanceService.ts`, `src/services/stableBalanceService.ts`, `src/services/updateService.ts`, `src/hooks/useTransactionProcessor.ts`, and `src/hooks/useEcashInvoice.ts`.

Exposed `npm --prefix cashu-app run check:no-any` in [package.json](cashu-app/package.json), wired it into the `Frontend and Release Checks` job in [.github/workflows/ci.yml](.github/workflows/ci.yml), and documented it in [CONTRIBUTING.md](CONTRIBUTING.md).

Verification:

- `npm --prefix cashu-app run check:no-any` passes (16 migrated native adapters verified, 0 violations).
- [noExplicitAny.test.mjs](cashu-app/tests/noExplicitAny.test.mjs) adds 4 unit tests verifying the real repository passes, synthetic `any` usages across fields/parameters/return types/generics/assertions are caught, comments/identifiers/strings do not trigger false positives, and missing listed files fail.
- `npm --prefix cashu-app run test:payments` passes all 388 tests (0 failed, 0 skipped).
- `npm --prefix cashu-app run check:boundaries`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No production runtime code, dependencies, release versions, wallet formats or UI changed. H2 remains uncommitted and unpushed. H3 has not started.


### H3 — Add formatting checks for migrated modules

Implemented on 2026-11-24. Added reproducible migrated-module formatting checks across both Rust and frontend without reformatting untouched legacy files or adding new dependencies:

- **Rust migrated modules** ([check-migrated-rust-format.sh](scripts/check-migrated-rust-format.sh)): runs `rustfmt --edition 2021 --check` over all 16 migrated G3–G14 wallet modules and integration tests (`proof_selection`, `outgoing`, `payment_quote`, `send_error`, `send`, `receive_input`, `receive`, `storage`, plus their 8 integration test files). Wired into the `Rust Tests` job in [.github/workflows/ci.yml](.github/workflows/ci.yml) with `components: rustfmt`.
- **Frontend migrated modules** ([check-migrated-format.mjs](cashu-app/scripts/check-migrated-format.mjs)): enforces UTF-8 without BOM, LF line endings, single trailing EOF newline, no trailing whitespace and space-only indentation across all 54 migrated frontend modules (20 boundary-checked workflows/hooks, migrated native adapters, 13 migrated shared/feature UI components and the new check scripts/tests). Trimmed existing trailing whitespace in `src/store/wallet.ts`, `src/types/momo.ts` and `src/components/shared/SafeQRCode.tsx`. Exposed as `npm --prefix cashu-app run check:format` in [package.json](cashu-app/package.json), wired into `Frontend and Release Checks` in [.github/workflows/ci.yml](.github/workflows/ci.yml), and documented in [CONTRIBUTING.md](CONTRIBUTING.md).

Verification:

- `sh scripts/check-migrated-rust-format.sh` passes (16 migrated Rust files verified).
- `npm --prefix cashu-app run check:format` passes (54 migrated frontend files verified).
- [migratedFormat.test.mjs](cashu-app/tests/migratedFormat.test.mjs) adds 3 unit tests verifying all 54 migrated frontend files pass, synthetic BOM/CRLF/trailing-whitespace/tab-indent/EOF issues are detected, and missing listed files fail.
- `npm --prefix cashu-app run test:payments` passes all 391 tests (0 failed, 0 skipped).
- `npm --prefix cashu-app run check:boundaries`, `npm --prefix cashu-app run check:no-any`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No runtime logic, dependencies, release versions, wallet formats or UI changed. H3 remains uncommitted and unpushed. H4 has not started.


### H4 — Record remaining duplicated UI and weak contracts

Audited on 2026-11-24 with AST and source scans across `cashu-app/src/` and `crates/ecash-wallet/src/` (no runtime code changes). Every residual item below names its concrete callers and a small follow-up task:

#### Remaining duplicated UI

| Issue | Concrete callers | Small follow-up task |
| --- | --- | --- |
| Direct `useBottomSheet` callers outside shared `BottomSheet` shell (9 files) | `src/components/history/TransactionDetailsModal.tsx`, `src/components/home/EcashModal.tsx`, `src/components/home/LightningAddressModal.tsx`, `src/components/home/MintInfoModal.tsx`, `src/components/home/PendingNwcModal.tsx`, `src/components/navigation/AddMintModal.tsx`, `src/components/shared/UpdateAppModal.tsx`, `src/features/bitcoin/BitcoinPaymentView.tsx` (legacy sheet), `src/features/momo/MomoTransferView.tsx` (legacy sheet) | Migrate one sheet per task to `BottomSheet` with `suspended` coverage for external loaders/results and keyboard/focus regression tests. |
| Direct `react-qr-code` callers outside `SafeQRCode` (4 files) | `src/components/home/LightningAddressModal.tsx`, `src/components/settings/LockedEcashSection.tsx`, `src/components/settings/NWCSection.tsx`, `src/features/bitcoin/BitcoinReceive.tsx` | Migrate static QR callers to `SafeQRCode` one screen at a time while preserving existing dimensions, framing, and copy actions. |
| Unmigrated eCash and conversion screen layouts/controls | `src/components/home/EcashModal.tsx`, `src/components/home/EcashRequestPayment.tsx`, `src/components/home/StableBalanceModal.tsx`, `src/pages/Ecash.tsx` | Decompose oversized screen responsibilities in H5 into named presentation/lifecycle follow-ups matching the Bitcoin/Mobile Money pattern. |

#### Remaining weak contracts

| Issue | Concrete callers | Small follow-up task |
| --- | --- | --- |
| Explicit `any` outside H2-enforced adapters (111 occurrences across 38 files; 0 in the 16 H2-enforced adapters) | Native hooks: `useNostr.ts` (9), `useIssue.ts` (8), `useHistory.ts` (7), `useScan.ts` (7), `useAuth.ts` (6), `useBitcoin.ts` (6), `useMintInfo.ts` (2), `useMints.ts` (2), `useEcash.ts` (1), `useHome.ts` (1); legacy services: `flowServices.ts` (6), `lightningService.ts` (6), `momoService.ts` (5), `proxyRequest.ts` (4), `currencyService.ts` (1), `lnurlService.ts` (1), `nostrService.ts` (1); UI/utils: `NWCSection.tsx` (4), `Pay.tsx` (3), `polyfills.ts` (3), `encryption.ts` (3), plus 1–2 each in 17 component/page/util files | Replace `catch (e: any)` with `unknown` and type native/HTTP payloads per module, then add each migrated module to `MIGRATED_NATIVE_ADAPTERS` in `cashu-app/scripts/check-no-explicit-any.mjs`. |
| Untyped `invoke(...)` calls without generic `<T>` return type (62 calls across 21 files) | `NWCSection.tsx` (8), `useAuth.ts` (7), `stableBalanceService.ts` (7), `NostrSection.tsx` (4), `useScan.ts` (4), `sparkService.ts` (4), `useBitcoin.ts` (3), `useIssue.ts` (3), `useNostr.ts` (3), `flowServices.ts` (3), `useHistory.ts` (2), `useMints.ts` (2), `BiometricToggle.tsx` (2), `nwcStore.ts` (2), plus 1 each in `App.tsx`, `EcashModal.tsx`, `EcashRequestPayment.tsx`, `WalletBalanceCard.tsx`, `WalletManagementSection.tsx`, `useHome.ts`, `savedEcashInvoices.ts` | Add explicit return-type generics (`invoke<void>` or named response interfaces) per caller module and extend H2 checks to reject untyped `invoke` in migrated adapters. |
| Rust spent-token restore save errors discarded with `.ok()` | `crates/ecash-wallet/src/receive.rs` (3 branches inside `is_spent && invoice.is_none()`) | Apply G2's unknown-outcome recovery-save reporting policy to spent-token restore saves with dedicated wallet tests. |
| Concrete `path`/`passphrase` persistence in non-send wallet operations | `crates/ecash-wallet/src/receive.rs`, `swap.rs`, `melt.rs`, `restore.rs`, `history.rs`, `direct.rs`, `mint.rs` | Inject `WalletStorage` into `receive.rs` and `swap.rs` one operation at a time so recovery-save failures are testable without filesystem faults. |

Verification:

- Counts and caller lists were generated directly via TypeScript AST (`ts.SyntaxKind.AnyKeyword` and `invoke` call-expression inspection) and source scans on the current working tree.
- `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No runtime code, dependencies, release versions, wallet formats or UI changed. H4 remains uncommitted and unpushed. H4a has not started.


### H4a — Inventory mixed static/dynamic Tauri-event and Nostr imports

Audited on 2026-11-24 via a fresh `npm --prefix cashu-app run build` (Vite 7.3.7) and source inspection (no runtime code changes). Vite reported exactly two mixed static/dynamic import warnings:

1. **`@tauri-apps/api/event` (`node_modules/@tauri-apps/api/event.js`)**
   - **Dynamic importer (1 caller):**
     - `cashu-app/src/hooks/useAuth.ts:21` — `import('@tauri-apps/api/event').then(({ listen }) => ...)` in a mount `useEffect` subscribing to `restore-progress` (retains last 50 log lines; guards unmount via `isMounted` + `unlistenFn`).
   - **Static importers (2 callers):**
     - `cashu-app/src/pages/Home.tsx:12` — subscribes on mount to `nwc_delayed_request_added` and `nwc_queue_updated` with unmount cleanup.
     - `cashu-app/src/components/settings/WalletManagementSection.tsx:4` — subscribes on mount to `clean-wallet-progress` with unmount cleanup.
   - **Loading/subscription requirement (for H4b):** `@tauri-apps/api/event` is a lightweight Tauri IPC helper already statically loaded by `Home.tsx` and `WalletManagementSection.tsx`. `useAuth.ts` subscribes immediately on mount (not lazily on user action) and needs `restore-progress` registered before restore starts. Converting `useAuth.ts` to a static `import { listen } from '@tauri-apps/api/event'` resolves the warning while preserving `isMounted` cleanup and removing the unnecessary dynamic-import delay.

2. **`nostr-tools` (`node_modules/nostr-tools/lib/esm/index.js`)**
   - **Dynamic importers (2 bundled sites + 2 unbundled legacy sites):**
     - `cashu-app/src/components/home/EcashModal.tsx:142` (`handleSend` — `await import('nostr-tools')` for `nip19.decode` on `npub` input) and `cashu-app/src/components/home/EcashModal.tsx:275` (`pubkeyField` `onChange` — `import('nostr-tools').then(...)` for `nip19.decode`).
     - `cashu-app/src/components/home/SendEcashModal.tsx:51` and `230` (same `nip19.decode` pattern; not currently in the Vite entry graph, noted for consistency in H4c).
   - **Static importers (9 bundled callers):**
     - `cashu-app/src/hooks/useNostr.ts:3` (`SimplePool`, `nip19` — required on `Home` mount for Nostr identity and background token claim inbox), `cashu-app/src/services/nostrService.ts:3`, `cashu-app/src/services/invoiceInbox.ts:1`, `cashu-app/src/services/ecashInvoice.ts:3`, `cashu-app/src/services/qrPayment.ts:2`, `cashu-app/src/services/cashuRequests.ts:6`, `cashu-app/src/hooks/useEcashInvoice.ts:3`, `cashu-app/src/components/settings/NostrSection.tsx:6`, `cashu-app/src/components/settings/LockedEcashSection.tsx:6`.
   - **Loading/subscription requirement (for H4c):** `nostr-tools` is required eagerly on `Home` via `useNostr` and statically by invoice/request/settings modules, so dynamic `import('nostr-tools')` in `EcashModal.tsx` (and `SendEcashModal.tsx`) cannot split it into a separate chunk. Replacing those dynamic imports with static `import { nip19 } from 'nostr-tools'` eliminates the Vite warning and removes the async race in `onChange` while preserving inbox, invoice transport, and `npub` decoding behavior.

Verification:

- `npm --prefix cashu-app run build` succeeded (`✓ built in 5.48s`) and emitted the exact two warnings above.
- `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No runtime code, dependencies, release versions, wallet formats or UI changed. H4a remains uncommitted and unpushed. H4b has not started.


### H4b — Resolve the Tauri-event import inconsistency

Implemented on 2026-11-24. Replaced the dynamic `import('@tauri-apps/api/event')` inside the mount `useEffect` of [useAuth.ts](cashu-app/src/hooks/useAuth.ts) with a static `import { listen } from '@tauri-apps/api/event'`, matching `Home.tsx` and `WalletManagementSection.tsx`. The `restore-progress` subscription, 50-line log cap, `isMounted` guard, and `unlistenFn()` unmount cleanup are preserved verbatim.

Verification:

- `npm --prefix cashu-app run build` succeeded (`✓ built in 4.40s`); the `@tauri-apps/api/event.js` mixed static/dynamic import warning is gone (only the `nostr-tools` mixed-import warning remained for H4c).
- `npm --prefix cashu-app run test:payments` passes all 391 tests (0 failed, 0 skipped).
- `npm --prefix cashu-app run check:boundaries`, `npm --prefix cashu-app run check:no-any`, `npm --prefix cashu-app run check:format`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No dependencies, release versions, wallet formats or UI changed. H4b remains uncommitted and unpushed. H4c has not started.


### H4c — Resolve the Nostr import inconsistency

Implemented on 2026-11-24. Replaced the dynamic `import('nostr-tools')` calls in [EcashModal.tsx](cashu-app/src/components/home/EcashModal.tsx) (lines 142 and 275) and [SendEcashModal.tsx](cashu-app/src/components/home/SendEcashModal.tsx) (lines 51 and 230) with static `import { nip19 } from 'nostr-tools'`. In both `pubkey` input `onChange` handlers, decoding `npub` synchronously before `setPubkey(val)` also removes the previous async `.then(...)` race while preserving exact `npub` decoding and 64-hex `02`-prefix normalization.

Verification:

- `npm --prefix cashu-app run build` succeeded (`✓ built in 4.69s`) with **zero** mixed static/dynamic import warnings (both `@tauri-apps/api/event` and `nostr-tools` warnings are gone; only the >500 kB chunk advisory remains for H4d/H4e).
- `npm --prefix cashu-app run test:payments` passes all 391 tests (including `invoiceInbox.test.mjs`, `nostrInvoiceTransport.test.mjs`, and `ecashInvoice.test.mjs`; 0 failed, 0 skipped).
- `npm --prefix cashu-app run check:boundaries`, `npm --prefix cashu-app run check:no-any`, `npm --prefix cashu-app run check:format`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No dependencies, release versions, wallet formats or UI changed. H4c remains uncommitted and unpushed. H4d has not started.


### H4d — Record frontend bundle and startup measurements

Measured on 2026-11-24 against the clean H4c production build (`npm --prefix cashu-app run build`, Vite 7.3.7, `dist/` assets + Rollup `generateBundle` module-size audit; no runtime code changes).

#### Emitted bundle assets (raw / gzip)

| Asset | Type | Raw size | Gzip size (zlib lvl 9) | Startup request behavior |
| --- | --- | --- | --- | --- |
| `dist/index.html` | HTML | 4.23 kB | 1.39 kB | Initial document; references `index-B6f5Hu4m.js` and `index-KUApQF3r.css` |
| `dist/assets/index-B6f5Hu4m.js` | Entry JS | 1,771,159 B (1,729.65 KiB) | 553,863 B (540.88 KiB) | **Eagerly loaded at startup** (triggers Vite's >500 kB chunk advisory) |
| `dist/assets/index-KUApQF3r.css` | Entry CSS | 197,592 B (192.96 KiB) | 46,705 B (45.61 KiB) | **Eagerly loaded at startup** |
| `dist/assets/breez_sdk_spark_wasm_bg-XksWtBXg.wasm` | WASM | 12,650,256 B (12,353.77 KiB) | 5,200,347 B (5,078.46 KiB) | **Lazy** — not in `index.html`; fetched only when `sparkService.ts` calls `ensureWasmInitialized()` / `initBreezSDK()` |
| 5 existing lazy JS chunks (`index-CnN4Z-KK.js`, `index-2Z5poqCj.js`, `index-DLC7xqLp.js`, `index-DsedYutx.js`, `index-LlueUwvy.js`) | Lazy JS | 66,950 B total | 16,857 B total | Loaded on demand (Spark IndexedDB helpers, `@tauri-apps/plugin-fs`, `plugin-dialog`, `plugin-opener`) |
| 63 bundled Fontsource `.woff`/`.woff2` files | Fonts | 1,023,260 B total | — | Loaded on demand by CSS `@font-face` rules (plus Google Fonts stylesheet in `index.html`) |

#### Largest contributors inside the eager entry chunk (pre-minification rendered bytes = 4,096,955 B)

| Package / source | Rendered bytes | Share of entry | Notes |
| --- | --- | --- | --- |
| `app-src` (all 16 eagerly imported routes in `App.tsx`) | 1,081,557 B | 26.4% | Every route in `App.tsx` is statically imported |
| `react-dom` | 561,393 B | 13.7% | Core runtime |
| `motion-dom` + `framer-motion` | 391,016 B | 9.6% | Page transitions and animated mint picker |
| `nostr-tools` | 250,948 B | 6.1% | Needed on `Home` mount via `useNostr` |
| `crypto-js` | 248,202 B | 6.1% | Encryption/hashing |
| `@breeztech/breez-sdk-spark` (JS glue) | 154,746 B | 3.8% | Statically imported by `sparkService.ts` even though its WASM initializes lazily |
| `@noble/curves` | 117,986 B | 2.9% | Crypto primitives |
| `@cashu/cashu-ts` | 111,707 B | 2.7% | Cashu protocol |
| `bignumber.js` | 94,381 B | 2.3% | Numeric math |
| `webrtc-adapter` + `@yudiel/react-qr-scanner` | 162,748 B | 4.0% | Camera QR scanner; only needed when user opens scanner (`Scan`, `Pay`, `BitcoinPaymentView`, `EcashModal`) |

#### Startup behavior notes
- Before unlock (`!isInitialized`), `App.tsx` renders `<Auth />`, calls `useNostr()`, and invokes `is_wallet_unlocked`, but the browser still parses the entire 1.77 MB `index-*.js` entry bundle because all 16 routes and heavy optional dependencies (QR camera scanner, Spark SDK JS glue) are statically imported.
- Spark's 12.65 MB WASM is already deferred until `ensureWasmInitialized()`, but its JS glue and the camera QR scanner (`@yudiel/react-qr-scanner` + `webrtc-adapter`) are strong, low-risk split candidates for H4e.

Verification:

- Measurements reproduced directly from `cashu-app/dist/` (built with `npm --prefix cashu-app run build`) and Vite/Rollup `generateBundle` inspection.
- `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No runtime code, dependencies, release versions, wallet formats or UI changed. H4d remains uncommitted and unpushed. H4e has not started.


### H4e — Split one measured startup dependency into a lazy chunk

Implemented on 2026-11-24. Split the camera QR scanner dependency (`@yudiel/react-qr-scanner` + `webrtc-adapter` + barcode-detector) out of the eager entry bundle into a lazy chunk via a shared [LazyQrScanner.tsx](cashu-app/src/components/shared/LazyQrScanner.tsx) wrapper (`React.lazy` + `<Suspense fallback={null}>`, using `import type` so zero runtime code is statically imported). Migrated all five QR scanner callers to `LazyQrScanner`: [BitcoinPaymentView.tsx](cashu-app/src/features/bitcoin/BitcoinPaymentView.tsx), [EcashModal.tsx](cashu-app/src/components/home/EcashModal.tsx), [RedeemNoteForm.tsx](cashu-app/src/components/scan/RedeemNoteForm.tsx), [ScanNoteForm.tsx](cashu-app/src/components/scan/ScanNoteForm.tsx), and [Pay.tsx](cashu-app/src/pages/Pay.tsx).

#### Measured before/after bundle sizes (`npm --prefix cashu-app run build`, zlib level 9)

| Metric | Before (H4d) | After (H4e) | Delta |
| --- | --- | --- | --- |
| Entry JS raw (`index-*.js`) | 1,771,159 B | 1,621,626 B | **-149,533 B (-8.4%)** |
| Entry JS gzip (`index-*.js`) | 553,863 B | 494,282 B | **-59,581 B (-10.8%)** |
| New lazy QR scanner chunk (`index.esm-BfxTe9r7.js`) | — | 149,528 B raw / 60,309 B gzip | Loaded only when user opens camera scanner |

#### Remaining SDK-size tradeoffs (Vite default 500 kB `chunkSizeWarningLimit` kept unchanged)
- The entry chunk remains above Vite's 500 kB advisory because `App.tsx` statically imports all 16 routes together with `react-dom`, `framer-motion`/`motion-dom`, `nostr-tools` (required on `Home` mount via `useNostr`), `crypto-js`, `@cashu/cashu-ts`, and `@breeztech/breez-sdk-spark` JS glue (its 12.65 MB WASM is already lazily fetched by `ensureWasmInitialized()`). Further reductions require route-level `React.lazy` splitting in `App.tsx` and/or lazy-loading the Spark JS glue inside `sparkService.ts` as separate follow-ups rather than raising warning thresholds.

Verification:

- `npm --prefix cashu-app run build` succeeded (`✓ built in 5.18s`) with zero mixed-import warnings and the measured entry JS reduction above.
- `npm --prefix cashu-app run test:payments` passes all 391 tests (0 failed, 0 skipped).
- `npm --prefix cashu-app run check:boundaries`, `npm --prefix cashu-app run check:no-any`, `npm --prefix cashu-app run check:format`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No dependencies, release versions, wallet formats, Vite warning thresholds or UI presentation changed. H4e remains uncommitted and unpushed. H5 has not started.


### H5 — Review eCash and conversion screens using the established patterns

Reviewed on 2026-11-24 with no runtime code changes. Both `pages/SendEcash.tsx` (15L) / `pages/ReceiveEcash.tsx` (15L) and `pages/TransferFunds.tsx` (27L) are already thin route entries, while the underlying form/modal components retain oversized mixed responsibilities:

- **`components/home/EcashModal.tsx` (698L, 24 `useState`, 3 `useEffect`, 2 `invoke`, 3 store hooks, raw `useBottomSheet`, no `PaymentPageLayout`):** mixes page/sheet shell layout, Send eCash entry + outgoing token/UR share view, Receive eCash entry + preview + invoice sub-tab, clipboard/scanner/UR state, `SovereignStampOverlay` celebration state, and direct `invoke('save_ecash_for_later')` calls.
- **`components/home/SendEcashModal.tsx` (282L, 10 `useState`):** legacy send-only modal duplicating `EcashModal`'s send flow (not referenced by active routes).
- **`components/home/EcashRequestPayment.tsx` (180L, 5 `useState`, 5 `useEffect`, 6 `invoke`):** couples NUT-18 payment-request quoting/validation/execution directly to native `invoke` calls inside the view.
- **`components/home/TransferFundsForm.tsx` (284L, 12 `useState`, 4 `useEffect`, 6 store reads):** already uses `PrimaryActionButton` (D9) and pure domain services (`stableBalanceModel`, `conversionSpendGuard`, `transferAmount`, `transferError`), but still combines entry, review/quote refresh, progress/recovery, and store/service orchestration in one component without `PaymentPageLayout`.

#### Planned individually testable follow-up tasks (deferred; not edited in H5)

| ID | Scope | Target files | Acceptance / test boundary |
| --- | --- | --- | --- |
| EC1 | Confirm whether `SendEcashModal.tsx` has any remaining caller; remove dead duplicate or document its mount. | `src/components/home/SendEcashModal.tsx` | Build + grep confirm zero broken imports; no behavior change. |
| EC2 | Migrate `EcashModal` page branch to `PaymentPageLayout` and sheet branch to `BottomSheet` under `src/features/ecash/`. | `src/components/home/EcashModal.tsx` → `src/features/ecash/` | Preserves header visibility, animated mint picker, `EcashFields.css` inset focus borders, and safe areas at phone/desktop viewports. |
| EC3 | Extract pure `EcashSendView` (entry + outgoing V3/V4/UR share presentation). | `src/features/ecash/EcashSendView.tsx` | Contract + browser tests verify no store/native/clipboard imports and identical send UI. |
| EC4 | Extract pure `EcashReceiveView` (token input, `ReceivedTokenPreview`, scanner slot, `EcashReceiveInvoice` tab). | `src/features/ecash/EcashReceiveView.tsx` | Contract + browser tests verify claim/save-for-later actions and focus styling without native imports. |
| EC5 | Extract `useEcashSend` and `useEcashReceive` lifecycle hooks with injected native/clipboard/UR adapters. | `src/features/ecash/useEcashSend.ts`, `useEcashReceive.ts` | Covered by H1 boundary checks (no store/Tauri imports) and synthetic race/duplicate-guard tests. |
| EC6 | Move `EcashRequestPayment` native `invoke` calls behind a typed adapter added to H2's `check:no-any` list. | `src/components/home/EcashRequestPayment.tsx` | Zero untyped `invoke` / `any`; existing payment-request review/cap tests pass. |
| CV1 | Migrate `TransferFunds` page shell to `PaymentPageLayout` preserving `PrimaryActionButton` footer/short-screen sizing. | `src/pages/TransferFunds.tsx`, `src/components/home/TransferFundsForm.tsx` | Existing `test:conversion-primary` and phone/desktop layout checks pass. |
| CV2 | Extract pure `TransferEntry`, `TransferReview`, and `TransferProgress` presentations under `src/features/conversion/`. | `src/features/conversion/*` | Contract tests prove zero store/service/provider imports; review/fee/ceiling copy preserved. |
| CV3 | Extract `useTransferFunds` lifecycle hook injecting `stableBalanceService` and store snapshots. | `src/features/conversion/useTransferFunds.ts` | Covered by H1 boundary checks and synthetic quote-refresh/repricing/recovery tests. |

Verification:

- Line, state, effect, `invoke`, and primitive-usage counts were measured directly on the current working tree.
- `git diff --check` and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.

No runtime code, dependencies, release versions, wallet formats or UI changed. H5 remains uncommitted and unpushed. H6 has not started.


### H6 — Verify affected UI at phone and desktop sizes

Verified on 2026-11-24 in isolated headless Chrome across **18 real-Chrome browser suites (410 browser assertions)** covering phone (`320×568`, `390×480`, `390×844`) and desktop (`1024×844`) viewports, dark and light themes, keyboard navigation, focus management, long-text/UTF-8 boundaries, and pending/error/empty states:

- **Shared controls & shells:** `safeQRCode.test.mjs` (dark/light at 390px & 1024px, empty/unicode/emoji 2,000-byte UTF-8 bounds, render-error recovery), `bottomSheetShell.test.mjs`, `actionMenu.test.mjs` (320×568, 390×480, 1024×844, dark/light, Tab containment, Escape focus return, missing-mint empty guard), `pageHeader.test.mjs` (dark/light 390px & 1024px, focus contrast, back navigation), `mintBalancePicker.test.mjs`, `ecashMintPicker.test.mjs`, `bitcoinMintPicker.test.mjs`, `momoMintPicker.test.mjs`.
- **Bitcoin & scanner flows (affected by H4e `LazyQrScanner`):** `bitcoinPageLayout.test.mjs`, `bitcoinDestinationEntry.test.mjs`, `bitcoinDestinationField.test.mjs` (38/38 passing across page/legacy, dark/light, 390×844 / 390×480 / 1024×844, clipboard empty/error, LNURL checking/invalid/valid, insufficient balance, FormField label & Tab order, scanner error/cancel/result), `bitcoinReceive.test.mjs`, `bitcoinSendLifecycle.test.mjs`.
- **Mobile Money & reconciliation flows:** `momoPageLayout.test.mjs`, `momoEntryForm.test.mjs`, `momoReview.test.mjs`, `momoSavedTransfers.test.mjs` (empty/review hiding, resume, foreground guard), `walletReconciliation.test.mjs`.

**Bug caught and fixed by H6 browser verification:**
- `bitcoinDestinationField.test.mjs` initially failed its page and legacy scanner-open assertions (`fixture-scanner` not yet mounted 60ms after click) because React 19 throttles initial `React.lazy`/`<Suspense>` reveal transitions by 300ms. Updated [LazyQrScanner.tsx](cashu-app/src/components/shared/LazyQrScanner.tsx) to load `@yudiel/react-qr-scanner` via a cached `useEffect` dynamic import instead of `React.lazy`/`Suspense`, preserving the exact `-149.5 kB` lazy chunk split (`index.esm-BJGA2Rkw.js`: 149.53 kB; entry `index-BEk0oXH4.js`: 1,621.75 kB) while eliminating the 300ms reveal delay. Rebuilding and rerunning `bitcoinDestinationField.test.mjs` passed 38/38 with zero test edits.

Verification:

- All 18 real-Chrome browser suites passed (**410 passed**, 0 failed, 0 skipped).
- `npm --prefix cashu-app run build`, `git diff --check`, and both 0.1.20 release checks (`node scripts/check-release.mjs` and `--history`) pass.
- Limitation: isolated Chrome fixtures verify rendered layout, styles, keyboard, focus, and synthetic boundaries; they do not replace physical mobile WebView/OS-keyboard or screen-reader testing.

H6 remains uncommitted and unpushed. H7 has not started.


### H7 — Run the full required-check set

Completed on 2026-11-24 against the current working tree on `clean` (HEAD `674b14b` plus uncommitted H1–H6 and the user-requested scanner responsiveness / Send eCash scanner UX fixes). All local required checks, guardrails, production build, frontend payment tests, and Rust workspace tests passed with zero failures, zero skipped/ignored tests, and zero suppressed checks:

| Required check | Result | Evidence |
| --- | --- | --- |
| `sh scripts/check-migrated-rust-format.sh` | Passed | All 16 migrated Rust files formatted cleanly (`rustfmt --edition 2021 --check`). |
| `npm --prefix cashu-app run check:format` | Passed | All 54 migrated frontend files passed formatting hygiene checks. |
| `npm --prefix cashu-app run check:boundaries` | Passed | All 20 workflow services and lifecycle hooks passed import-boundary checks. |
| `npm --prefix cashu-app run check:no-any` | Passed | All 16 migrated native adapters/contracts passed explicit-`any` checks. |
| `git diff --check` | Passed | Zero whitespace or conflict-marker issues. |
| `npm --prefix cashu-app run check:release` | Passed | Release `0.1.20`: versions match; 511 public text files passed file/credential hygiene checks. |
| `node scripts/check-release.mjs --history` | Passed | Release `0.1.20`: git history and working tree passed hygiene checks. |
| `npm --prefix cashu-app run build` | Passed | `tsc` + Vite production build (`✓ built in 4.50s`); zero mixed-import warnings; entry JS `index-BRdzH41Q.js` (`1,623.41 kB` raw / `495.75 kB` gzip), lazy QR chunk `index.esm-DIPwr2FP.js` (`149.53 kB` raw / `60.38 kB` gzip), lazy Spark WASM `spark_bindings_bg-*.wasm` (`12,650.26 kB` raw / `5,223.01 kB` gzip). Vite's default 500 kB chunk-size advisory remains unchanged and unsuppressed (documented in H4d/H4e). |
| `npm --prefix cashu-app run test:payments` | Passed | **391 passed**, 0 failed, 0 skipped, 0 cancelled. |
| `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` | Passed | **146 passed**, 0 failed, 0 ignored across 34 test/doc-test binaries; 0 compiler warnings (executed with local port access for localhost mock-mint integration tests). |

**Scope notes:**
- The 18 real-Chrome browser suites (**410 passed**, 0 failed, 0 skipped) were run in H6 on the same working tree prior to the user-requested scanner CSS/button adjustments (`ScanNoteForm.tsx`, `Scan.css`, `EcashModal.tsx`, `Pay.tsx`).
- Online dependency audits (`npm audit`, `cargo audit`) require network access and were not executed in this offline environment; CI runs them online.

No runtime code, dependencies, release versions, warning thresholds, or tests were modified or suppressed in H7. H7 remains uncommitted and unpushed. H8 has not started.


### H8 — Final reassessment of all seven categories

Completed on 2026-11-24 against the current working tree on `clean` (HEAD `674b14b` plus uncommitted H1–H7 and the user-requested scanner UX improvements), compared against the initial `65ce5ea` baseline (`6/10`).

**Reassessed overall rating: 8/10** (equal-weight average: `57 / 7 = 8.14`, with no category below 8).

Per Section 2 ("A 9/10 reassessment should average at least 9 with no category below 8... Finishing a checklist alone does not guarantee that rating"), the codebase has made a substantial, verified jump from `6/10` to `8/10`, but **does not yet earn 9/10** because eCash and conversion screens, `MomoTransferView.tsx`, non-migrated `any`/untyped `invoke` boundaries, and the remaining UI duplicates are inventoried rather than fully migrated.

#### Reassessed scorecard

| Dimension | Baseline (`65ce5ea`) | Reassessed (2026-11-24) | Evidence & remaining gap |
| --- | :---: | :---: | --- |
| Readability and naming | 6/10 | **8/10** | `MomoPaymentForm` (74L) now composes `MomoEntryForm` (107L), `MomoReview` (62L), and `MomoSavedTransfers` (32L); `BitcoinPaymentView` dropped from `1,090L` (`BitcoinModal.tsx`) to `445L` with explicit entry/review/lifecycle modules; route screens (`BitcoinScreen`, `MomoTransferScreen`) are separated from modal wrappers; A3/A4 comments/docs repaired; H3 enforces formatting on 54 frontend and 16 Rust files. **Gap:** `MomoTransferView.tsx` (958L) and `EcashModal.tsx` (758L) remain large mixed-mode files. |
| Cohesion and single responsibility | 5/10 | **8/10** | Rust `send.rs` (145L) and `receive.rs` (274L) delegate to `crates/ecash-wallet/src/send.rs` (378L) and `receive.rs` (262L); `storage.rs` (162L) isolates encrypted persistence and raw saves no longer mutate domain state (G3–G14); `useTransactionProcessor.ts` is 22L of pure lifecycle wiring (F1–F9). **Gap:** `MomoTransferView.tsx` (958L), `EcashModal.tsx` (758L), `WalletBalanceCard.tsx` (636L), and `TransferFundsForm.tsx` (283L) still mix multiple concerns (EC1–EC6, CV1–CV3). |
| Architecture and dependency direction | 6/10 | **8/10** | 18 frontend workflow services and 2 lifecycle hooks are decoupled from React, Zustand, stores, and Tauri, enforced in CI by `check:boundaries` (H1); Rust send/receive run without Tauri state with injectable `WalletStorage` (G6, G8, G10); Vite mixed-import warnings eliminated (H4b/H4c); QR scanner split into a lazy `-149.5 kB` chunk (H4e). **Gap:** non-migrated screens and non-send/receive Rust commands still couple directly to stores/Tauri/concrete storage; initial entry JS remains `1,623 kB` raw / `496 kB` gzip due to static route and Spark JS glue imports in `App.tsx` (H4d/H4e). |
| Types, invariants, and errors | 6/10 | **8/10** | Typed `wallet_info` and refresh transaction contracts with fixture checks (C1–C3); structured `send_ecash_v2` error codes (C4–C6); localized provider-error parser (C7); Rust `ConversionStage` enum verified against TypeScript (C8–C9); explicit unavailable proxy balance (C10); durability failure surfacing (G1–G2); explicit proof normalization (G11–G14); CI-enforced `check:no-any` on 16 migrated native adapters (H2). **Gap:** `109` explicit `any` across `38` non-migrated frontend files, `117` `invoke` calls across `28` files (62+ untyped), 3 spent-token `.ok()` saves in `receive.rs`, and public mutable `WalletState` fields (H4). |
| Navigation and feature organization | 5/10 | **8/10** | `CONTRIBUTING.md` maps routes, features, workflows, native adapters, and storage (B1); Bitcoin (`src/features/bitcoin/`) and Mobile Money (`src/features/momo/`) own dedicated feature folders with thin route wrappers (B4–B8); 22 shared controls live in `src/components/shared/`. **Gap:** eCash (`EcashModal.tsx`, `SendEcashModal.tsx`, `EcashRequestPayment.tsx`) and conversion (`TransferFundsForm.tsx`) still live under `src/components/home/` (EC2, CV2). |
| UI reuse and component design | 7/10 | **8/10** | `DESIGN.md` typography aligned with `App.css` (D1); `PageHeader` and `SlidingSegmentedControl` use semantic tokens (D2–D3); one unified animated `MintBalancePicker` serves all payment pages (D4–D6); `PrimaryActionButton`, `IconButton`, `FormField`, `SafeQRCode`, `PaymentPageLayout`, `BottomSheet`, and `LazyQrScanner` are contract- and browser-tested (D7–D16, E1–E6, H4e). **Gap:** 9 direct `useBottomSheet` callers, 4 direct `react-qr-code` callers, concrete colors in `TransferFundsForm.css`, and unmigrated eCash/conversion layout shells (H4/H5). |
| Tests and verification | 7/10 | **9/10** | Frontend payment/unit/contract suite grew from `165` to **391 passing** (44 files, 0 failed, 0 skipped) using ordinary fakes; Rust workspace suite grew from `73` to **146 passing** (34 binaries, 0 failed, 0 ignored, 0 warnings); **18 real-Chrome browser suites (410 assertions passed)** cover phone/desktop, dark/light, keyboard/focus, and error/empty states; CI enforces boundaries, no-`any`, migrated formatting, and `0.1.20` release/history hygiene. **Gap:** isolated Chrome fixtures do not replace physical mobile WebView/screen-reader audits; browser suites require sequential execution (`--test-concurrency=1`); `npm audit`/`cargo audit` run online in CI. |

#### Concrete remaining path from 8/10 to 9/10

1. **Finish eCash & conversion feature migrations (H5: `EC1–EC6`, `CV1–CV3`)** and decompose `MomoTransferView.tsx` (958L) so every primary payment flow matches the `features/` architecture and `PaymentPageLayout` pattern.
2. **Close remaining boundary gaps (H4):** expand `check:no-any` and typed `invoke` wrappers across the remaining 38 frontend files, handle the 3 remaining spent-token `.ok()` saves in `receive.rs`, and narrow `WalletState` mutation surfaces.
3. **Retire remaining UI duplicates (H4):** migrate the 9 direct `useBottomSheet` callers, 4 direct `react-qr-code` callers, and concrete colors in `TransferFundsForm.css`.
4. **Reduce initial entry JS below Vite's 500 kB advisory (H4d/H4e):** lazy-load routes in `App.tsx` and/or Spark JS glue in `sparkService.ts` without raising warning thresholds.

H8 changes documentation only (`code_review.md`). No runtime code, dependencies, release versions, warning thresholds, or tests changed. H8 remains uncommitted and unpushed.


### Post-H8 closure — Remaining 8/10 → 9/10 gaps resolved

Completed on 2026-11-24 following H8. Addressed all four remaining pillars that separated the codebase from a defensible **9/10**:

1. **Bundle size & lazy loading (ZERO Vite warnings, default 500 kB limit unchanged):**
   - Lazy-loaded all 15 secondary routes in [App.tsx](cashu-app/src/App.tsx) with `React.lazy`/`Suspense`.
   - Split `@breeztech/breez-sdk-spark/web` JS glue into a dynamic import inside [sparkService.ts](cashu-app/src/services/sparkService.ts) (`70.53 kB` lazy chunk; 12.65 MB WASM remains lazy).
   - Configured `manualChunks` and `cssCodeSplit: false` in [vite.config.ts](cashu-app/vite.config.ts) so initial entry JS dropped from **`1,623.41 kB` raw / `495.75 kB` gzip** to **`497.38 kB` raw / `158.61 kB` gzip** (**-69.4% raw / -68.0% gzip**), with zero Vite chunk-size or mixed-import warnings.
2. **eCash (`EC1–EC6`), conversion (`CV1–CV3`), `MomoTransferView`, and `WalletBalanceCard`:**
   - Removed unused `SendEcashModal.tsx` duplicate (`EC1`).
   - Migrated eCash to `src/features/ecash/` (`EcashScreen.tsx`, `EcashSendView.tsx`, `EcashReceiveView.tsx`) and moved `EcashRequestPayment`'s 6 native `invoke` calls + `save_ecash_for_later` behind typed [ecashNativeAdapter.ts](cashu-app/src/services/ecashNativeAdapter.ts) (`EC2–EC6`), preserving compatibility re-export in `EcashModal.tsx`.
   - Migrated conversion to `src/features/conversion/` (`TransferFundsScreen.tsx`, `TransferEntry.tsx`, `TransferReview.tsx`, `TransferProgress.tsx`, `CV1–CV3`) and replaced concrete colors in [TransferFundsForm.css](cashu-app/src/components/home/TransferFundsForm.css) with semantic theme tokens.
   - Decomposed [MomoTransferView.tsx](cashu-app/src/features/momo/MomoTransferView.tsx) (`958L → 435L`, extracting `MomoProgressBody.tsx` and migrating its sheet branch to `BottomSheet`) and [WalletBalanceCard.tsx](cashu-app/src/components/home/WalletBalanceCard.tsx) (`636L → 360L`, extracting `WalletMintDropdown.tsx` and `useAnimatedFiatBalance.ts`).
3. **Remaining UI duplicates:**
   - Migrated all 4 direct `react-qr-code` callers (`BitcoinReceive.tsx`, `LightningAddressModal.tsx`, `NWCSection.tsx`, `LockedEcashSection.tsx`) to `SafeQRCode` (**0** remaining direct callers outside `SafeQRCode.tsx`).
   - Migrated `LightningAddressModal`, `MintInfoModal`, `PendingNwcModal`, `AddMintModal`, `UpdateAppModal`, `TransactionDetailsModal`, and `MomoTransferView` to `BottomSheet` (only the legacy redirect-only compatibility branches of `BitcoinPaymentView` and `EcashScreen` that host body-portal `MintBalancePicker` retain `useBottomSheet`).
4. **Remaining boundary gaps (frontend & Rust):**
   - Eliminated all **58+** untyped `invoke(` calls across the frontend (**0** remaining).
   - Reduced explicit `any` from **109 across 38 files** to **14 across 7 non-adapter UI/utility files** (**-87.2%**), and expanded CI-enforced `check:no-any` from `16` to **36** native adapters/services/hooks (and `check:format` from `54` to **74** files).
   - Replaced all 3 spent-token `.ok()` saves in [crates/ecash-wallet/src/receive.rs](crates/ecash-wallet/src/receive.rs) with explicit save-failure diagnostics.
   - Added narrow domain mutators (`set_default_nostr_key`, `ensure_mint`, `credit_proofs`, `record_transaction`, `find_transaction_mut`, `advance_derivation_index_past_proofs`) to [WalletState](crates/ecash-wallet/src/state.rs) and adopted them in `receive.rs` and `commands/receive.rs`.

#### Updated Scorecard (**9/10 overall**)

| Dimension | Initial (`65ce5ea`) | Post-H8 (`15503fc`) | Final (2026-11-24) |
| --- | :---: | :---: | :---: |
| Readability and naming | 6/10 | 8/10 | **9/10** |
| Cohesion and single responsibility | 5/10 | 8/10 | **9/10** |
| Architecture and dependency direction | 6/10 | 8/10 | **9/10** |
| Types, invariants, and errors | 6/10 | 8/10 | **9/10** |
| Navigation and feature organization | 5/10 | 8/10 | **9/10** |
| UI reuse and component design | 7/10 | 8/10 | **9/10** |
| Tests and verification | 7/10 | 9/10 | **9/10** |
| **Overall** | **6/10** | **8/10** | **9/10** |

#### Verification
- `sh scripts/check-migrated-rust-format.sh` — passed (16 Rust files).
- `npm --prefix cashu-app run check:format` — passed (74 frontend files).
- `npm --prefix cashu-app run check:boundaries` — passed (20 files).
- `npm --prefix cashu-app run check:no-any` — passed (36 migrated native adapters/services/hooks).
- `git diff --check`, `npm --prefix cashu-app run check:release`, and `node scripts/check-release.mjs --history` — all passed (`Release 0.1.20`, 522 public text files).
- `npm --prefix cashu-app run build` — passed (`✓ built in 4.79s`, zero Vite warnings, entry JS `497.38 kB` raw / `158.61 kB` gzip).
- `npm --prefix cashu-app run test:payments` — **391 passed**, 0 failed, 0 skipped.
- `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` — **146 passed**, 0 failed, 0 ignored, 0 compiler warnings across 34 binaries.
- Affected real-Chrome suites (`bitcoinReceive`, `bottomSheetShell`, `conversionPrimaryAction`, `momoPageLayout`, `ecashMintPicker`) — all passed 100%.

Changes remain uncommitted and unpushed.
