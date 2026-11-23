---
name: Sovereign Ochre & Forest
colors:
  surface: '#0b1511'
  surface-dim: '#0b1511'
  surface-bright: '#313b37'
  surface-container-lowest: '#07100c'
  surface-container-low: '#141e19'
  surface-container: '#18221d'
  surface-container-high: '#222c28'
  surface-container-highest: '#2d3732'
  on-surface: '#dae5de'
  on-surface-variant: '#d4c4b0'
  on-surface-muted: '#8b9e94'
  inverse-surface: '#dae5de'
  inverse-on-surface: '#28332e'
  outline: '#9d8f7c'
  outline-variant: '#504535'
  outline-subtle: '#1e3c2e'
  selection-container: '#183626'
  on-selection-container: '#f2a93b'
  selection-outline: '#2b563e'
  surface-tint: '#fbbb4d'
  primary: '#ffc564'
  on-primary: '#432c00'
  primary-container: '#e5a83b'
  on-primary-container: '#5e3f00'
  inverse-primary: '#7f5700'
  secondary: '#accfba'
  on-secondary: '#173628'
  secondary-container: '#304f40'
  on-secondary-container: '#9ec0ac'
  tertiary: '#d1cec6'
  on-tertiary: '#31312b'
  tertiary-container: '#b5b3ab'
  on-tertiary-container: '#46453f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdead'
  primary-fixed-dim: '#fbbb4d'
  on-primary-fixed: '#281900'
  on-primary-fixed-variant: '#604100'
  secondary-fixed: '#c7ebd5'
  secondary-fixed-dim: '#accfba'
  on-secondary-fixed: '#012114'
  on-secondary-fixed-variant: '#2e4d3d'
  tertiary-fixed: '#e5e2da'
  tertiary-fixed-dim: '#c9c6be'
  on-tertiary-fixed: '#1c1c17'
  on-tertiary-fixed-variant: '#474741'
  background: '#0b1511'
  on-background: '#dae5de'
  surface-variant: '#2d3732'
typography:
  display-hero:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 52px
    fontWeight: '600'
    lineHeight: 60px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 39px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 52px
    fontWeight: '600'
    lineHeight: 60px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 34px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 30px
  headline-sm:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 26px
  body-lg:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 17.5px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 15.5px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: 19px
  label-numeric:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 16.5px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: 0.02em
  label-code:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.05em
  label-tag:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-caps:
    fontFamily: "'Poppins', sans-serif"
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system articulates sovereign digital finance through an earthy, culturally rich luxury lens. Bridging modern cryptographic speed—specifically the instant settlement of the Bitcoin Lightning Network—with enduring tactile warmth, the interface rejects cold techno-futurism and generic neo-banking blues in favor of grounded nobility. 

The aesthetic style merges **Minimalist Precision** with **Tactile Warmth** and subtle African geometric heritage. Surfaces are layered in velvety forest slates, anchored by radiant sun-baked ochre golds, crisp bone cream accents, and disciplined geometric silhouettes. The emotional atmosphere evokes permanence, trust, generational prosperity, and uncompromised financial self-custody.

## Colors
The default color mode is dark, reflecting an elite, focused vault environment. 

Runtime theme values are defined in [App.css](src/App.css). The shared page header uses `surface`, `surface-container`, `surface-container-high` and `on-surface`, plus two roles that preserve its established dark colors: `on-surface-muted` for subtitle/icon text and `outline-subtle` for the back-button border. Their dark values appear in the frontmatter. In light mode those two roles follow `on-surface-variant` and `outline-variant`, respectively. The back button's keyboard focus outline uses `on-surface` for contrast in either theme.

Segmented controls use `selection-container`, `on-selection-container` and `selection-outline` for the selected pill. The frontmatter records their established dark colors; the selected foreground follows `primary` in that mode. In light mode the roles follow `secondary-container`, `on-secondary-container` and `outline`, keeping dark text readable on the pale green selection. Unselected text uses `on-surface-muted`, hover text uses `on-surface`, and keyboard focus outlines use `on-surface` in both themes. The pill's decorative highlight follows `primary` at 40% opacity.

### Color Hierarchy & Roles
- **Primary Accent (`#E5A83B` / `#D89B2B`):** Warm ochre amber. Reserved strictly for primary action drivers, Lightning bolt glyphs, pending/confirmed status badges, QR code focal zones, and affirmative financial milestones.
- **Secondary Dark Forest (`#0E2E20` / `#0A2218`):** Deep botanical green. Forms foundational container layers, hero balance cards, and selected state chips, preserving the visual identity rooted in the token emblem.
- **Tertiary Accent (`#F7F4EB`):** Pristine bone cream. Deployed for high-contrast primary typography, key numerical balances, and crisp circular badge rings.
- **Neutral Surface Palette:**
  - `Surface 0 (Canvas)`: `#0D1713` — Infinite deep forest obsidian.
  - `Surface 1 (Card/Containers)`: `#15221C` — Elevated forest slate.
  - `Surface 2 (Interactive/Overlay)`: `#1E2E27` — High-tier interactive pill containers and input fills.
  - `Muted Foreground`: `#8B9E94` — Technical metadata, network fee details, and inactive icon states.
  - `Destructive`: `#D65D4E` — Routing failures, lightning channel closures, and payment rejections.

## Typography

The typography entries above mirror the role tokens in [App.css](src/App.css). Use that implementation when reconciling this document; changing a documented font does not change the app. Components also apply local size, weight and tracking overrides.

| Role | Current family | Implementation |
| --- | --- | --- |
| Default interface, headings and body text | Poppins | `--font-sans`, display/headline/body role tokens |
| Numeric labels, tags and uppercase labels | Poppins | `label-numeric`, `label-tag`, `label-caps` |
| Code, addresses and technical identifiers | JetBrains Mono | `--font-mono` / `font-mono`, `label-code` |
| Status-pill text | JetBrains Mono | `.status-pill` uses `--font-mono` independently of the Poppins `label-tag` token |
| Italic hero accent | Playfair Display | `.hero-italic` in [the auth screen](src/pages/Auth.tsx); italic, weight 400, with inherited size and line height |

The base sans stack falls back through Apple/Blink system fonts to `sans-serif`; the base mono stack falls back through platform monospace fonts to `monospace`. The named role tokens retain the fallback families shown in the frontmatter. The hero accent falls back to Georgia and then `serif`.

**Font loading:** [main.tsx](src/main.tsx) bundles Poppins weights 300, 400, 500, 600, 700 and 800, plus JetBrains Mono weights 400, 500 and 600, through Fontsource imports. Remote Google Fonts requests also exist in [App.css](src/App.css) and [index.html](index.html). The HTML request additionally supplies Playfair Display italics; that accent relies on its serif fallback when the remote font is unavailable.

## Layout & Spacing
The layout model follows a structured fluid grid optimized primarily for handheld tactical utility (4-column mobile grid), expanding into unified center-focused financial command surfaces on desktop (8-column tablet, 12-column desktop capped at a max-width of 1280px).

- **Mobile First:** Generous touch targets with 16px lateral padding ensure one-handed ergonomics. Primary actions pin persistently above safe-area viewports.
- **Rhythm:** Spacing follows an 8pt step system. Data tables and cryptographic lists collapse to tight 4pt paddings (`space-xs`) for dense balance inspection, while cards and module sections breathe across 24px–40px thresholds (`space-lg` and `space-xl`).

### Payment page layout

[PaymentPageLayout](src/components/shared/PaymentPageLayout.tsx) provides header, body (`children`) and optional footer slots for the matching full-height Mobile Money and Bitcoin forms. Introduced in E1, it is used by the full Mobile Money view in E2 and Bitcoin forms/setup views in E3. It imports React types only and owns no payment state, navigation, validation, providers or control disabling.

The parent must provide a bounded available height, as `AppFrame` and `PageTransition` already do below `TopNav`. The layout fills that space rather than adding another `100dvh`. Header/footer wrappers do not shrink; only the body scrolls, with a required `bodyLabel` naming its keyboard-focusable region. Use `PageHeader` with `sticky={false}` in the header slot. The parent navigation owns the top safe-area inset; the layout owns bottom and side insets. Its 480px mobile / 600px desktop maximum widths and responsive padding follow the existing payment-page shells.

Native `main` attributes and `className` pass through to the root; `bodyClassName` allows feature-owned body arrangement. Features own spacing between their controls, keypad sizing, messages, action content and form relationships. A footer action outside its form should use the native `form` attribute. Keep header/footer content compact enough to fit the available height; the shell does not resize a keypad, detect an operating-system keyboard or change a workflow to make it fit. Resizing the available parent height updates the layout through CSS.

```tsx
<PaymentPageLayout
  header={<PageHeader title="Review payment" sticky={false} onBack={goBack} />}
  bodyLabel="Payment review"
  footer={<PrimaryActionButton type="submit" form="payment-review">Confirm</PrimaryActionButton>}
>
  <form id="payment-review" onSubmit={confirmPayment}>
    {reviewDetails}
  </form>
</PaymentPageLayout>
```

Mobile Money's full-page branch supplies its existing `PageHeader` to the header slot and retains `MomoPaymentForm` or transfer progress in the body. Its feature body uses a column flex container with outer overflow hidden: the entry form already reserves its keypad/actions and switches to the existing two-column grid on short screens; review and progress retain their own scroll regions. The footer slot is omitted for this migration, preserving that arrangement until the planned feature splits. Titles, back/confirmation guards, saved-transfer actions and the animated mint picker remain feature-owned.

After E7, [MomoEntryForm](src/features/momo/MomoEntryForm.tsx) owns the entry presentation: animated mint picker, labelled phone input/address-book action, amount/Max, existing live feedback/retry and compact keypad. Its explicit props contain controlled entry values and callbacks only. Phone digit filtering/ten-digit limit, Enter-to-blur, amount formatting/six-digit keypad limit and cashout Max remain UI behavior inside this component. It receives no review, submission, confirmation, saved-transfer or provider-execution state/actions.

[MomoPaymentForm](src/features/momo/MomoPaymentForm.tsx) composes entry/review/saved-transfer presentation with individually named props and keeps the shared primary action/guards/labels. Its prop interface extends the entry contract without changing the caller API. `MomoEntryForm` returns a fragment: the four entry sections remain direct children of `.momo-payment-form`, preserving existing flex and short-screen grid selectors, focus styling and keypad/action reservations. There is no additional DOM form/wrapper, CSS change or new workflow owner. E8 extracts review presentation; E9 extracts the page form's saved-transfer list.

Run `npm run test:momo-entry` for entry boundary and browser checks. The browser test mounts the real parent/shared controls through the existing synthetic fixture, with a flex reservation matching the page. Temporary before/after captures cover entry/review in both themes, both directions and three viewport sizes; the existing real-page, phone-field, primary-action and mint-picker suites remain relevant integration checks.

After E8, [MomoReview](src/features/momo/MomoReview.tsx) renders the supplied non-null review snapshot and validation/error feedback. It displays the original direction-specific phone/mint labels, RWF amount, cashout fixed fee/reserve, estimated wallet debit/credit and confirmation note. It imports the service's review model as a type (`MomoReviewData`), with no transport, calculation or lifecycle ownership. Draft entry fields, editing callbacks and submission/saved-transfer controls are outside its prop contract.

The single `PrimaryActionButton` stays in MomoPaymentForm, outside the entry/review conditional, so the same DOM button retains keyboard focus when its action changes from `onReview` to `onConfirm`. Existing `valid`, `submitting` and `loadingRate` guards/label precedence remain explicit there. The extracted review returns the original `.momo-review-content` div; no wrapper, style, shared-button or layout change is introduced. Validation retains priority over service errors in the existing alert. Existing colors/contrast limitations are unchanged. Run `npm run test:momo-review` for compiler boundary checks and browser verification of reviewed values, focus/button identity, confirmation and feedback.

After F1, cash-in execution in [flowServices](src/services/flowServices.ts) consumes the fresh quote produced by [buildMomoReview](src/services/momoReview.ts). The internal currentMomoQuote helper fetches one rate, builds the review and checks any approved snapshot. Confirmed cash-in retains that object through execution; direct calls build it after the existing transaction claim. Its sats fund the receiving invoice and Mobile Money request, and its amount/rate/spread supply transaction metadata. The existing transaction fee remains zero: the review's feeRwf describes the embedded exchange margin and is not a new separately charged fee.

Cash-in keeps floor rounding, inclusive 100–200,000 RWF bounds, existing limit/phone messages, request order and approval rejection before transaction creation. Direct calls now also obey the review builder's whole-RWF, mint/rate and positive-sats checks before invoice/provider work. The UI already uses these rules. Cash-out uses the same fresh-quote path after F2, as described below. Run `node --experimental-strip-types --test tests/momoReview.test.mjs tests/momoFlows.test.mjs` from cashu-app for calculator and execution checks with synthetic rate/native/provider adapters. UI, persistence, recovery and polling ownership are unchanged by F1.

After F2, cash-out execution also retains the complete fresh quote from currentMomoQuote. `buildMomoReview` is the shared source for the fixed payout fee, rounded-up spread, rounded-up funding sats and reserve-inclusive wallet budget. `calculateSendQuote` passes `quote.fundingSats` to Lightning invoice creation and stores that same funding amount; `quote.sats` remains the review/approval budget including the routing reserve. The reserve is not added to the invoice, and the stored transaction fee remains zero, preserving existing funding and fee metadata.

The approval check still runs before transaction or invoice creation and compares rounded wallet budgets, including the reserve. A one-sat worse budget requires review again; a higher raw rate is allowed when ceiling rounding leaves the approved budget unchanged. Direct calls share the review's whole-RWF/mint/rate validation before invoice creation. The redundant reviewedMomoRate projection and cash-out arithmetic are removed. Cash-in, native funding payment, payout initiation, recovery, polling, UI and public quote signatures are unchanged. Run the existing calculator/flow tests above for synthetic execution, inclusive limits, fee/reserve separation and approval-bound regressions. Cash-in scheduling is separated in F3 below.

After F3, cash-in verification in [flowServices](src/services/flowServices.ts) accepts `{ transactionId, transactions, checkPaymentStatus, scheduler, isCurrent }` and synchronously returns its cleanup (or undefined when the selected transaction cannot be verified). [Scheduler](src/services/scheduler.ts) exposes only `schedule(callback, delayMs) => cancel`; the timeoutScheduler adapter owns native timer handles and idempotent cancellation. [The processing adapter](src/services/momoProcessingAdapter.ts) supplies that adapter; [TransactionProcessor](src/hooks/useTransactionProcessor.ts) starts the owner and returns its cleanup on phase/transaction changes and unmount. Cash-in no longer receives React timer refs or a caller-owned stopPolling function; payout now uses the same cleanup contract after F6.

Verification still checks status immediately. After an initial pending/unknown result or transient error, it starts the configured POLLING_INTERVAL_MS loop and POLLING_TIMEOUT_MS deadline. Each subsequent poll is scheduled only after the previous request settles. Terminal results, explicit cleanup and deadline expiry stop both timers; queued callbacks and in-flight status responses cannot restart a stopped owner. The deadline preserves a pending recovery record and the existing message, rather than declaring provider failure. Cleanup does not abort the provider request or undo fulfillment already started from a confirmed result. Provider status normalization remains in momoService; fulfillment operations are injected after F8, as described below.

Run `npm run test:momo-cash-in-polling` for the timeout adapter, deterministic manual-scheduler service tests and real React processor/store integration in isolated Chrome. The shared test scheduler advances callbacks without waiting for provider I/O, allowing deadline tests while a request is pending. Fixtures retain the transaction store and processor but replace clocks, providers, wallet/native and Spark boundaries with synthetic adapters. No UI markup, CSS, quote calculations, payout timing or transaction formats change in F3/F4.

After F4, cash-in verification receives a captured transactionId and the [MomoTransactionAccess](src/types/momo.ts) port. Its readonly findById lookup, updateById (which excludes ID changes in its type) and setErrorFor methods keep every poll, result and deadline bound to that ID. The [store adapter](src/services/momoTransactionAccess.ts) resolves the active record first, otherwise history, and delegates to the existing updateTransactionById action. That action mirrors updates into history without promoting saved transfers into the foreground. The [store's](src/store/transactionStore.ts) setErrorForTransaction checks the active ID atomically inside its setter, so a saved transfer cannot change another foreground transfer's error. Provider failure also keeps its reason in the selected record's existing recoveryMessage field.

Callbacks recheck existence, direction, pending status and verification phase before applying results. Removed or completed/recovery records stop that owner instead of being resurrected or rolled back. Success passes the captured ID into the fulfillment wrapper, which composes the injected F8 operation below. React cleanup still retires the owner on foreground replacement/unmount. Tests also run the service directly against saved transfers with the actual store adapter to establish ownership independently of that React guard. After F5, the verifier receives a required checkPaymentStatus(transactionId) function returning [MomoPaymentStatusResult](src/types/momo.ts): SUCCESSFUL, FAILED, PENDING or UNKNOWN with an optional message. The processing adapter supplies [checkMomoPaymentStatus](src/services/momoService.ts); the existing adapter continues to normalize raw responses, including ambiguous/network failures as UNKNOWN. Both initial and scheduled requests use the injected function with the captured ID. There is no implicit provider fallback inside the verifier.

Polling service tests pass ordinary functions directly and can control responses, rejections and unresolved promises per owner. The shared flow-test loader still supplies unrelated native/store/fulfillment boundaries and recovery provider access; it no longer supplies the verifier's status responses. A regression test gives two owners independent status fakes and makes the module adapter throw if called. The existing isolated Chrome processor/store suite verifies production wiring with synthetic external boundaries. Recovery status access, messages and fulfillment policy are unchanged by F5.

After F6/F7, [startPayoutVerification](src/services/flowServices.ts) accepts `{ transactionId, transactions, checkPayoutStatus, scheduler, isCurrent }` and synchronously returns idempotent cleanup. It uses the same MomoTransactionAccess and Scheduler ports as cash-in. The processing adapter injects the existing normalized status adapter and timeoutScheduler, while React owns only lifecycle cleanup; its Mobile Money timer refs and stopPolling callback are removed. Backend/saved-transfer processor effects remain unchanged.

A referenced payout in VERIFYING_PAYOUT starts its first status request after POLLING_INTERVAL_MS, retaining payout's existing delayed-first-check behavior. Subsequent requests remain sequential, scheduled only after the previous request settles. The POLLING_TIMEOUT_MS deadline starts when the verification owner starts, after a successful initiation has moved the record into VERIFYING_PAYOUT. PENDING, UNKNOWN and rejected status requests keep the funded transfer pending; the deadline moves it into recovery without another provider submission. Explicit provider failure also preserves funded pending recovery and the existing support message. Success retains completion, wallet refresh and recording the selected recipient in the address book.

All reads, phase/result/deadline writes and foreground errors use the captured ID. Callbacks recheck existence, status, direction, phase and ownership; removed, terminal, replaced or canceled work cannot change another transfer or restart timers. Saved transfers can be verified directly without taking the foreground. Cleanup does not cancel a dispatched provider request or prove its outcome. A canceled initiation response leaves its persisted submitting intent for recovery instead of applying it to another transfer.

After F7, [startPayoutInitiation](src/services/payoutInitiation.ts) owns submission separately from polling. It accepts the captured transactionId, MomoTransactionAccess, an injected submitPayout function and an optional lifecycle guard; it returns synchronous cleanup without a scheduler dependency. The processing service routes INITIATING_PAYOUT to initiation and VERIFYING_PAYOUT to read-only verification; its production adapter supplies their dependencies. The combined initiateAndVerifyPayout entry point is removed. Wallet/contact completion effects remain in the polling service for later work.

Initiation retains the funding check and not_started → submitting → accepted/rejected intent handling. It synchronously persists submitting through updateById before calling the provider, then rechecks ownership before dispatch. The transaction-access contract requires that write to finish persistence or throw before returning; the production adapter uses the existing synchronous localStorage-backed Zustand action. A failed intent write prevents dispatch. If recovery persistence also fails, the service reports that failure to the console without dispatching another request. These guarantees rely on the current synchronous storage adapter; an asynchronous replacement must establish an awaited persistence boundary before dispatch.

Only not_started can submit. Existing provider references advance to verification without another request; submitting, accepted, rejected and legacy/missing markers remain unresolved for recovery. Duplicate owners retain the existing conservative recovery behavior and cannot dispatch a second payout. Cleanup cannot abort an already dispatched request; late results cannot change another transfer. The injected MomoPayoutSubmissionResult distinguishes a confirmed reference from rejected/unknown submission responses. Polling has no submission dependency, and an initiation-phase record cannot start it.

No transaction schema, UI, styling, animation, quote calculation or provider request format changes. This is client-side guarding of a persisted intent; provider-side idempotency and coordination across multiple app instances are unchanged.

Run `npm run test:momo-payout-polling` for build, scheduler/flow tests and isolated Chrome processor/store integration. Ordinary status fakes and the shared manual scheduler cover unresolved/rejected/late results, deadlines, saved-ID isolation, cleanup and lost initiation responses. The browser fixture replaces external funding/provider/native boundaries with synthetic adapters; no funded execution is performed. F7 additionally inspects the actual persisted marker at synthetic dispatch, verifies one dispatch across duplicate owners and blocks dispatch on a real Storage.setItem failure. After F8, [fulfillMomoTransaction](src/services/momoFulfillment.ts) owns fulfillment with an explicit transactionId, MomoTransactionAccess, MomoFulfillmentOperations and completion callback. The operations contract exposes payInvoice(invoice), checkMintStatus(quoteId), wait(milliseconds) and now(). The core imports no provider/native/store/timer adapters. [momoFulfillmentOperations](src/services/momoFulfillmentOperations.ts) supplies the existing Lightning payment adapter, native check_transaction_status with its 20-second per-call deadline, real waits and current time. [handleFulfillOrder](src/services/flowServices.ts) remains the production composition wrapper for cash-in and recovery; it supplies the existing store adapter and wallet/address-book completion effects. Existing callers and processor wiring are unchanged.

Recovery still checks the exact mint quote before requesting payment of the saved invoice. An already claimed quote completes without payment. Payment rejection/exception and an unavailable preflight check preserve pending recovery. After payment, status is retried at the existing two-second delay, at most twenty times, with the existing ninety-second budget checked between attempts. That budget is not a strict wall-clock cap on an in-flight status request; each native check retains its own twenty-second deadline. Mint failure messages and normal completion effects are retained.

The existing per-ID fulfillment guard prevents overlapping owners. Each async boundary rechecks the same pending transaction, invoice/quote and expected phase; removing, settling or replacing its data prevents an older owner from paying or updating it. A saved target can continue without modifying another foreground transfer/error. A missing saved quote enters recovery before a native call; a missing invoice blocks payment with a support message. A quote already claimed can still complete an older record without an invoice. Completed/cash-out records cannot start fulfillment. The operation does not abort dispatched payment/native requests, and an unresolved payment is not proof of failure; retries retain the existing quote-first and exact-invoice payment behavior rather than promising provider-side exactly-once execution.

Run `npm run test:momo-fulfillment` for build, ordinary-fake fulfillment tests, existing flow/adapter tests and isolated Chrome cash-in/fulfillment integration. Tests control both external operations and time to fail preflight, payment, post-payment checks, phase/completion saves and retry waits. They cover attempt/budget exhaustion, retry after recovery, claimed-quote payment avoidance, concurrent owners and stale/deleted targets. The production adapter also has a deterministic twenty-second timeout test. Browser tests use real store/wrapper/adapter wiring with synthetic native/payment boundaries. No funded execution is performed. After F9, the Mobile Money effects in [TransactionProcessor](src/hooks/useTransactionProcessor.ts) only start active/saved owners and return cleanup. [momoProcessing](src/services/momoProcessing.ts) owns phase routing plus saved-transfer eligibility, selection, backoff and sequential scheduling. It depends on typed operations, a snapshot reader, scheduler and clock rather than React/store/provider imports. [momoProcessingAdapter](src/services/momoProcessingAdapter.ts) composes the migrated cash-in/payout operations and retains the existing funding/refresh actions. [savedMomoRecoveryAdapter](src/services/savedMomoRecoveryAdapter.ts) supplies store snapshots, checkMomoRecovery, clock, scheduler and the existing error message.

Active cleanup retires the lifecycle guard before cancelling delegated work, is idempotent and observes an ID replacement even before React cleanup. Existing cash-in verification, payout initiation/verification, funding and refresh phase routing is preserved. Saved recovery still starts after five seconds, processes at most one eligible non-active transfer per pass and schedules its next pass five seconds after settlement. Its per-ID backoff remains 30, 60, 120, 240 then 300 seconds, capped at five minutes, with attempt state removed when a transfer is no longer eligible. Unknown funded payouts remain pending; saved recovery never submits another payout or funding payment.

Saved cleanup cancels scheduled work and also guards already queued callbacks before reading state or starting recovery. Unmount during a dispatched recovery prevents rescheduling; it does not abort that request or undo confirmed fulfillment. The legacy funding operation retains its existing internal store/native semantics. F9 left backend transaction/Spark polling unchanged; the following targeted separation moves that orchestration into independent services.

Run `npm run test:momo-processing` for build, ordinary-fake phase/cleanup/backoff tests and isolated Chrome cash-in/payout/fulfillment integration. Browser fixtures control active and saved clocks separately; production uses the existing stateless timeout adapter for both owners. Tests verify real React/store composition, saved foreground isolation, unresolved funded recovery, queued callbacks and unmount cancellation. Payment/provider/native boundaries remain synthetic. Native send recovery diagnostics are described below.

After E9, [MomoSavedTransfers](src/features/momo/MomoSavedTransfers.tsx) renders the page form's existing native details/summary and ID-keyed rows. Its contract exposes readonly row ID/direction/RWF amount and `onResume(id)` only; an empty array renders nothing. It retains row order, formatted labels, View text, native button types, disclosure state and existing scroll/style rules. MomoPaymentForm keeps the list below its shared action and hides it during review. No extra DOM wrapper or CSS is introduced.

Filtering remains in MomoTransferView. Its existing resume callback changes local view state only when the real transaction store accepts the selected ID. The store refuses resume while another transaction occupies the foreground; the list neither imports the store nor initiates recovery/payment work. The differently styled legacy sheet list is unchanged. Run `npm run test:momo-saved-transfers`: its fixture keeps the transaction store/persistence real in a temporary Chrome profile, stubs wallet/provider boundaries, and checks both row IDs, pointer/keyboard selection, reorder/disclosure state, empty/review hiding, actual page resumption and foreground protection. The form harness intentionally leaves a list mounted while a foreground transaction starts to exercise a late-selection guard without changing production UI behavior.

The legacy modal keeps its portal, backdrop, tabs, drag handle and dismissal hook. The old `.momo-page` sizing rules now apply only to roots without `.payment-page-layout`, preserving the not-yet-migrated no-mint route and standalone form fixtures. The migrated view takes widths, padding and safe areas from the shared layout. Production's existing `interactive-widget=resizes-content` viewport policy remains; the migration tests focused input and action placement while available viewport height shrinks, without claiming physical keyboard/WebView verification.

The Mobile Money phone input keeps its existing 2px amber focus outline inside its border with `outline-offset: -2px`. The general page focus rule's outward offset clips at the body's left edge for this full-width field. Apply this inset override only to the phone input; button focus, dimensions, spacing and page overflow stay unchanged.

Bitcoin's page branch supplies its existing `PageHeader` to the shared header slot. Its body remains a column flex container with outer overflow hidden, preserving the entry/keypad grids and the feature's scrollable `.bitcoin-body`. On-chain confirmation uses the shared footer for the existing `bitcoin-actions` wrapper and button, keeping its position, focus outline and shadow outside body clipping. Send/receive state, busy/back guards, paste/scan/contact controls, QR/copy content and animated mint selection remain feature-owned. The legacy sheet retains its portal, backdrop, header/tabs and dismissal hook.

After E10, [BitcoinReceive](src/features/bitcoin/BitcoinReceive.tsx) renders supplied receive values/actions in the existing priority order: success, Lightning invoice, on-chain address, then amount entry. Four early returns replace the nested receive conditional without adding DOM wrappers. Its contract includes mode, raw/display amount, invoice/address, provider deposit amount/fee estimate, copy feedback, limits and disabled/requesting flags, plus explicit request/mode/amount/copy/Back/explorer/Done actions. It owns no payment hook, quote/history lookup, transport client, clipboard or explorer utility. Existing MintIcon/MintName display components continue their established metadata behavior.

After E11, [useBitcoinReceive](src/features/bitcoin/useBitcoinReceive.ts) owns receive mode/amount, request validation, accepted quote/output, settlement matching, copy feedback/timers and session retirement. Its typed ports accept provider requests, clipboard transport, history records and notification callbacks; it imports no SDK, native command, store, toast or router. A session epoch rejects results after amount/mode edits, Back, mint changes, tab changes, close or unmount. A synchronous dispatch guard prevents duplicate requests and remains held until already-dispatched work settles; retirement does not cancel provider work, delete history or undo wallet refreshes. Only the current accepted quote can celebrate, once per generation.

[BitcoinPaymentView](src/features/bitcoin/BitcoinPaymentView.tsx) injects those adapters, shares on-chain limits with send, maps receive notifications to the existing toast/stamp UI, and coordinates tab/navigation/close. Reset clears only a receive-owned stamp. The limits prefetch ignores completions after cleanup. [useBitcoin](src/hooks/useBitcoin.ts) accepts optional silent/error-callback options for receive, send-estimate and on-chain execution operations, allowing the lifecycle to ignore retired errors while preserving default callers’ messages, native payloads, refreshes and dispatch guards. Copy completion/error and its two-second timer belong to the current session and latest copy. Legacy mint selection retires the previous address and waits for another explicit request; it no longer dispatches an ignored address regeneration. Presentation, QR formatting, classes and animations are unchanged. Run `npm run test:bitcoin-receive-lifecycle` for typed ports, deferred lifecycle races and actual view/adapter integration with synthetic transport.

After E12, [BitcoinDestinationEntry](src/features/bitcoin/BitcoinDestinationEntry.tsx) renders the supplied destination, scanner visibility/content, parsed input, LNURL validation, balance/processing flags and on-chain minimum. Its explicit actions cover editing, paste, scanner open/cancel, address-book open, Pay Invoice and Next. It keeps the same field/toolbar, shared FormField/IconButton, existing AddressBookAutocomplete and LnurlValidationStatus, scanner frame and feedback/button markup, with no added wrapper. The existing shared autocomplete retains its contact-store behavior; the feature component adds no store, parser, validation request, clipboard, camera, router or payment-client dependency. Scanner content is a ReactNode supplied by the parent, keeping the actual scanner callbacks and error toast at the adapter boundary.

Following E14, the view supplies live validation, clipboard transport, scanner result/error mapping and modal selection. The send hook owns destination/amount state, parsing, paste retirement and transitions; the view keeps scanner/address-book visibility. Run `npm run test:bitcoin-destination-entry` for compiler contracts, direct supplied-action checks and actual page/legacy destination regressions; fixtures use synthetic clipboard/scanner/provider boundaries. The presentation preserves disabled/loading/error states, label association, keyboard access and dropdown animation. Existing 12px field feedback/toolbar sizes and scanner corner strokes are retained.

After E13, [BitcoinSendReview](src/features/bitcoin/BitcoinSendReview.tsx) displays explicit mint/destination, amount, network/bridge fee, Lightning/mint fee and total values; it does not recompute the estimate. BitcoinPaymentView maps the provider estimate fields (`amount`, `ark_fee`, `cashu_fee`, `total_cost`) to those display props. The same file exports BitcoinSendConfirmation with only `paying` and `onConfirm` props, retaining the existing native disabled/loading behavior, text and classes. Review receives confirmation content and an explicit Back callback. Page confirmation stays in the parent's existing fixed action footer; legacy confirmation and Back stay inline. No DOM wrapper is added.

Following E14, the send hook owns estimates, execution, Back transitions and submission/result guards; the parent supplies adapters, renders the selected flow’s result and coordinates shell navigation/close. Shared MintIcon/MintName retain their metadata behavior. The new presentation imports no store, provider, native command, router or payment hook. Destination/amount entry and receive presentation are unchanged. Run `npm run test:bitcoin-send-review` for compiler contracts, supplied-value/action checks and actual page/legacy review forwarding with synthetic estimates/execution. These tests verify distinct fee mapping, a supplied total, zero-valued fees, busy confirmation, Back and placement. Duplicate-submission protection belongs to the send lifecycle below.

After E14, [useBitcoinSend](src/features/bitcoin/useBitcoinSend.ts) owns destination, amount, input/amount/review transitions, LNURL parameters, accepted estimate, paste preparation, submission/result state and explicit retry. It imports React, the pure Bitcoin parser and type-only contracts; live validation reads, clipboard, LNURL resolution/invoice creation, estimation, payment execution, error reporting and successful-contact bookkeeping are injected. Validation reads are bound to the requested destination so a same-turn edit cannot reuse the previous address's cached result. The view remains the adapter/composition boundary and shares limit data between send and receive; redundant limit fetching from Next is removed.

A synchronous operation lock spans each async preparation/payment, while a session epoch retires results after destination/amount/mint/activity changes, Back, reset, close or unmount. Retired operations retain the dispatch lock until settlement. In particular, a retired LNURL invoice is never passed to the payment port. An accepted review captures mint, destination, requested input and estimate values. An attempt captures those payment arguments and blocks duplicate confirmation both while pending and after success. A reported failure permits the existing explicit Retry action, or Go back followed by a fresh confirmation; retry reuses its captured intent and both paths share the same guard. Edits/navigation retire the old attempt. There is no automatic retry. This is a foreground-instance guard, not durable backend idempotency or unknown-outcome recovery.

Cancellation does not abort or undo an already-dispatched payment. Adapter wallet refreshes still run; successful contact usage records the captured destination even when its foreground UI is gone, and bookkeeping errors cannot turn success into failure. Late payment results and estimate/execution errors cannot open a new session's overlay/toast. Default adapter callers retain their original notifications, payloads, native guards and refreshes; lifecycle callers opt into scoped error callbacks. Send result and retry state are isolated from receive settlement state. Existing layouts, classes, fee calculations, QR content, dropdown motion and controls are preserved. Run `npm run test:bitcoin-send-lifecycle` for contracts, deferred race tests, StrictMode cleanup and actual view/adapter checks with synthetic transports.

The receive component keeps the original 200px QR encoder, BIP-21 formatting (including amount-free zero/null deposit fallback), fee zero/dash presentation, copy payload/type/labels, mint display, mode/keypad controls, warnings, buttons and all classes/animation. The existing 10px mint initials/BIP-21 help and 11px invoice/URI/help text are retained feature-specific sizes, rather than a typography redesign. The send-scanner's four corner strokes remain the existing scanner glyph, not side accents added to a card. Run `npm run test:bitcoin-receive` for compiler contracts, direct supplied-value/action checks and actual receive-page transitions. The direct fixture records QR values while retaining the real encoder; clipboard, explorer and provider actions are synthetic. Existing Bitcoin page, destination and mint-picker suites remain integration checks.

The send/receive no-mint views also use the layout, with the existing centered message, `Manage mints` link and back destination. All Bitcoin roots now get outer widths, padding and safe areas from the shared stylesheet; the duplicated Bitcoin root sizing rules are removed. The layout migration itself adds no provider policy; the presentations and lifecycle hooks above describe the E10–E14 split.

### Bottom sheets and dialog ownership

[The bottom-sheet inventory](BOTTOM_SHEET_INVENTORY.md) records the ten pre-shell hook consumers, their application mounts, close paths, busy-state guards and adjacent non-sheet overlays. E4 audits those callers, E5 adds the shell, and E6 migrates ActionMenuModal's two live Send/Receive mounts.

`useBottomSheet` owns motion, handle gestures, exit cleanup and reference-counted scroll locking. Unmigrated callers still own naming, focus, Escape and business cleanup. Preserve each caller's actual dismissal policy: disabled action buttons do not imply blocked dismissal, and closing UI does not imply cancelling an operation. Keep anchored mint dropdowns, full-screen loaders/results, page navigation and redirect adapters distinct from the dialog shell. ActionMenuModal's two menus own no async submission state and retain callback-before-close order and current appearance/motion.

#### Shared shell contract (E5)

[BottomSheet](src/components/shared/BottomSheet.tsx) adds a body portal, backdrop and named modal dialog around one unchanged hook instance. Its [dialog helper](src/components/shared/useBottomSheetDialog.ts) owns focus and keyboard interaction. ActionMenuModal is its first live caller after E6. This custom portal can yield to existing non-native loading/result overlays; a native dialog's top layer would instead cover them.

Mount the shell conditionally and unmount it in `onClose`. Supply exactly one accessible name, `aria-label` or `aria-labelledby`; the latter must identify a rendered heading. Optional `aria-describedby` identifies a short description. The naming and keyboard contract follows the [WAI-ARIA modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

```tsx
{open && <BottomSheet aria-labelledby="actions-title" onClose={() => setOpen(false)}>
  {({ closeButtonProps, dragHandleProps, close }) => <>
    <header>
      <div {...dragHandleProps}>Drag handle</div>
      <h2 id="actions-title">Actions</h2>
      <button {...closeButtonProps}>Close</button>
    </header>
    <div className="min-h-0 overflow-y-auto">Caller-owned content</div>
    <footer><button type="button" onClick={close}>Done</button></footer>
  </>}
</BottomSheet>}
```

- `initialFocusRef` may identify an enabled, visible focusable control or a heading with `tabIndex={-1}`. Otherwise the first eligible control gets focus; a control-free dialog focuses its panel. Tab/Shift+Tab stay inside, including after controls become hidden/disabled. Radio groups retain native keyboard behavior.
- `returnFocusRef` may identify a logical destination. Otherwise focus returns to the connected opener. If neither remains, the helper focuses the remaining parent dialog or document body; it preserves focus deliberately moved elsewhere during navigation.
- `dismissible={false}` guards backdrop, supplied close button, `close()`, drag and Escape together. It keeps content usable and has no payment-state meaning. Callers keep cleanup and business decisions in `onClose` and must not bypass the guard with raw close callbacks.
- Owned nested shells use a context-backed layer stack. Only the top owns focus/Escape; lower panels are inert and hidden from the accessibility tree. Escape handled by a child editor via `preventDefault` is respected. Consumed sheet Escape cannot also dismiss an underlying dialog.
- Set `suspended` while a **separate, non-shell overlay** is active. The shell yields focus/Escape and disables its dismissal; a suspended top shell remains a barrier above lower shells. The external overlay must supply its own naming, focus/keyboard handling, pointer coverage and lifecycle. Resume after it closes. Legacy dialogs, dropdowns, loaders and results do not join this stack automatically; do not migrate a caller containing them without explicit ownership tests.
- Ownership releases at the start of exit. The hook retains its 280ms close callback, earlier completion before the next press, deduplication and cancellation on unmount. Callers must allow `onClose` to remove the shell; a closing instance is not reusable.

[Shell CSS](src/components/shared/BottomSheet.css) supplies mobile bottom alignment, desktop centering at 640px, 480px maximum width, 92dvh maximum height and semantic surface/text defaults. `className` and `backdropClassName` preserve caller skins. Callers keep padding, scrollable content, safe-area spacing, visible headers/actions, close icons and handle presentation. Utility classes can override component-layer defaults. Normal hook transitions remain intact; reduced motion removes visual transitions only for the new shell, keeping lifecycle timing unchanged.

Run `npm run test:bottom-sheet-shell` for type and real-Chrome shell checks, and `npm run test:bottom-sheets` for the original hook regression fixture. The new fixture uses synthetic actions without application providers. Browser and accessibility-tree checks do not replace screen-reader or native-device testing.

#### Action menus (E6)

[ActionMenuModal](src/components/home/ActionMenuModal.tsx) supplies its existing skin/content and handle/header gestures to the shared shell. A generated heading ID names the dialog. The supplied close-button props provide native type/disabled behavior and a contextual `Close Send menu` / `Close Receive menu` name; the X is decorative. Initial focus, Tab containment, Escape and trigger return now come from the shell. Options retain native button activation, label/icon order, callback-before-close ordering and the original behavior when a no-mint callback returns without navigating. Navigation may unmount the menu before the delayed close callback; the hook cancels that pending work.

The panel keeps its original classes plus `max-h-none` to override the shell's 92dvh cap. The backdrop keeps `p-0 sm:p-4`: with the app's 17px root font this preserves 17px desktop spacing, rather than the shell's default 16px. Existing texture, borders, colors, radii, shadows, option padding and motion stay intact. This also preserves the existing Send menu's top overflow at 390×480; E6 does not redesign its short-screen content layout.

Run `npm run test:action-menu`. Its fixture mounts the real menu and real WalletBalanceCard Send/Receive callers and router, substituting only wallet/currency/mint/native boundaries. Tests cover the menu contract/lifecycle and all seven destination callbacks, forwarded mint state, native keyboard trigger return and no-mint guards. Temporary before/after captures verify the original visual presentation; committed geometry/style assertions also run without those local captures.

## Elevation & Depth
Depth avoids synthetic drop shadows, leaning instead into **Tonal Stacking** paired with **Low-Contrast Forest Outlines**:
- **Layer 0 (Base Canvas):** `#0D1713`.
- **Layer 1 (Cards, Ledger Sheets):** `#15221C` encircled with a 1px boundary of `rgba(247, 244, 235, 0.06)`.
- **Layer 2 (Modals, Overlays, Floating Keypads):** `#1E2E27` with a 1px amber boundary `rgba(229, 168, 59, 0.2)` and a soft ambient glow: `0 16px 48px -8px rgba(0, 0, 0, 0.6)`.
- **Active State Highlights:** Action states utilize an amber rim-light effect (`box-shadow: inset 0 1px 0 rgba(229, 168, 59, 0.3)`), invoking the rimmed gold coin edge from the primary emblem.

## Shapes
A roundedness factor of `2` strikes a precise balance between soft luxury and cryptographic structure:
- **Base Surfaces & Cards:** Standard `rounded-lg` (1rem / 16px) creates sturdy containers.
- **Buttons & Dynamic Pills:** `rounded-xl` (1.5rem / 24px) or full circular pills for instant action surfaces (Send, Receive, QR toggle).
- **QR Viewports & Key Badges:** `rounded-lg` (16px) with an inner concentric circle geometry, drawing directly from the circular coin iconography.
- **Bottom sheets:** 28px mobile top corners and 24px desktop corners preserve the existing sheet family; caller classes may retain a particular sheet's current radius during migration.

## Components

### Buttons

`PrimaryActionButton` supplies the Mobile Money form's primary action after D8 and the conversion form's review, confirmation, progress and completion actions after D9. Its common base mirrors those implementations: `#f2a93b` background, `#06110c` text, 44px minimum height, 16px corners, 15px text and weight 600. These fixed colors intentionally preserve the current actions in both themes; this extraction does not recolor them. Its CSS lives in the components layer so feature padding, hover, focus and short-screen rules take precedence. Mobile Money retains its 10px/16px padding and 36px minimum height/13px text/6px vertical and 8px horizontal padding on short screens. Conversion retains its flex layout, 8px icon gap, 12px/18px padding, amber hover/focus with a 4px focus offset, and 32px minimum height/13px text/6px vertical and 8px horizontal padding on short screens. Conversion secondary buttons retain their separate 52px minimum height and 26px corners. Compare against the recorded values before removing any further declarations.

The button requires an explicit native `type`. Plain text supplies its accessible name; composed content requires an explicit `aria-label`. `loading` sets `aria-busy` and native `disabled`, preserving any independent `disabled` condition. Callers keep their label text and icons, including loading text/spinners; the component does not inject content or own submission logic. Native button attributes and refs are forwarded.

`IconButton` supplies the Scan/Bitcoin address-book controls, Mint Info URL copy, and transaction-detail identifier/token/quote/address copy controls after D11. It requires an explicit native `type`, a descriptive `aria-label` and one caller-supplied icon element. Native attributes, events and button refs are forwarded. Callers own icon changes, tooltips, copy/address-book operations and feedback; decorative icons should use `aria-hidden="true"`. The migrated copy handlers retain their existing success/error messages and two-second checkmark reset. Scan and Bitcoin retain their page-owned amber focus styling; the copy controls use the shared semantic focus default.

Its components-layer stylesheet centers the icon, supplies the pointer cursor, uses opacity `.4`/the default cursor when natively disabled, and shows one 2px `on-surface` keyboard-focus outline with a 3px offset. It imposes no padding, size, radius, color, hover effect or motion. Preserve those through caller classes and compare the result before migrating. Remove redundant `cursor-pointer` utilities when delegating cursor states to the primitive; higher-priority utilities and feature CSS can override its defaults. Use native `disabled` to block activation. Text-and-icon actions remain outside this icon-only primitive.

- **Primary ("Lightning Send / Confirm"):** Rich ochre amber (`#E5A83B`) background with deep obsidian text (`#0D1713`), weight 600. Subtle top inner highlight. Hover scales to `#EBB755`.
- **Secondary ("Receive / Scan"):** Forest slate surface (`#1E2E27`) with crisp cream text (`#F7F4EB`) and an amber-tinted border (`rgba(229, 168, 59, 0.3)`).
- **Ghost:** Transparent background, cream text, glowing ochre text on hover/active.

### Chips & Badges
- **Status Pills:** Background `#0E2E20`, border `rgba(229, 168, 59, 0.4)`, text `#E5A83B` in JetBrains Mono uppercase (`.status-pill`).
- **Network Tag (Lightning vs On-Chain):** On-chain uses subtle cream slate (`#15221C`); Lightning uses vibrant ochre accents with lightning icon badge.

### Lists & Transaction Feeds
- **Feed Row:** Flat `#15221C` container separating ledger entries with 1px border lines in `rgba(247, 244, 235, 0.04)`.
- **Positive Inflow:** Value displayed in `#E5A83B` with bold directional chevron.
- **Outflow:** Displayed in `#F7F4EB` with muted subtext in `#8B9E94`.

### Input Fields & Keypads

`FormField` supplies the Mobile Money phone field after D13 and Bitcoin's send-destination field after D14. Their shared structure is a visible label above a caller-owned control area, which can include an input/textarea and separate action buttons. The component stacks this content without setting input styles, typography or spacing. Root, label, hint and error class props preserve feature styling. Hint/error text uses the semantic muted/error colors by default.

Mobile Money keeps `momo-page-phone`, its top-up/cashout labels, telephone/autofill attributes, digit filtering, ten-digit limit, Enter-to-blur and feature-owned address-book button. Its entry feedback combines phone, amount, rate and payment messages, so it remains in the existing polite live region. Review feedback keeps its existing alert. These aggregate messages are not passed to the phone field's `error` prop.

Bitcoin keeps its textarea, border/validation states, paste/clear toolbar, address-book/autocomplete actions and scanner flow. `Pay to:` is now an associated native label, using the field's generated control ID. The feature keeps its invoice, balance, address and LNURL status messages outside the shared field. The field uses the existing `gap-1.5` spacing; on short page layouts, `BitcoinPages.css` uses `display: contents` on its wrapper so the label and control shell retain their original grid cells. The legacy layout keeps the normal vertical stack. Other field layouts and shared styles remain unchanged.

The render callback receives `id`, `aria-describedby` and `aria-invalid`; spread these onto the primary input or textarea. Its native attributes, events, value and ref remain caller-owned. The component does not clone controls, normalize input, validate payments, disable sibling actions or place buttons inside the label.

```tsx
<FormField label="Phone number" hint="Enter the phone number.">
  {control => <input {...control} type="tel" autoComplete="tel-national" />}
</FormField>
```

By default, React `useId` keeps control IDs unique and stable across updates and keyed reordering. An explicit `id` preserves an existing control ID; callers must ensure it is unique and reserve its `-hint`/`-error` suffixes. `describedBy` preserves external description IDs, deduplicated before the mounted hint/error references. Empty, null or omitted messages create no nodes or references. An error sets `aria-invalid` and renders an alert; hints have no live-region behavior. Pass field-specific validation here and keep page/payment failures in the feature's own feedback area to avoid duplicate announcements.

- **Amount Input:** Transparent or `#15221C` backdrop, zero border except for a continuous bottom baseline or subtle container stroke. Large `display-hero` numeric text in `#F7F4EB`. Unit denomination toggle (SATS / BTC / USD) as an ochre pill on the right.
- **Address & Hash Input:** Monospaced JetBrains Mono (`font-mono` / `label-code`), background `#101C16`, with integrated paste and camera icon buttons on the trailing edge.

Ecash description, public-key and token fields use `EcashFields.css`: semantic surface, border and text colors with opaque muted placeholders in both themes. Each field has one 2px inset focus outline (amber in dark mode, the outline tone in light mode). The token container owns focus for its textarea and toolbar. Do not stack a shadow ring or page-level input outline on these fields; the inset stroke stays within clipped containers without changing their size. Spacing, typography and validation remain feature-owned.

### QR Code Presentation Card
- Framed in an ivory-tinted circular/rounded container (`#F7F4EB`), ensuring high-contrast machine readability while wrapped externally in dark forest velvet (`#0A2218`) accompanied by an ochre perimeter ring.

`SafeQRCode` renders the existing encoder with the caller's payload and class, at 180px by default or the supplied size. Its conservative guard uses UTF-8 bytes: empty values and values above 2,000 bytes show the existing fallback. This is an application cutoff, not a universal QR capacity or scan guarantee. A child rendering error shows `QR Code Unavailable`; both fallbacks preserve the requested dimensions and optional copy instruction.

After a rendering error, changing the payload retries the encoder. Updating only the size or instruction leaves the failed payload on its fallback. Healthy payload updates retain the SVG element rather than remounting it, preserving the normal update path for caller-owned animation. The component performs no clipboard work: callers own the copy button, original payload, success/error feedback and instructions that describe their actual action. D15 verifies this contract.

`InvoicePaymentPending` uses this wrapper for its static 200px invoice QR (D16). Its successful QR retains the original black/white encoder output and white presentation frame. Two selectors on that frame apply only to a fallback `div` and its paragraphs: an opaque `surface-container-lowest` background and `on-surface` text keep the instruction readable in both themes. The instruction names the existing `Copy Lightning Invoice` action. The full invoice text, clipboard handler, copied state, status/cancel actions and loading/error feedback remain feature-owned. This migration does not change other direct QR callers or animated UR flows.


### Lightning/Cashu and Spark reconciliation

[TransactionProcessor](src/hooks/useTransactionProcessor.ts) now starts independent reconciliation owners through [walletReconciliationAdapter](src/services/walletReconciliationAdapter.ts). [walletReconciliation](src/services/walletReconciliation.ts) owns native transaction scanning and manual transaction-type routing; [sparkReconciliation](src/services/sparkReconciliation.ts) owns Spark timer/event triggers and in-flight coordination. Both accept typed operations, scheduler and lifecycle cleanup rather than importing React or native/provider implementations.

The Cashu scanner starts immediately and schedules its next scan two seconds after the transaction-list read settles. Status jobs run independently per receipt; the next scan does not await an unrelated pending status request. Outstanding IDs are not checked again by the same owner. The production status reader also coalesces outstanding automatic/manual/remount reads for the same ID, releasing them on settlement/error rather than caching a status. Completed receipts refresh the wallet. Existing native transaction-type eligibility and the active Mobile Money quote exclusion are retained.

Ordinary Lightning/Cashu status checks never call or await Spark. On-chain jobs retain Spark-before-native ordering within their own asynchronous job, without blocking other receipts. History's manual check uses the same routing service: ReceiveOnchain and SendOnchain reconcile Spark before native status; other types go directly to native status. Spark failure still allows an on-chain native check, matching the previous manual recovery behavior. Toasts and subsequent history/wallet refresh behavior are unchanged.

The Spark owner requests an initial reconciliation, then requests checks on a fifteen-second timer and the existing claimedDeposits/unclaimedDeposits/newDeposits/paymentSucceeded events. Pending on-chain receipts can request an earlier attempt. Its shared single-flight coordinator joins timer/event/manual triggers to the same outstanding work. Initial/periodic work still selects the preferred mint from an eligible pending on-chain receipt, excluding the active quote. Hints arriving during outstanding work are coalesced; still-pending receipts are reconsidered on later scans. Existing syncAndSweepSpark, send reservation guards, isSweeping and withSparkBalanceLock implementation are unchanged, including direct SDK send flows that already use the balance lock.

Each owner ignores queued triggers and late refreshes after cleanup; an automatic on-chain job waiting for Spark checks its lifecycle before dispatching native status. Already-dispatched native/Spark work is not aborted and may still persist its result. This removes the frontend sequencing dependency, not native wallet mutex contention, gateway/mint latency or encrypted-save costs. Lightning send/UI completion and native payment logic are unchanged.

Run `npm run test:wallet-reconciliation` for build, deterministic service tests and isolated Chrome production-wiring regressions, including existing Mobile Money/fulfillment coverage. Fixtures use synthetic payment/native/Spark boundaries and independent scheduling clocks; no funded execution is performed.


### Native eCash send recovery diagnostics

G1 changes only the split-error recovery branch in [send_ecash_operation](src-tauri/src/commands/send.rs). A failed split still leaves its receipt pending and returns OUTCOME_UNKNOWN with the original transaction ID. When the subsequent recovery save succeeds, the original split-error message is unchanged. When that save fails, the returned diagnostic includes both the split error and the save-error chain, explicitly keeps the outcome unknown and says not to resend. The receipt-correlated diagnostic is also written to stderr; no new logging infrastructure is introduced.

The structured v2 error shape and legacy message conversion are unchanged. Frontend handling remains code-based and shows its existing safe History guidance rather than displaying raw provider/filesystem diagnostics; the unresolved-send guard continues to block another dispatch. A failed recovery save does not mark the send as failed, report the latest update as saved, or retry the swap. This does not guarantee that a save can succeed while storage is unavailable.

The native regression uses an isolated temporary wallet and localhost-only mint responses. After the initial pending intent is saved, the fixture preserves that snapshot and replaces the destination file with a directory to force the later rename/save to fail. It verifies both diagnostics, original receipt identity, pending state and legacy compatibility. The fixture fails during swap preparation and issues only two GETs; it does not simulate a funded swap, real process termination or a mint spending proofs. The frontend regression verifies one dispatch across two attempts after the combined OUTCOME_UNKNOWN error. G2's receive recovery path is unchanged.
