# BitNotes coding-agent handoff

State checked on 2026-11-23. This handoff adds documentation only; it does not authorize starting another roadmap task.

## Goal and working agreement

Continue the clean-code, architecture, readability and reusable-UI roadmap in [code_review.md](code_review.md), toward a defensible 9/10 assessment. Favor clear feature ownership, readable names, typed boundaries and small, independently verifiable changes. Do not claim 9/10 until the final reassessment has evidence.

- The user explicitly requires **one roadmap task at a time**. Complete the requested task, show every changed file and provide a task-only diff; then wait for the user to request the next task.
- G7 is complete. **G8 is next and has not started.** The current user request is only to create this handoff.
- Preserve UI/UX during cleanup: appearance, layout, text, navigation, focus, interactions and animations. In particular, preserve the shared animated mint selector across ecash, Bitcoin and Mobile Money screens and the previous field/focus-border fixes. Reuse does not authorize changing callers' presentation.
- Preserve payment ceilings, duplicate-submission protection, pending identities, ambiguous-outcome handling, encrypted saves and restart recovery. Do not add automatic payment retries or infer that a mint error proves funds unspent.
- Leave changes uncommitted and unpushed unless the user explicitly requests those actions. Do not reset, clean or overwrite the existing dirty tree.
- Read [cashu-app/AGENTS.md](cashu-app/AGENTS.md): keep page headers visible, honor safe areas and **do not build an APK without an explicit request**.
- Use synthetic unfunded fixtures and temporary wallets/localhost servers. Do not use live wallets, provider execution or funded transactions. Do not copy credentials, seeds, tokens or private configuration into documentation or logs.

## Checked repository state

- Branch: `clean`.
- `HEAD`: `3fd7aa8af91229e5982052628a55eeb0739cf42c`.
- Local `origin/clean` tracking ref has the same hash. No fetch was performed for this handoff, so this is not a fresh remote-state assertion.
- No staged changes. Before this file was created, there were **10 modified tracked files and 13 untracked files**, listed below. They contain the accumulated G2–G7 work. This handoff is an additional untracked file.
- Release metadata is aligned at **0.1.20**, the user's selected version. Both release/hygiene checks pass; the old ten release-version errors are resolved.
- The first unchecked roadmap item is G8; G8–G14 and section H remain open. Earlier assessment failures, warning counts, test counts and “next task has not started” statements in historical completion notes are not current status. Read the latest G7 entry and current checkboxes.

## Completed work

Earlier roadmap work through F9 and G1 is committed. Relevant recent commits:

| Commit | Work to preserve |
| --- | --- |
| `28fc6d1` | F4–F9 Mobile Money operation/lifecycle separation. |
| `979afd8` | Lightning/Cashu reconciliation separated from Spark. The user confirmed the speed improvement. Ordinary Lightning checks never wait for Spark; on-chain work retains Spark-before-native ordering per receipt. Keep shared single-flight/coalescing and lifecycle cleanup. |
| `3fd7aa8` | G1 reports failed send recovery saves while preserving unknown outcome and the original pending ID; no automatic resend. |

The following completed tasks are **uncommitted**:

| Task | Result |
| --- | --- |
| G2 | Generic non-spent receive swap-error recovery reports both receive and save failures. Successful recovery saves retain the prior error text. Native/JS regressions cover this. A one-line test-server socket fix removed intermittent existing localhost failures. |
| G3 | Pure stable largest-first proof selection moved to the wallet crate. Remaining-amount subtraction avoids addition overflow; ordering, zero-target behavior and greedy fallback are preserved. Tests include all binary denominations and an independent small-inventory subset-sum oracle. |
| G4 | Outgoing V3/V4 encoding and result construction moved into the wallet crate. V3 remains primary. Frozen fixtures preserve payloads; multiple-keyset V4 comparisons normalize only the existing variable keyset ordering. |
| G5 | Named `PendingSend` input constructs the existing pending transaction without generating IDs/timestamps, normalizing proofs or saving. Existing proof metadata, amount, fee, request and identity are preserved. |
| G6 | Complete send orchestration moved to the wallet crate. Shared payment quoting and structured error definitions also moved, with native re-exports preserving former Rust paths. Native authentication and the wallet guard remain held across the operation. Both fee caps and duplicate protection remain tested. |
| G7 | Staged receive constraints, decoding and proof/fee preparation extracted as pure helpers. Twenty-six frozen valid/malformed token fixtures and native ordering regressions preserve current receive behavior. Receive orchestration itself remains native. |

## Important code locations

| File | Responsibility / reason changed |
| --- | --- |
| [Native send.rs](cashu-app/src-tauri/src/commands/send.rs) | Legacy/v2 send adapters authenticate, acquire the original wallet guard and await the wallet operation. Contains the remaining receive orchestration, calling G7 helpers at the original stages. Also contains `save_ecash_for_later`, outside the main G8 extraction target. |
| [Wallet send.rs](crates/ecash-wallet/src/send.rs) | `SendEcashRequest` and `send_ecash(&mut WalletState, path, passphrase, request)`. Original send policy/order retained; no Tauri/AppState dependency. Storage and mint access remain concrete. Useful pattern for G8. |
| [receive_input.rs](crates/ecash-wallet/src/receive_input.rs) | `validate_receive_constraints`, `decode_receive_token`, `prepare_receive_input`, and named decoded/prepared values. Pure; no wallet, clock, storage or network access. |
| [outgoing.rs](crates/ecash-wallet/src/outgoing.rs) | `PendingSend`, dual-format encoding, V3-primary result assembly and the unchanged `SendEcashResult`. |
| [proof_selection.rs](crates/ecash-wallet/src/proof_selection.rs) | Pure exact proof selection; preserve stable ordering and existing fallback policy. |
| [payment_quote.rs](crates/ecash-wallet/src/payment_quote.rs) | One canonical quote implementation shared by native review and wallet send execution. |
| [send_error.rs](crates/ecash-wallet/src/send_error.rs) | Unchanged structured send-error codes, fields and serialization. |
| [Native payment_request.rs](cashu-app/src-tauri/src/commands/payment_request.rs) | Re-exports shared quoting; command bodies remain unchanged. |
| [Native error.rs](cashu-app/src-tauri/src/error.rs) | Re-exports wallet send errors; retains legacy message-only `CommandError` conversion and fixture tests. |
| [Native send_tests.rs](cashu-app/src-tauri/src/commands/send_tests.rs) | Auth/result/duplicate/recovery regressions, actual encrypted pre-swap snapshots, gated mutex-lifetime test, and G7 receive-ordering tests. Preserve existing assertions. |
| [Wallet client.rs](crates/ecash-wallet/src/client.rs) | G2 changes only the existing mock server: accepted sockets explicitly become blocking before reading with the existing timeout. Production HTTP behavior is unchanged. |
| [JS caller regression](cashu-app/tests/sendEcashCaller.test.mjs) | G2 adds visible/silent receive-error coverage: no success amount, refresh or automatic retry after failure. |
| [Wallet lib.rs](crates/ecash-wallet/src/lib.rs) | Exposes extracted modules. Avoid formatting unrelated legacy content. |
| [Wallet integration tests](crates/ecash-wallet/tests) | `proof_selection.rs`, `outgoing_tokens.rs`, `pending_send.rs`, `send_operation.rs`, `receive_input.rs`; frozen outgoing/receive JSON fixtures are under `fixtures/`. |
| [DESIGN.md](cashu-app/DESIGN.md), [CONTRIBUTING.md](CONTRIBUTING.md), [code_review.md](code_review.md) | Current boundaries, navigation, task checkboxes, verification and limitations. Update these when completing the next extraction. |

## Decisions and constraints that matter for G8

1. **Receive validation is deliberately staged.** `validate_receive_constraints` runs before wallet access. Ordinary receive decoding runs only after authentication, the existing Nostr-key update and successful raw-receipt lookup. Moving all validation behind the wallet lock or all decoding before receipt lookup changes behavior.
2. **Raw token text remains receipt identity.** Existing codec trimming/URI/base64 handling and mint URL normalization are reused, but do not replace the original token string in history/idempotency comparisons. A native regression returns an existing successful raw receipt before decoding even when that legacy stored text is malformed.
3. **Invoice policy differs from ordinary receive policy.** Invoice keysets require unique sat-keyset resolution and net coverage. Ordinary receives retain permissive first-prefix matching and unknown-fee fallback. Metadata-fetch failures remain strict for invoices and fall back as before for ordinary receives. Preserve these policies during extraction.
4. Fees aggregate input fee-ppk before rounding, use checked addition, reject fees greater than or equal to token value, and recheck invoice coverage after fees.
5. Native send adapters retain their guard across mint awaits. A mutable borrow from the guard feeds the wallet operation. Do not clone the wallet or release/reacquire the lock as an incidental refactor.
6. Tokio mutex handoff is FIFO. In the concurrency test, the queued send can reserve the mutex after the first completes; an immediate `try_lock` at that point is not evidence of a leaked guard. The test waits for queued progress with a bounded timeout, then checks final availability.
7. V3 remains the default outgoing token. V4 uses an existing `HashMap`, so multiple-keyset ordering is not promised. Do not sort production output merely to make fixture bytes deterministic.
8. Preserve existing error messages/fields and IPC signatures. No dependency, version or wallet-format migration has been authorized. Storage delegation/injection and removal of implicit persistence normalization belong to G9–G14.

## Current bugs, blockers and diagnostic messages

- **No known failing tests or active blocker.** Latest full Rust results are 125 passed, no failures/ignored/filtered tests and zero compiler warnings. Frontend/payment results are 379 passed, none failed/skipped.
- **Remaining receive durability limitation:** three spent-token restore branches in native `receive_ecash_operation` still discard `save_encrypted` failures with `.ok()`. G2 intentionally fixed only the generic non-spent recovery-error path. Preserve/expose this limitation during G8; do not claim all recovery writes are durable or silently expand the task into a recovery-policy rewrite.
- **Persistence still implicitly normalizes state.** G11–G14 specifically address characterization and separation; do not remove that behavior while moving receive orchestration.
- **Frontend build follow-ups remain open:** prior builds reported mixed static/dynamic Tauri-event and Nostr imports and the large-chunk advisory. H4a–H4e track these. No production frontend build was rerun for G7 or this handoff, so exact current Vite diagnostic text and bundle sizes are not freshly verified. Older measurements in the review are historical, not current performance claims.
- **Environment:** Cargo may print `Blocking waiting for file lock on artifact directory` or `Blocking waiting for file lock on package cache` when another build runs. Wait; do not kill unrelated dev builds. Localhost tests previously hit sandbox error kind `PermissionDenied`; use the available execution approval for localhost test binding rather than changing tests. Disk space was about 2.8 GiB at handoff inspection; avoid unnecessary target duplication and never delete source or wallet data to free space.

Retained error strings/templates relevant to extraction (not outstanding test failures):

```text
Wallet is locked
Incomplete invoice payment constraints
Invoice payment is too large
Invalid token: must start with cashuA or cashuB
Failed to parse token: {decoder error}
Mint fee overflow
Token amount ({amount} sat) cannot cover the mint input fee ({fee} sat)
Unable to uniquely resolve the payment's mint keyset
Payment does not cover this invoice at the selected mint
Failed to receive ecash: {receive error}
 Recovery state could not be saved: {save_error:#}. Outcome remains unknown; check History before claiming again.
 Recovery state could not be saved: {save_error:#}. Outcome remains unknown; do not resend.
Tokens are already spent and could not be recovered
```

The leading space on each recovery suffix is intentional when appended to the original diagnostic. The first suffix is receive-specific; the second is send-specific. No save failure may be described as a successfully persisted recovery state.

## Verification evidence and commands

Latest implementation runs, whose logs were inspected again for this handoff:

| Command/check | Result |
| --- | --- |
| `CARGO_INCREMENTAL=0 cargo test --workspace --locked --offline` | 125 Rust tests passed; zero failed/ignored/filtered; zero compiler warnings. Log: `/tmp/bitnotes-g7-workspace.log`. |
| `npm --prefix cashu-app run test:payments` | 379 passed; zero failures/skips. Log: `/tmp/bitnotes-g7-payments.log`. |
| `CARGO_INCREMENTAL=0 cargo test --workspace --test receive_input --locked --offline` | All 11 receive-input/fixture tests passed before native integration. Log: `/tmp/bitnotes-g7-green.log`. |
| `CARGO_INCREMENTAL=0 cargo test --workspace receive_ --locked --offline` | Focused original-workflow receive characterization passed before extraction. Log: `/tmp/bitnotes-g7-native-baseline.log`. |
| Test-first / mutation checks | Missing-module red observed. Temporarily allowing zero net value made the fee regression fail; original guard restored before integration. Mutation failure is intentional evidence, not an unresolved bug. |
| `rustfmt --edition 2021 --check crates/ecash-wallet/src/receive_input.rs crates/ecash-wallet/tests/receive_input.rs` | Passed; isolated changed native snippets/tests also passed. Avoid whole-repository reformatting. |
| Source comparisons | Extracted constraint/normalization/fee logic matches original after path/borrow/error adaptations and formatting. Other native orchestration and prior test bodies remained byte-identical. |
| `git diff --check` | Passed again during handoff inspection. |
| `node scripts/check-release.mjs` | Passed again during handoff inspection; versions match 0.1.20 and public-file hygiene passes. |
| `node scripts/check-release.mjs --history` | Passed again during handoff inspection, including history hygiene. |

No funded mint/provider interoperability, real process termination, live device/browser verification or APK build was performed for G7. The filesystem fixtures exercise real temporary encrypted saves/rename failures; they do not prove persistence while storage remains unavailable. Most mint fixtures fail during GET-only preparation before any swap submission.

Use the committed lockfiles. Prefer `CARGO_INCREMENTAL=0` while disk space is tight. Focused runs selecting different Cargo targets/features can trigger substantial recompilation; the workspace feature set has generally reduced churn. Do not weaken assertions, suppress warnings or retry financial POSTs to get green checks.

## Uncommitted inventory

These tracked files were modified before creating this handoff:

```text
CONTRIBUTING.md
cashu-app/DESIGN.md
cashu-app/src-tauri/src/commands/payment_request.rs
cashu-app/src-tauri/src/commands/send.rs
cashu-app/src-tauri/src/commands/send_tests.rs
cashu-app/src-tauri/src/error.rs
cashu-app/tests/sendEcashCaller.test.mjs
code_review.md
crates/ecash-wallet/src/client.rs
crates/ecash-wallet/src/lib.rs
```

These files were already untracked and are required implementation/tests, not disposable artifacts:

```text
crates/ecash-wallet/src/outgoing.rs
crates/ecash-wallet/src/payment_quote.rs
crates/ecash-wallet/src/proof_selection.rs
crates/ecash-wallet/src/receive_input.rs
crates/ecash-wallet/src/send.rs
crates/ecash-wallet/src/send_error.rs
crates/ecash-wallet/tests/fixtures/outgoing_tokens.json
crates/ecash-wallet/tests/fixtures/receive_inputs.json
crates/ecash-wallet/tests/outgoing_tokens.rs
crates/ecash-wallet/tests/pending_send.rs
crates/ecash-wallet/tests/proof_selection.rs
crates/ecash-wallet/tests/receive_input.rs
crates/ecash-wallet/tests/send_operation.rs
```

`HANDOFF.md` is the only additional project file created by the handoff request. Nothing is staged, committed or pushed by this handoff.

Task-specific review artifacts `/private/tmp/bitnotes-g2.patch` through `/private/tmp/bitnotes-g7.patch` and `/tmp/bitnotes-gN-before*` snapshots were produced during implementation. The G7 patch was confirmed present when writing this handoff. These files are ephemeral and are **review diffs against each task's starting dirty tree**, not patches to blindly reapply. The repository source and current roadmap are authoritative.

## Clear next steps

1. Wait for the user to request G8. Then recheck the branch/status, read repository instructions and snapshot the current dirty tree without discarding it. Do not repeat G7 or infer authorization for G9.
2. Read native `receive_ecash_operation`, the G7 helpers, `deferred_ecash::record_claim_attempt`, the existing receive recovery tests, and the wallet send-operation pattern. G8 acceptance: **receiving and interrupted recovery are testable without Tauri state**.
3. Define the wallet receive operation and its inputs without introducing Tauri/AppState dependencies. Preserve pre-wallet invoice validation in the adapter or an equivalent staged boundary; keep ordinary receipt lookup before decoding, and hold the existing native guard across the awaited operation.
4. Write focused operation tests before implementing the new boundary. Retain native characterization/auth/order tests and add wallet-level coverage for receipt identity, invoice constraints, pending intent and interrupted/error recovery using temporary files and synthetic localhost responses. Do not describe a preparation failure as a funded mint spend or a simulated process crash.
5. Move the existing receive workflow in a mechanically reviewable slice; reuse `receive_input` and existing receipt/codec helpers. Preserve Nostr state updates, mint fetch policy, fee handling, save order, scoped restore behavior, amounts/statuses and exact error messages. Leave storage abstraction and implicit normalization changes for their listed tasks.
6. Run focused checks, full Rust workspace tests, frontend/payment tests and both release checks appropriate to the change. Format only migrated/new modules or changed snippets. Update the roadmap completion record, DESIGN and architecture map only when acceptance is evidenced.
7. Show every changed file and a G8-only diff against its starting snapshot. Leave work uncommitted/unpushed unless requested. Stop after G8 and wait for the user before G9.
