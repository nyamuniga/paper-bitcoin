---
name: Obsidian Gold
colors:
  surface: '#111113'
  surface-dim: '#0e0e10'
  surface-bright: '#2a2a2d'
  surface-container-lowest: '#0a0a0c'
  surface-container-low: '#141416'
  surface-container: '#161618'
  surface-container-high: '#1c1c1f'
  surface-container-highest: '#252527'
  on-surface: '#e8e5e0'
  on-surface-variant: '#9e9a92'
  inverse-surface: '#e8e5e0'
  inverse-on-surface: '#1a1a18'
  outline: '#5a564e'
  outline-variant: 'rgba(158, 124, 56, 0.2)'
  surface-tint: '#c9a54a'
  primary: '#c9a54a'
  on-primary: '#0e0e10'
  primary-container: '#9e7c38'
  on-primary-container: '#ffdcbf'
  inverse-primary: '#7a5f2a'
  secondary: '#9e9a92'
  on-secondary: '#e5e2dd'
  secondary-container: '#252527'
  on-secondary-container: '#e5e2dd'
  tertiary: '#c9a54a'
  on-tertiary: '#c9a54a'
  tertiary-container: '#9e7c38'
  on-tertiary-container: '#ffdcbf'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  background: '#0e0e10'
  on-background: '#e8e5e0'
  surface-variant: '#1c1c1f'
typography:
  display-lg:
    fontFamily: Poppins
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Poppins
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Poppins
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

The design system draws from the same aesthetic as the BitNotes website — a futuristic, minimalist, modern identity. While the website uses a light cream palette, the app inverts this into a dark mode variant that maintains the same refined, editorial quality.

The aesthetic is **Modern Minimalism** with subtle depth through glassmorphism. Clean obsidian-black surfaces provide focus, while refined gold accents (#c9a54a) create warmth and premium feel — directly inherited from the website's gold palette (#9e7c38).

The brand personality is **clean, confident, and sophisticated** — a premium wallet that feels futuristic without being cold.

## Colors

The palette is anchored by **Pure Obsidian** (#0e0e10) and **Charcoal** (#1c1c1f) — neutral, warm-tinted blacks that avoid the clinical feel of pure black.

- **Gold (#C9A54A):** The primary accent, matching the website's gold palette. Used for interactive elements, primary actions, and accent highlights. Should feel warm and refined against dark backgrounds.
- **Warm White (#E8E5E0):** The primary text color — a warm off-white inherited from the website's cream palette, softening the contrast.
- **Muted Gold Borders:** rgba(158, 124, 56, 0.2) for subtle card borders and dividers, matching the website's border treatment.
- **Semantic Colors:** Error uses desaturated coral #ffb4ab to maintain the premium feel.

## Typography

Matching the website exactly:

1. **Poppins (All UI):** Clean geometric sans-serif used across the website. Weight 300-700 for hierarchy.
2. **JetBrains Mono (Labels/Data):** Monospaced font for wallet addresses, serial numbers, and technical metadata.

All headings use tight letter-spacing (-0.01em to -0.02em) for a premium editorial feel.

## Layout & Spacing

Consistent with the website's restrained, editorial spacing:

- **Rhythm:** 8px base unit for all padding and margins.
- **Container Padding:** 24px on all sides.
- **Card Gap:** 20px between card elements.
- **Max Width:** 1200px for desktop content area.

## Elevation & Depth

Three distinct layers using frosted glass and subtle shadows:

1. **Floor (Obsidian):** #0e0e10 — the deepest background.
2. **Raised Surface (Charcoal Glass):** Cards use #1c1c1f with backdrop-blur(16px), a subtle top-edge highlight (inset 0 1px 0 rgba(255,255,255,0.04)), and gold-tinted borders.
3. **Active Glass (Glassmorphism):** Modals and overlays use backdrop-blur(xl) with semi-transparent surface fills.

**Gold Glow:** Focused inputs and primary buttons feature a soft gold outer glow (rgba(201, 165, 74, 0.12) at 15px spread).

## Shapes

Clean, modern rounding matching the website's approach:

- **Cards & Containers:** 16px radius (rounded-2xl).
- **Primary Buttons:** Pill-shaped or rounded-2xl.
- **Input Fields:** 12px radius.
- **Navigation elements:** rounded-full for icon buttons.

## Components

### Buttons
- **Primary:** Gold (#c9a54a) background, dark text, pill-shaped with subtle gold shadow.
- **Secondary:** Transparent with gold-tinted border, hover reveals subtle gold fill.
- **Tertiary:** Text-only with gold color, hover opacity change.

### Cards
Frosted dark glass with subtle gold borders. Use the obsidian-card utility class for standard card treatment. Minimal texture overlay for depth.

### Dividers
Match the website's gradient divider: bg-gradient-to-r from-transparent via-outline-variant to-transparent.

### Navigation
- **Top Bar:** Frosted glass (bg-surface/80 backdrop-blur-xl) with gradient gold divider below.
- **Bottom Nav (Mobile):** Frosted glass with gold active indicator dots and subtle upward shadow.
- **Active States:** Gold primary color with soft glow dot beneath icons.