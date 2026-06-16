---
name: Obsidian Ledger
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#dbc2ae'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#a38d7b'
  outline-variant: '#554335'
  surface-tint: '#ffb874'
  primary: '#ffb874'
  on-primary: '#4b2800'
  primary-container: '#f7931a'
  on-primary-container: '#603500'
  inverse-primary: '#8c4f00'
  secondary: '#c9c6c2'
  on-secondary: '#31302d'
  secondary-container: '#474743'
  on-secondary-container: '#b7b5b0'
  tertiary: '#e9c176'
  on-tertiary: '#412d00'
  tertiary-container: '#cba65e'
  on-tertiary-container: '#543b00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdcbf'
  primary-fixed-dim: '#ffb874'
  on-primary-fixed: '#2d1600'
  on-primary-fixed-variant: '#6b3b00'
  secondary-fixed: '#e5e2dd'
  secondary-fixed-dim: '#c9c6c2'
  on-secondary-fixed: '#1c1c19'
  on-secondary-fixed-variant: '#474743'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#e9c176'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#5d4201'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 24px
  gutter: 16px
  card-gap: 20px
---

## Brand & Style

The design system is rooted in the concept of "Digital Materiality." It bridges the gap between the ephemeral nature of cryptocurrency and the trusted, tactile heritage of physical finance. The brand personality is authoritative, secure, and sophisticated.

The aesthetic utilizes **Skeuomorphic-lite** principles combined with **Modern Minimalism**. It avoids the flat, "wireframe" look of typical crypto-apps in favor of depth, texture, and light play. By using obsidian-like surfaces, subtle paper textures, and glowing orange accents, the system evokes the feeling of a premium high-tech vault. 

Targeting an audience that values both the innovation of Bitcoin and the reliability of established financial institutions, the UI should evoke a sense of "Weighty Digital Wealth."

## Colors

The palette is anchored by **Obsidian Black** and **Deep Charcoal** to create a focused, high-contrast environment. 

- **Bitcoin Orange (#F7931A):** Used strictly for primary actions, success states, and critical branding moments. It should "glow" against the dark backgrounds.
- **Paper White (#F5F2ED):** A warm, off-white used for secondary surfaces, typography, and iconography to soften the digital coldness.
- **Gold/Bronze Gradients:** A linear gradient from `#C5A059` to `#916B2F` is reserved for interactive states and premium component borders.
- **Semantic Colors:** Success is handled by a muted mint green; errors are a deep, desaturated crimson to maintain the "Pro" aesthetic.

## Typography

This design system uses a tri-font hierarchy to balance character and utility:

1. **Sora (Headlines):** A geometric sans-serif with unique quirks that feel "tech-forward." Used for large balances and page titles.
2. **Inter (Body):** The industry standard for readability. Used for all functional descriptions and long-form text.
3. **JetBrains Mono (Labels/Data):** A monospaced font used for "Paper" serial numbers, wallet addresses, and technical metadata, reinforcing the "Ledger" feel.

All headings should use a tight letter-spacing to feel more intentional and "expensive."

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop (max-width 1200px) and a **Fluid Fluid** model for mobile.

- **Rhythm:** A strict 8px base unit drives all padding and margins.
- **Margins:** Desktop uses a generous 40px margin to evoke a luxury editorial feel. Mobile scales down to 20px.
- **Safe Areas:** Interactive elements must maintain a minimum 48px touch target, surrounded by at least 12px of clear space.
- **Reflow:** On mobile, side-by-side card elements (like Mint URLs) must stack vertically to maintain legibility of the monospaced data.

## Elevation & Depth

Depth is the primary differentiator of the design system. It uses three distinct layers:

1.  **Floor (Obsidian):** The deepest background level. Pure black or near-black.
2.  **Raised Ledger (Charcoal + Paper Texture):** Cards and main containers. These use a 1px inner shadow (Top-down, 20% opacity white) to create a "beveled" edge and a subtle noise/grain texture overlay (2% opacity) to mimic premium cardstock.
3.  **Active Glass (Glassmorphism):** Modals, dropdowns, and navigation bars use a backdrop blur (20px) with a semi-transparent Charcoal fill (70% opacity).

**Active Glow:** Focused inputs or primary buttons should feature a soft, colored outer glow (Bitcoin Orange) with a 15px spread at 15% opacity.

## Shapes

The design system utilizes **Rounded (2)** shapes to soften the technical nature of Bitcoin. 

- **Cards & Inputs:** 16px corner radius.
- **Primary Buttons:** Fully pill-shaped (32px+) to distinguish them from container elements.
- **Status Chips:** 4px radius (Soft) to keep them feeling like "stamps" or "tags" rather than structural components.
- **Visual Motif:** Use subtle circular "punches" or "perforations" in card designs where two sections meet, mimicking the look of a detachable paper voucher.

## Components

### Buttons
- **Primary:** Gold/Bronze gradient background, bold black text, pill-shaped.
- **Secondary:** Transparent with a 1px "Paper White" border and 10% white fill on hover.
- **Tertiary:** Text-only with an underline that grows from the center on hover.

### Cards (The "Notes")
Cards are the hero of the system. They must feature a subtle paper grain texture. Use a horizontal "divider" line that looks like a perforated edge for transaction details.

### Input Fields
Inputs should be recessed. Use a deep obsidian fill with a soft inner shadow (inset 0 2px 4px rgba(0,0,0,0.5)). The label should always use **JetBrains Mono** in all caps.

### Navigation (The Vault Bar)
The bottom navigation (mobile) or top bar (desktop) should use glassmorphism. Active states are indicated by the Bitcoin Orange color and a small 4px glowing dot beneath the icon.

### Scanners & QR Codes
QR codes should be framed in a "viewfinder" style with glowing orange corners, separated from the rest of the UI via a heavy backdrop blur.