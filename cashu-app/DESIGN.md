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

The legacy modal keeps its portal, backdrop, tabs, drag handle and dismissal hook. The old `.momo-page` sizing rules now apply only to roots without `.payment-page-layout`, preserving the not-yet-migrated no-mint route and standalone form fixtures. The migrated view takes widths, padding and safe areas from the shared layout. Production's existing `interactive-widget=resizes-content` viewport policy remains; the migration tests focused input and action placement while available viewport height shrinks, without claiming physical keyboard/WebView verification.

The Mobile Money phone input keeps its existing 2px amber focus outline inside its border with `outline-offset: -2px`. The general page focus rule's outward offset clips at the body's left edge for this full-width field. Apply this inset override only to the phone input; button focus, dimensions, spacing and page overflow stay unchanged.

Bitcoin's page branch supplies its existing `PageHeader` to the shared header slot. Its body remains a column flex container with outer overflow hidden, preserving the entry/keypad grids and the feature's scrollable `.bitcoin-body`. On-chain confirmation uses the shared footer for the existing `bitcoin-actions` wrapper and button, keeping its position, focus outline and shadow outside body clipping. Send/receive state, busy/back guards, paste/scan/contact controls, QR/copy content and animated mint selection remain feature-owned. The legacy sheet retains its portal, backdrop, header/tabs and dismissal hook.

The send/receive no-mint views also use the layout, with the existing centered message, `Manage mints` link and back destination. All Bitcoin roots now get outer widths, padding and safe areas from the shared stylesheet; the duplicated Bitcoin root sizing rules are removed. This migration does not extract receive/send workflows or change provider lifecycles; those remain E10–E14.

### Bottom sheets and dialog ownership

[The bottom-sheet inventory](BOTTOM_SHEET_INVENTORY.md) records the ten pre-shell hook consumers, their application mounts, close paths, busy-state guards and adjacent non-sheet overlays. E4 audits those callers. E5 adds the shared shell; the first live migration remains E6.

`useBottomSheet` owns motion, handle gestures, exit cleanup and reference-counted scroll locking. Existing callers still own naming, focus, Escape and business cleanup. Preserve each caller's actual dismissal policy: disabled action buttons do not imply blocked dismissal, and closing UI does not imply cancelling an operation. Keep anchored mint dropdowns, full-screen loaders/results, page navigation and redirect adapters distinct from the dialog shell. ActionMenuModal is the proposed first migration because its two live menus own no async submission state; preserve its callback-before-close order and current appearance/motion.

#### Shared shell contract (E5)

[BottomSheet](src/components/shared/BottomSheet.tsx) adds a body portal, backdrop and named modal dialog around one unchanged hook instance. Its [dialog helper](src/components/shared/useBottomSheetDialog.ts) owns focus and keyboard interaction. No live caller uses it yet. This custom portal can yield to existing non-native loading/result overlays; a native dialog's top layer would instead cover them.

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
