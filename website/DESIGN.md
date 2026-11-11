---
name: Sovereign Ochre & Forest
colors:
  background: '#f6f4eb'
  surface: '#eceee2'
  surface-ecash: '#eeeee3'
  surface-dark: '#071c15'
  surface-note: '#193e2e'
  on-surface: '#153e32'
  on-surface-variant: '#4d6356'
  on-dark: '#f6f4eb'
  on-dark-secondary: '#c2d2bf'
  primary: '#153e32'
  accent: '#eab44d'
  hero-orange: '#bd640b'
  icon-ochre: '#965114'
  outline: '#aebbad'
  divider: '#d6dccf'
typography:
  display-hero:
    fontFamily: Poppins
    fontSize: 72px
    fontWeight: '700'
    lineHeight: 80px
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Poppins
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Poppins
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Poppins
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  headline-sm:
    fontFamily: Poppins
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Poppins
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

# BitNotes website: paper, forest, and an orange Literally.

Mode: Persuade. Keep the current split hero: grounded introductory copy on the left; actual wallet screenshot, note specimen, and engraved banknote background on the right. Real application screens must remain authentic. Do not recreate a pretend interactive wallet or invent balances in HTML.

Typography: self-hosted Poppins for all website UI, headings, paragraphs, buttons, and numeric labels (400,500,600,700). The single exception is the hero word “Literally.”: Georgia italic in orange #bd640b. Text inside the authentic screenshots and physical-note artwork stays unchanged. Body copy is16px; secondary text14px, metadata12px. Headings stop at72px and tracking at−0.04em. Font licenses ship in fonts/OFL.txt.

Content hierarchy: explain ecash, Bitcoin, Mobile Money, and physical notes in the hero. Four asymmetric feature cards cover physical notes, ecash send/receive/request/claim-later, Bitcoin Lightning/on-chain payments, and Rwanda Mobile Money top-up/cashout. A quieter conversion strip explains Bitcoin/Dollar balances and the dollar-linked asset caveat. Real note-creation and receive screenshots accompany a three-step note workflow. Trust and installation disclosures follow, then supporting source/help links.

Use Lucide SVG icons consistently: Printer for note creation, Coins for ecash, Bitcoin for Bitcoin, Zap for Lightning, Smartphone for Mobile Money, Landmark for mints, and ArrowLeftRight for transfers/conversion. Icons are decorative beside explicit labels; buttons retain accessible names. Never use Unicode glyphs or emoji as icon substitutes. Icon license ships in ICONS-LICENSE.txt.

Keep the native workflow facts precise. A scanned token can be previewed, claimed, or saved for later; saved tokens are not a guaranteed credited balance. Review amounts/fees for Bitcoin and MoMo transfers. Notes need a funded wallet, printing, and a tamper-evident seal. Offline checks do not establish spend status; mint redemption requires trust in the issuing operator. The Dollar balance is not a bank deposit. Every note specimen is marked as having no redeemable value, and contains no funded proofs or wallet keys.

Paper surfaces use forest text and dark orange/ochre icons; dark surfaces use cream text and gold actions. Keep functional text at AA contrast, visible focus, a skip link, and reduced-motion support. The mobile navigation is a nonmodal disclosure, not a modal drawer: closed links are inert, opening focuses a link, Escape returns to the menu button, and normal page controls remain reachable. Static download URLs and readable page content work without JavaScript.

Maintain consistent mobile gutters, a solid sticky header, contained decorative orbits, and flexible cards. Display supplied screenshots at their natural aspect ratio with full-size links. The hero note preview and banknote background stay in place.

Run `node --test website/tests/site.test.mjs` for browser checks of typography, SVG icon mappings, assets, responsive widths, menu behavior, anchor offsets, reduced motion, truthful download feedback, and script-independent downloads. Inspect actual rendered output on mobile and desktop before finishing changes. Release-specific compatibility/signature/hash facts are documented in RELEASE.md and must be updated when download versions change.
