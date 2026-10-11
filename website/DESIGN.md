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
  inverse-surface: '#dae5de'
  inverse-on-surface: '#28332e'
  outline: '#9d8f7c'
  outline-variant: '#504535'
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
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Sora
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Sora
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  headline-sm:
    fontFamily: Sora
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-numeric:
    fontFamily: Space Grotesk
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-code:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-tag:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
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
Typography is orchestrated across three distinct roles:
1. **Headlines (`Sora`):** Geometrically structured with refined warmth. Its circular geometry echoes the emblem’s coin motifs, providing authoritative clarity for large amounts, wallet totals, and modal headers.
2. **Body (`Manrope`):** Unfussy, highly legible modern grotesque providing rhythmic clarity across transactional ledgers, user memos, and multi-step backup seed phrases.
3. **Data & Identifiers (`Space Grotesk`):** Engineered for lightning invoice hashes, satoshi counters, node public keys, and fee-rate counters. Its fixed-rhythm aesthetic guarantees alignment in financial calculations.

## Layout & Spacing
The layout model follows a structured fluid grid optimized primarily for handheld tactical utility (4-column mobile grid), expanding into unified center-focused financial command surfaces on desktop (8-column tablet, 12-column desktop capped at a max-width of 1280px).

- **Mobile First:** Generous touch targets with 16px lateral padding ensure one-handed ergonomics. Primary actions pin persistently above safe-area viewports.
- **Rhythm:** Spacing follows an 8pt step system. Data tables and cryptographic lists collapse to tight 4pt paddings (`space-xs`) for dense balance inspection, while cards and module sections breathe across 24px–40px thresholds (`space-lg` and `space-xl`).

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

## Components

### Buttons
- **Primary ("Lightning Send / Confirm"):** Rich ochre amber (`#E5A83B`) background with deep obsidian text (`#0D1713`), weight 600. Subtle top inner highlight. Hover scales to `#EBB755`.
- **Secondary ("Receive / Scan"):** Forest slate surface (`#1E2E27`) with crisp cream text (`#F7F4EB`) and an amber-tinted border (`rgba(229, 168, 59, 0.3)`).
- **Ghost:** Transparent background, cream text, glowing ochre text on hover/active.

### Chips & Badges
- **Status Pills:** Background `#0E2E20`, border `rgba(229, 168, 59, 0.4)`, text `#E5A83B` in `Space Grotesk` uppercase (`label-tag`).
- **Network Tag (Lightning vs On-Chain):** On-chain uses subtle cream slate (`#15221C`); Lightning uses vibrant ochre accents with lightning icon badge.

### Lists & Transaction Feeds
- **Feed Row:** Flat `#15221C` container separating ledger entries with 1px border lines in `rgba(247, 244, 235, 0.04)`.
- **Positive Inflow:** Value displayed in `#E5A83B` with bold directional chevron.
- **Outflow:** Displayed in `#F7F4EB` with muted subtext in `#8B9E94`.

### Input Fields & Keypads
- **Amount Input:** Transparent or `#15221C` backdrop, zero border except for a continuous bottom baseline or subtle container stroke. Large `display-hero` numeric text in `#F7F4EB`. Unit denomination toggle (SATS / BTC / USD) as an ochre pill on the right.
- **Address & Hash Input:** Monospaced `Space Grotesk` font, background `#101C16`, with integrated paste and camera icon buttons on the trailing edge.

### QR Code Presentation Card
- Framed in an ivory-tinted circular/rounded container (`#F7F4EB`), ensuring high-contrast machine readability while wrapped externally in dark forest velvet (`#0A2218`) accompanied by an ochre perimeter ring.