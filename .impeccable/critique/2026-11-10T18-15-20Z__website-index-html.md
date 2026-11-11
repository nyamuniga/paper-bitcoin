---
target: the website
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 4
target_identity: "file:/Users/mac/Code/physical-ecash/website/index.html"
target_fingerprint: "sha256:38d1d44e6270583c955de415875e622c973e7f493c78d625a440039b296f53a8"
target_path: /Users/mac/Code/physical-ecash/website/index.html
timestamp: 2026-11-10T18-15-20Z
slug: website-index-html
---
Method: dual-agent (A: /root/website_design_review · B: /root/website_browser_evidence)

Reviewed website/index.html in Chrome at desktop and mobile sizes, including navigation and download controls. This assesses the local website source, not a deployed production site.

**The visual identity is distinctive; the explanation is harder to trust and understand than the presentation suggests.** The engraved banknote background, forest green, warm paper, and coin emblem belong to BitNotes. Below that strong hero, familiar feature cards replace the concrete demonstration this unusual product needs. Keep the visual direction and improve the story and interactions.

**Design health: 18/32 — acceptable, with significant improvements needed.** Scores are 0–4; two heuristics are not applicable to this landing page.

| Heuristic | Score | Main observation |
|---|---:|---|
| System status | 3 | Active sections and release/platform labels are visible. |
| Real-world language | 2 | “Blind-sign,” “DHKE,” and “sweep” require prior knowledge. |
| Control and freedom | 2 | Mobile menu lacks Escape and focus handling. |
| Consistency | 3 | Coherent visual language; platform labels need precision. |
| Error prevention | 1 | Absolute custody reassurance conflicts with its qualification. |
| Recognition | 2 | Physical-note use must be imagined from text. |
| Efficiency | n/a | No recurring operational workflow on this landing page. |
| Aesthetic/minimalist design | 3 | Strong hero; repetitive lower sections. |
| Error recovery | 2 | Releases link exists; installation help is missing. |
| Help/documentation | n/a | Installation guidance is evaluated under prevention/recovery. |

**What works:** the banknote imagery makes the brand memorable; download buttons are prominent and comfortably tappable; the overall proposition → features → process → installation order is sensible. Images/fonts loaded, and there was no horizontal overflow at 320, 390, 768, 1024, or 1440px.

**Five priorities**

1. **[P1] Make the trust wording consistent.** The hero says “100% Non-Custodial,” the small disclosure says ecash depends on its issuing mint, and another card says “Never rely on a single custodian.” These communicate different trust models. Replace the absolute reassurance with precise, reviewed wording and explain mint dependence beside it. This is a communication finding, not an independent protocol/security determination. Evidence: website/index.html:1673, :1761, :1786. Command: `$impeccable clarify`.

2. **[P1] Demonstrate the product before explaining its protocols.** “The wallet that bridges your financial sovereignty” gives no concrete first task. The supporting paragraph immediately lists several payment systems, while the physical note itself is never shown. Lead with one practical outcome, show an actual note specimen alongside the wallet, and illustrate issue → hand over → verify/redeem. Explain offline verification limits in reviewed plain language; move DHKE/NUT-15 details into secondary content. Evidence: website/index.html:1625, :1630, :1773, :1836. Commands: `$impeccable clarify`, `$impeccable onboard`.

3. **[P1] Put installation confidence beside downloads.** “Download APK” assumes Android familiarity; “macOS Desktop” conceals an Apple Silicon-specific DMG. Add clear platform/architecture labels, supported OS information, concise installation help, and verification links. Runtime URLs correctly resolve to configured 0.1.18 targets; remote binary availability/signing was not tested. The preceding release work did not build/upload those artifacts. Evidence: website/config.js:4 and website/index.html:1880. Command: `$impeccable harden`.

4. **[P1] Repair the mobile menu’s keyboard behavior.** Seven invisible controls remain tabbable while the drawer is closed. Opening leaves focus behind the overlay; Escape does not close it. Make the closed drawer inert, move/contain/restore focus when open, update expanded state, and enlarge the 36px close target. Mobile section links should update the URL hash consistently with desktop links. Evidence: website/index.html:1569, :2075. Command: `$impeccable harden`.

5. **[P2] Strengthen small gold text contrast.** Browser checks confirmed section labels and footer links around 2.2–2.4:1; pale step numerals are about 1.4:1. Darken functional gold text on paper and keep faint gold for decoration. Do not apply a blanket color change to the whole hero. Evidence: website/index.html runtime contrast samples; detector locations for these samples are line 0. Commands: `$impeccable colorize`, `$impeccable polish`.

**Cognitive load:** moderate, with three checklist failures: dense feature groups, too many peer navigation choices, and technical detail arriving before a concrete example. Five feature cards and five navigation destinations each exceed the checklist’s four-item grouping guideline. The emotional journey starts with confidence, dips into jargon and uncertainty, then ends with a strong download panel that lacks installation reassurance.

**Persona red flags:** first-time visitors cannot inspect the physical note they are being asked to understand; cautious evaluators encounter contradictory trust language and unclear Mac compatibility; keyboard users pass through seven hidden menu stops before reaching the visible download action.

**Minor observations:** the On-Chain pillar uses a Lightning icon and Lightning-led description; APK capitalization varies; reduced-motion handling is absent; decorative texture need not have announced alt text. website/DESIGN.md describes different fonts/default surfaces from the shipped website and should be aligned deliberately, preserving the successful banknote direction.

**Detector interpretation:** 64 signals (31 warnings, 33 advisories), including 15 low-contrast samples, five dark-glow, four icon-tile-stack, and design-system mismatches. The browser overlay reported 19 signals in its different scope; these counts are not additive or distinct bug totals. The contrast findings add concrete evidence to the visual review. Cream-palette/font warnings are not reasons to discard this product-specific identity; mismatched documentation accounts for many token advisories. Overlay injection succeeded in a headless browser and was captured, not left visible in the user’s browser.
