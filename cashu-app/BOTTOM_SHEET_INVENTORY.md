# Bottom-sheet callers and dismissal rules

Reviewed on 2026-11-19 for E4 in [the code review roadmap](../code_review.md). This is a static inventory of the working tree, including render/import paths and event handlers. It records current behavior and requirements for E5/E6; it does not change behavior or claim runtime verification of every dialog.

There are **ten component consumers of `useBottomSheet`**: seven ordinary dialog consumers and three payment views with page/compatibility branches. “Mounted” below means reachable through application source, not observed in a running funded wallet. Other overlays are listed separately so visual similarity does not lead to an accidental migration.

The inventory distinguishes freely dismissible menus, async dialogs that are still dismissible, guarded/partially dismissible flows, blocking loaders and state-dependent result overlays. In particular, PendingNwcModal remains dismissible while processing; CleanWalletModal retains Minimize while cleaning; FullScreenLoader provides no general dismissal. Those are different policies despite similar busy visuals.

## What the existing hook owns

Source: [useBottomSheet.ts](src/hooks/useBottomSheet.ts).

| Responsibility | Current behavior |
| --- | --- |
| Scroll locking | `modal` defaults to `true`. A reference count adds/removes `has-bottom-sheet-open` on the document and body. Registration ends when closing starts or the owner unmounts. Page variants use `modal: false`. |
| Closing | `closeWithAnimation` checks `disabled` and a closing ref, disables sheet/backdrop pointer events during exit, and calls the latest `onClose` once after 280ms or before the next document pointer/key press. Unmount cancels the pending callback. |
| Dragging | Only elements receiving `dragHandleProps` initiate dragging. Default distance threshold is 60px; a downward move over 20px at more than 0.35px/ms also dismisses. Touch cancellation resets the gesture; mouse listeners are cleaned up. Disabled handles expose native touch/selection styles instead of gesture handlers. |
| Appearance | Inline transform transitions use 320ms for entry/snap-back and 280ms for exit; backdrop opacity transitions use 260ms. The hook does not read the reduced-motion preference. |
| Caller responsibilities | Portal, backdrop markup/click handler, dialog role/name, close controls, Escape, initial focus, focus containment/return, stacking and business cleanup. The hook supplies none of these automatically. |

`disabled` is effective only for close paths routed through the hook. It does not guard a caller that invokes `onClose` directly, and it does not cancel a payment, provider request or maintenance operation. `modal: false` changes scroll registration; it does not turn the hook into a page-navigation controller.

## Seven ordinary hook-based dialog consumers

Unless specified otherwise, the listed backdrop, close button and drag handles call `closeWithAnimation` without a busy guard. These consumers do not pass `disabled` to the hook. Button disabling alone is not a dismissal policy.

| Caller and reachable mount | Current dismissal paths | Busy behavior and details to preserve |
| --- | --- | --- |
| [ActionMenuModal](src/components/home/ActionMenuModal.tsx), used twice by [WalletBalanceCard](src/components/home/WalletBalanceCard.tsx) on [Home](src/pages/Home.tsx) for Send/Receive | Backdrop, close button and handle/header drag. No sheet Escape handler. | No async operation owned by the menu. An option calls `opt.onClick()` **before** requesting animated close. Navigation may unmount the menu before the timer finishes. Preserve callback order and unmount cleanup. |
| [AddMintModal](src/components/navigation/AddMintModal.tsx), opened by [Mints](src/pages/Mints.tsx) and [TrustedMintsList](src/components/home/TrustedMintsList.tsx) | Backdrop, close button and handle/header drag. No sheet Escape handler. | `adding` disables the add action, not dismissal. Successful addition requests animated close. Closing does not have a request-cancellation handler. |
| [MintInfoModal](src/components/home/MintInfoModal.tsx), opened by TrustedMintsList and [DiscoverMints](src/pages/DiscoverMints.tsx) | Backdrop, close button and handle/header drag. No sheet Escape handler. | Metadata loading and mint actions do not block dismissal. Add/remove controls use `isMintActionLoading`; successful removal calls raw `onClose()` rather than animated close. Preserve this distinction until deliberately migrated. |
| [LightningAddressModal](src/components/home/LightningAddressModal.tsx), opened by [LightningAddressCard](src/components/home/LightningAddressCard.tsx) on Home | Backdrop, close button and handle/header drag. No general sheet Escape handler. | Claiming a username disables Save, not dismissal. Escape in the username input exits editing and resets that draft; it does not close the dialog. The edit action's delayed input focus is not initial dialog focus. |
| [PendingNwcModal](src/components/home/PendingNwcModal.tsx), opened by Home | Backdrop, close button and handle/header drag. No sheet Escape handler. | `processingId` disables Approve/Reject buttons while either request runs; closing remains unguarded. Finishing the last request requests animated close. Dismissing the UI is not an approval, rejection or payment cancellation. This is an async financial flow, not a simple first migration. |
| [TransactionDetailsModal](src/components/history/TransactionDetailsModal.tsx), opened by [History](src/pages/History.tsx) and [RecentTransactions](src/components/home/RecentTransactions.tsx) | Backdrop, close button, handle/control-bar drag and document Escape. | No common busy-dismissal guard, including during claim/recovery callbacks. It already supplies `role="dialog"`, `aria-modal`, an accessible name, first-button focus, a Tab-edge loop and connected-trigger focus return. Preserve those features; the handler is not scoped to the topmost dialog. |
| [UpdateAppModal](src/components/shared/UpdateAppModal.tsx), opened by [AppUpdatePrompt](src/components/shared/AppUpdatePrompt.tsx) in [App](src/App.tsx) | Backdrop, close button, Update Later, drag and window Escape. | Dismissal records session suppression. Update Now opens the website and dismisses in `finally`; there is no busy-dismissal lock. Drag uses the hook's wrapped `onClose`, which also records suppression. Preserve the session side effect across all exit paths. |

Only TransactionDetailsModal among these seven implements its own complete set of explicit dialog naming, initial focus, a Tab-boundary loop and focus return. This is source evidence, not proof that its focus handling covers nested dialogs or every dynamic control.

## Three payment-view consumers: pages and compatibility branches

| Consumer | Application reachability | Current dismissal/guard behavior |
| --- | --- | --- |
| [BitcoinPaymentView](src/features/bitcoin/BitcoinPaymentView.tsx) | Send/receive [Bitcoin routes](src/pages/Bitcoin.tsx) mount [BitcoinScreen](src/features/bitcoin/BitcoinScreen.tsx) with `page`. TrustedMintsList still mounts [BitcoinModal](src/features/bitcoin/BitcoinModal.tsx), whose `page={false}` branch redirects to a route and calls its parent `onClose`. | Pages set `modal: false`; the header handles step-back/route-close and disables Back while paying, requesting or fetching LNURL. The compatibility sheet has unguarded hook close/drag paths and no general Escape handler. Full-screen loaders can intercept pointer interaction, but are not a hook dismissal guard. This redirecting branch is not an ordinary long-lived sheet candidate. |
| [EcashModal](src/components/home/EcashModal.tsx) | [SendEcash](src/pages/SendEcash.tsx)/[ReceiveEcash](src/pages/ReceiveEcash.tsx) mount page mode. TrustedMintsList's non-page invocation redirects to those routes and closes its parent. | Pages use `modal: false` and a raw route `onClose` for Back. The compatibility branch has backdrop/close/drag through the hook, without a busy guard or general Escape handler. Sending/receiving loaders are separate overlays. Preserve token/request/QR lifecycles; do not treat this legacy name as evidence of a live reusable sheet. |
| [MomoTransferView](src/features/momo/MomoTransferView.tsx) | [MobileMoney routes](src/pages/MobileMoney.tsx) use [MomoTransferScreen](src/features/momo/MomoTransferScreen.tsx). [MomoTransferModal](src/features/momo/MomoTransferModal.tsx) remains exported, but no application import/render of that wrapper was found under `src`. | Hook configuration is `disabled: false`, `modal: !page`. `handleClose` refuses while `confirming.current` and phase is IDLE, clears finished-transfer state, then navigates or requests animated close. Window Escape uses `handleClose`; the page header also has a submission guard. In the legacy branch, process phases omit drag props, while explicit “Close and keep transfer” remains available. Drag calls the hook's raw parent `onClose`, bypassing `handleClose` cleanup. |

For Mobile Money, closing an unfinished flow does not clear it in `handleClose`. This inventory does not establish persistence, request cancellation or provider recovery guarantees. Terminal cleanup and dismissal must remain feature-owned when that branch is eventually migrated.

## Other overlays and modal-looking surfaces

These are reachable application surfaces unless marked otherwise. None is another `useBottomSheet` consumer.

| Surface | Current behavior | E5 boundary |
| --- | --- | --- |
| WalletBalanceCard's mint selector | Custom portal, backdrop and Escape; manually calls `registerBottomSheetOpen/Close` while open. | A selector with its own animation/positioning, not a draggable dialog. Reusing the counter must not register the same owner twice. |
| [MintBalancePicker](src/components/shared/MintBalancePicker.tsx) | Anchored portal and backdrop; opening focuses the selected row and Escape restores trigger focus. No hook scroll registration. | Keep its shared dropdown UX and animation; do not wrap it in a sheet. Its document Escape handler and a parent's window handler can both observe a key because it prevents default without stopping propagation. |
| [AddressBookPickerModal](src/components/addressBook/AddressBookPickerModal.tsx) and [ContactFormModal](src/components/addressBook/ContactFormModal.tsx) | Centered portals, explicit close and backdrop dismissal; the picker can open a second ContactForm portal. No hook locking, general Escape or dialog focus containment in these components. | Nested-dialog integration needs explicit focus/stacking tests. They are not automatically part of the first sheet migration. |
| [CleanWalletModal](src/components/settings/CleanWalletModal.tsx), opened by [WalletManagementSection](src/components/settings/WalletManagementSection.tsx) | While `isCleaning`, backdrop dismissal is removed and the footer Close button is disabled, **but the header button remains enabled and is titled Minimize**. No hook. | A partial dismissal policy that intentionally exposes a minimize path. Closing the UI does not supply a cancellation callback. Do not label the entire modal “blocked while busy.” |
| [SovereignStampOverlay](src/components/shared/SovereignStampOverlay.tsx) | Full-screen named dialog with Framer Motion/reduced-motion handling. Pending has no backdrop/drag/Escape dismissal. Optional `onBackground` can expose an explicit pending action; no app caller currently supplies it. Result Escape calls `onDismiss`; success Done additionally replaces the route with `/`. Failed Retry and Dismiss are distinct. | Keep result navigation and pending semantics separate from sheet dismissal. Existing result-button autofocus does not establish a focus trap or trigger return. |
| [FullScreenLoader](src/components/shared/FullScreenLoader.tsx) and [VaultLoader](src/components/shared/VaultLoader.tsx) | Blocking loading presentation with no general close/backdrop/Escape handler. FullScreenLoader offers Go Back only when both `error` and `onBack` exist. VaultLoader's full-screen mode is used by [Auth](src/pages/Auth.tsx). | Loading overlays, not free-dismissal sheets. Pointer coverage does not by itself block an underlying component's global keyboard handler. |
| Inline QR dialogs in [NWCSection](src/components/settings/NWCSection.tsx) / [LockedEcashSection](src/components/settings/LockedEcashSection.tsx), on [Settings](src/pages/Settings.tsx) | NWC QR closes via backdrop or X. Locked Ecash QR has an X and no backdrop handler. Neither uses the hook or adds general Escape/focus containment. | Centered QR presentations; preserve their distinct close paths if separately migrated. |
| Inline delete confirmation in [AddressBook](src/pages/AddressBook.tsx) | Cancel/Delete controls; no backdrop or Escape handler. | Destructive confirmation, not a sheet dismissal default. |
| Scanner overlay in [RedeemNoteForm](src/components/scan/RedeemNoteForm.tsx), on [Scan](src/pages/Scan.tsx) | Explicit Cancel Scanner or a successful scan closes the scanner. | Camera lifecycle belongs to the scanner flow. Bitcoin/ecash also have feature-owned scanner content; do not infer a dialog from a scan control's name. |
| [ConfirmResetDialog](src/components/auth/ConfirmResetDialog.tsx), on Auth | Full-page reset confirmation; both confirm and Cancel are disabled during its request. | A page, not a portal/sheet. Keep reset state out of the shell. |
| Standalone [SendEcashModal](src/components/home/SendEcashModal.tsx) / [PayInvoiceModal](src/components/home/PayInvoiceModal.tsx) | No application import/render found under `src`; centered modal implementations remain defined. Close is explicit; they are not hook users. | Record as unmounted definitions, not current sheet consumers. E4 does not delete them or invent a migration need. |

## Requirements to carry into E5

1. Build a presentation shell around the existing hook. Keep payment, provider, persistence and routing logic in callers; do not infer dismissal from a prop merely named `loading` or `busy`.
2. Make dialog naming, initial focus, Tab containment, focus return and Escape behavior explicit. A visible heading is not automatically an accessible dialog name. Restore focus only to a still-connected trigger, and define a fallback when an action navigates/unmounts it.
3. Apply the caller's allowed/blocked dismissal policy to backdrop, close button, drag and Escape. Do not allow one path to bypass caller cleanup, and do not silently change the async behaviors recorded above. Closing must not imply cancellation.
4. Give only the topmost relevant dialog ownership of Escape and focus. A pending overlay must not expose an underlying sheet's global Escape close path. Nested contact forms and dropdowns need their own handling, not a second unconditional window listener.
5. Reuse one hook/scroll-lock registration per owner. Preserve drag thresholds, native scrolling outside the handle, touch cancellation, mouse cleanup, exit pointer pass-through, close deduplication and cleanup before the first following press.
6. Define and test reduced-motion behavior explicitly. The current hook's inline timings and minimal browser fixture do not prove reduced-motion support for sheets. Do not weaken existing motion/interaction assertions to make the shell pass.

These are requirements for the next task, not an implemented shell API or changed caller policy.

## First migration candidate for E6

Use **ActionMenuModal**. Its two live Send/Receive mounts have one presentation and no owned async submission state. Preserve supplied title/options, callback-before-close order, route transitions, styling, desktop/mobile positioning, drag behavior and the existing entry/exit motion. Add the shell's dialog/focus/Escape verification in E5/E6; those behaviors are currently missing from this caller.

Do not start with PendingNwcModal, a payment page/redirect adapter, TransactionDetailsModal's recovery actions or UpdateAppModal's session side effects. Their caller policies need more specific coverage than a simple menu migration.

## Existing verification and gaps

- [bottomSheet.test.mjs](tests/browser/bottomSheet.test.mjs), run with `npm run test:bottom-sheets`, covers touch/mouse dismissal and first-press reopening, first-touch input focus after dismissal, nested scroll locks, callback cancellation on unmount, and cancelled/disabled gestures. Its [fixture](tests/browser/bottomSheet.fixture.tsx) supplies focus restoration itself; that is not a hook capability. It does not establish a named dialog, Tab containment, Escape ownership, reduced-motion support or every caller's async policy.
- [successOverlay.test.mjs](tests/browser/successOverlay.test.mjs), run with `npm run test:success-overlays`, covers Done cleanup/home replacement, custom labels, optional cleanup, failed dismissal/retry and pending navigation restrictions. It does not validate a bottom-sheet shell or all keyboard paths.
- Existing Bitcoin/Mobile Money/control fixtures cover particular interactions; they do not substitute for a shell-specific named-dialog/focus/nesting test. E5 needs that coverage before E6 changes a live caller.

E4 validation is a source/call-site audit, link/whitespace checks and runtime-file fingerprint comparison. No browser, build or payment test is newly run for this documentation-only task. E5 and E6 remain pending.

## E5 addendum: shared shell available, callers unchanged

The sections above preserve the E4 snapshot. [BottomSheet](src/components/shared/BottomSheet.tsx) now wraps one existing hook instance with portal, backdrop and dialog semantics. Its [focus/layer helper](src/components/shared/useBottomSheetDialog.ts) handles initial focus, Tab containment, focus return and top-sheet Escape. [DESIGN.md](DESIGN.md#shared-shell-contract-e5) describes naming, render controls, styling, lifecycle, `dismissible` and explicit `suspended` handoff to foreign overlays.

The ten original consumers remain unchanged; the shell is an eleventh source consumer of the hook, exercised only by a synthetic fixture. No application mount, callback order, busy-state policy or existing appearance has changed in E5. ActionMenuModal remains the proposed E6 migration.

The shell has one dismissal guard across its backdrop, supplied close button, caller `close()`, handle gestures and Escape. Nested shells share ownership; a suspended top shell does not reactivate a lower one. Existing foreign dialogs/loaders/results/dropdowns require explicit suspension plus their own focus and keyboard handling when integrated. The shell does not discover them from CSS or guess their operation state. Reduced motion removes new-shell transitions; the original hook and existing callers keep their current behavior and timing.

New evidence: [type contracts](tests/bottomSheetContracts.test.mjs), [synthetic fixture](tests/browser/bottomSheetShell.fixture.tsx) and [browser checks](tests/browser/bottomSheetShell.test.mjs) cover accessible names/descriptions, focus fallback/return, keyboard containment, guarded close paths, nested ownership/suspension, StrictMode cleanup, gestures/first following interactions, scrolling, safe areas, themes, short screens and reduced motion. Run `npm run test:bottom-sheet-shell`; the original `npm run test:bottom-sheets` remains separate. These tests do not establish screen-reader, native-device or live-caller integration behavior. E6 remains pending.
