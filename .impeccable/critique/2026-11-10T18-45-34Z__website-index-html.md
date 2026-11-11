---
target: the website after all fixes and mobile responsiveness
total_score: 30
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 0
target_identity: "file:/Users/mac/Code/physical-ecash/website/index.html"
target_fingerprint: "sha256:87157fdba435a808aabd3f855120ce1efb9ffda862a93591c7d4c5d134b7cbd2"
target_path: /Users/mac/Code/physical-ecash/website/index.html
timestamp: 2026-11-10T18-45-34Z
slug: website-index-html
---
Method: dual-agent (A: /root/website_recheck_design · B: /root/website_recheck_evidence)

# Independent Assessment A — latest BitNotes reassessment

Target: `/Users/mac/Code/physical-ecash/website/index.html`, `http://127.0.0.1:8765/`. Mode: Persuade. Assessed the latest source and own isolated browser at 1440×1000, 390×844 and 600×1000. No detector, Assessment B output or prior snapshot read. This reassessment follows my own preceding assessment; score changes below identify observed changes rather than treating this as a fresh blind run.

## Design specificity and overall impression

Authored for BitNotes. Banknote engraving, warm paper, wildlife and forest controls are reinforced by both an actual app screenshot and the actual demonstration-note template. Showing the specimen across the phone now gives the physical/digital proposition a convincing visual form inside the opening desktop viewport and the 600px viewport. At 390px the note starts inside the first viewport, with its bottom just beyond the fold: substantial improvement over showing only a fading phone. The composition feels coherent and product-specific.

## Nielsen scores

| # | Heuristic | Score | Evidence / remaining limitation |
|---|---|---:|---|
| 1 | Visibility of system status | 4 | Active navigation, release information and expanded menu state work. A tested installer click now reveals a truthful platform-specific role=status message, browser-progress explanation and immediate release-files/install-help fallbacks. Help anchors clear the sticky header. |
| 2 | Match system / real world | 4 | The hero describes digital cash and covered private code in ordinary language, defines a mint as the issuing service, and explains redemption dependence. The note introduction defines ecash as digital tokens before public/private code roles. Deeper cryptographic vocabulary is confined to relevant explanations. |
| 3 | User control and freedom | 4 | Mobile drawer focuses Close, makes background inert, exits on Escape and returns focus. Native disclosures and ordinary links preserve user control. |
| 4 | Consistency and standards | 4 | Cohesive palette, typography and controls across widths. Header reduces to brand/menu at 390 and 600; section gutters and reading layout remain consistent. |
| 5 | Error prevention | 3 | Good proactive safeguards: explicit ARM64 Android 7+ and Apple Silicon macOS 11+, ad-hoc signature caveat, real release-specific hashes, security warning guidance, mint risks and small testing amounts. Unfamiliar users still have to understand device architecture and manual verification; “errors nearly impossible” would overstate this surface. |
| 6 | Recognition rather than recall | 4 | Default 28MINT, Mints destination and linked selection criteria replace an unsupported prerequisite. Platform choices, adjacent requirements, mobile code-detail crops, trust explanations and task-focused disclosures keep important information retrievable. |
| 7 | Flexibility and efficiency | n/a | Persuade surface; no repeated operational workflow to accelerate. |
| 8 | Aesthetic and minimalist design | 4 | Strong intentional visual hierarchy; specimen/phone overlap now directly proves the proposition. Content is grouped and secondary technical detail disclosed. Mobile gutters and simplified header preserve the composition. |
| 9 | Error recognition/recovery | 3 | Failed-install disclosure has concrete retry, release-selection, checksum and issue-report directions. This remains documentation-based recovery, with device errors occurring outside the page, rather than a fully diagnosed recovery flow. |
| 10 | Help and documentation | n/a | Persuade-mode exemption; task-focused help is considered under prevention, recognition and recovery. |
| **Total** | **Excellent** | **30/32 (93.75%)** | Eight scored heuristics; n/a: 7 and 10. |

Score changed from 26/32 to 28/32 through recognition4 (concrete mint/default guidance) and aesthetics4 (early specimen proof plus mobile detail/gutters). The final two changes raise this to **30/32**: visibility3→4 because an installer click now gives truthful visible status with immediate recovery routes, and real-world match3→4 because the hero/note introduction now explain the core mint/ecash concepts at their first relevant use. The final status was inspected in a390px browser after one Android click with navigation prevented solely by the test listener. Its visible wording was “Android download requested. Your browser shows its progress. If it doesn’t start,” followed by release-files and install-help links; role=status was present. Source inspection confirms the app listener does not prevent native navigation or claim completed download. The message wraps cleanly with no horizontal overflow. This evaluates feedback behavior, not an actual downloaded installer or a screen reader’s spoken announcement.

Prevention/recovery remain strong3 under the strict criteria above. Installation specifics remove the earlier compatibility-information priority issue. This is not a claim that downloads, signatures or hashes were independently security-audited by Assessment A.

## What's working

- **The product promise is now visually proven early.** Desktop opening shows the specimen at meaningful size across the wallet; the 600px composition includes its full note and explanatory link. At 390px a small additional scroll completes the view. Clear demonstration markings remain present.
- **Trust guidance now leads to action.** Step 01 names the app’s actual starting selection and Mints destination. Linked criteria explain operator identity, terms/fees, availability/support and a small redemption test, while explicitly avoiding guarantees.
- **Installation guidance is concrete and candid.** Current release, Android architecture/minimum version, Mac hardware/minimum version, signature limitations and separate SHA-256 values answer the earlier questions. Useful detail is disclosed instead of becoming a wall of text in the hero.

## Remaining priorities

**No outstanding P0–P2 issue observed in this reassessment.** The final anchor correction was checked using actual 390px link clicks: installation heading now starts at y146.2px and mint disclosure at y109.6px, both below the 69px sticky header. Mint help opens on arrival and focus moves to the target. The previous context-obscuring anchor issue is resolved.

The remaining3 scores (prevention and recovery) represent good implementations within a complex domain, not hidden release blockers. Prevention still depends on a user selecting the stated architecture and manually comparing hashes. Recovery is good task-focused retry/report guidance for device errors that occur outside this page, rather than diagnosis of each OS error. More warnings or automatic device detection are not justified merely to obtain 4s.

## Cognitive load

**Low: zero clear checklist failures.** Primary choice stays at two installers; four capabilities, three steps, four trust disclosures and four installation disclosures are digestible groups. Sections and disclosure labels keep related information together. Default-mint guidance removes the earlier unsupported learning prerequisite. The phone/note pair now supports understanding instead of postponing paper evidence. There is no primary decision with more than four equivalent alternatives. The footer’s five Software links are secondary navigation, not an overloaded primary choice.

The intrinsic subject remains complex: redeemability, public verification, private redemption, mint dependence and manual installation. The page appropriately gives essential caveats up front and discloses deeper protocol/signature/checksum detail. Do not keep expanding the hero to teach the whole system.

## Personas and emotional journey

- **Jordan, first-timer:** primary action is obvious; physical note and protected code now have visible examples. Can connect “fund wallet” to the actual default and Mints screen. Final help-anchor check confirms the contextual title/summary remains visible after navigation.
- **Riley, deliberate evaluator:** finds explicit mint/offline limitations, demonstration markings, current release requirements, signature caveats and integrity hashes. No major trust-information gap observed within this landing-page scope; asset facts are accepted as provided by the parent’s release verification rather than independently re-audited here.
- **Casey, mobile:** 390 and 600 layouts have no horizontal overflow; platform buttons are large, menu is clear, version/header CTA are correctly hidden at these widths, body sections have visible consistent gutters. Detail crops make the two code areas recognizable at phone scale. Full note is available through its full-size link. Final help-anchor check confirms that the fixed header no longer obscures navigation context.

Emotional sequence is now stronger: distinctive promise → visible wallet/note proof → practical explanation → candid trust guidance → install with explicit platform and signing expectations. The earlier “which mint/how do I start?” valley has materially improved. The final help-anchor offset correction removes the last observed rough edge in that journey.

## Minor observations

- At 390×844 the specimen bottom/link is just below the opening fold. This is acceptable responsive pacing; both download buttons and essential caveats receive higher placement.
- The mobile detail crops are decorative supports with empty alt text; their neighboring headings/prose provide the explanation. The full specimen retains a meaningful alt description.
- “About” and “Features” are conventional but less descriptive than the actual product explanations they contain. This is optional copy polish, not a current navigation failure.
- Expanded checksum/install content makes the page long, but it is user-invoked and directly relevant. Keep these details collapsed initially.

## Browser evidence and execution

Own isolated headless Chrome profile/tab. Desktop document width=1440 at viewport1440; mobile width=390 at viewport390; intermediate width=600 at viewport600. No horizontal overflow at inspected widths. Visual inspection confirms 20px mobile body gutters and solid header background, with version and header CTA hidden at600. Menu entry, inert background and Escape return focus were retested successfully.

Latest screenshots: `/tmp/website-recheck-a-latest-desktop.png`, `/tmp/website-recheck-a-latest-desktop-full.png`, `/tmp/website-recheck-a-latest-mobile.png`, `/tmp/website-recheck-a-latest-mobile-full.png`, `/tmp/website-recheck-a-latest-600.png`, `/tmp/website-recheck-a-latest-600-full.png`, `/tmp/website-recheck-a-latest-menu.png`, `/tmp/website-recheck-a-latest-installation.png`. The installation capture predates the final offset fix and is superseded by the actual-click measurements: installation heading y146.2px, mint disclosure y109.6px, header bottom69px.

Chrome closed through the launch shell’s cleanup trap. Shared server8765 left running. Final limited H1/H2 check used one390px click and screenshot `/tmp/website-recheck-a-final-status.png`; it did not repeat the full multi-width review. No source edits and no detector run. No blocking bug observed. Final actual-click anchor verification includes the parent’s110px scroll-margin correction.


## Combined technical evidence and validation

Assessment B independently confirmed responsive widths, inert closed drawer, focus entry/trap/return, Escape, URL hashes, reduced motion, static no-JavaScript downloads, and readable rendered functional text. Final refinements additionally passed the root browser suite: 11 tests, 11 passed, zero failures. Coverage includes 320,390,600,768,1024,1440 CSS-pixel widths, mobile/tablet gutters and compact header, lazy-loaded specimen assets, help-anchor offsets, direct mint guidance, truthful download feedback, and script failure.

Latest deterministic scan of final index.html: 35 signals (8 warnings,27 advisories), versus64 initially. Rules: dark-glow3,radial-spotlight-glow1,design-system-color8,design-system-font2,design-system-radius7,design-system-font-size12,overused-font1,cream-palette1. No low-contrast samples remain in the latest CLI output. This is not a standalone pixel-perfect WCAG audit. Independent browser contrast checks found no confirmed functional failures; gradient-compositing false positives were reviewed against the real rendered CTA. Remaining style/documentation advisories are not35 separate user-facing defects; some describe inactive inline declarations overridden by refinements.css or deliberate paper/engraving identity.

The detector overlay ran and was captured in headless Chrome during Assessment B; no overlay is left visible in the user's browser. Final source was checked by a fresh CLI run; the earlier overlay was not rerun for the last text/status and anchor refinements.

Published0.1.18 compatibility/signature/hash facts were verified by downloading and inspecting, not executing or rebuilding, the installers. Temporary files were removed and the DMG unmounted. The factual record is in website/RELEASE.md. No APK built.

Release/history hygiene checks and git diff --check passed. Website source remains local for review; no push was made for these website changes. All critique-only browsers and local servers stopped; temporary snapshot body deleted after persistence. Previous critique snapshot remains archived.

Questions skipped: no outstanding Priority Issues (P0–P2) observed in the final review. Optional future refinements do not block these completed changes.
