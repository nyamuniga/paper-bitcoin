# Release 0.1.17 review

Prepared on 2026-11-09. This report describes release preparation, not a published release or independent security audit.

## Historical transit key: rotation reported

The original scan found the then-configured `VITE_ENCRYPTION_KEY` in a historical `cashu-app/src/constants.local.ts` blob. Its value is deliberately omitted here. The maintainer has since confirmed rotation, and the current public-tree and extended history checks both pass against the local configuration. The active-credential publication blocker is cleared on that basis; backend rejection of the retired key was not independently exercised.

Old Git copies remain historical exposure: rotation does not erase those copies or protect previously captured payloads encrypted with the retired key. No history rewrite was performed. Backend authorization must remain independent of a client-embedded transit key.

The scan covered all 1,742 historical blobs reachable from local refs for exact matches to four configured credential values. Recognizable credential-pattern scanning covered 1,579 historical text blobs; its generic-assignment candidate was reviewed as a false positive. These are scoped checks, not a guarantee against every possible secret. Enable hosting-provider secret scanning as well.

## Dependency audit

Compatible npm updates resolve the initial 10 reported advisories (including critical/high findings). Rust dependency updates and the k256 0.14 migration resolve the initial 25 vulnerability findings; the resolved `crypto-bigint` version is patched for [RUSTSEC-2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387.html). Official Cashu NUT-00/NUT-12 vectors cover hashing and DLEQ interoperability after the migration.

RustSec still emits these upstream informational warnings; none has been silently ignored in an audit configuration:

| Kind | Dependency | Advisory |
|---|---|---|
| Unsoundness | glib 0.18.5 | RUSTSEC-2024-0429 |
| Unsoundness | lru 0.16.4 | RUSTSEC-2026-0253 |
| Unmaintained | bincode 1.3.3 | RUSTSEC-2025-0141 |
| Unmaintained | instant 0.1.13 | RUSTSEC-2024-0384 |
| Unmaintained | nostr-relay-pool 0.44.3 | RUSTSEC-2026-0243 |
| Unmaintained | proc-macro-error 1.0.4 | RUSTSEC-2024-0370 |
| Unmaintained | rustybuzz 0.20.1 | RUSTSEC-2026-0206 |
| Unmaintained | ttf-parser 0.25.1 | RUSTSEC-2026-0192 |
| Unmaintained | zbus_names 4.3.5 | RUSTSEC-2026-0371 |
| Unmaintained | zvariant 5.15.1 | RUSTSEC-2026-0370 |
| Unmaintained | zvariant_derive 5.15.1 | RUSTSEC-2026-0372 |

`glib` is pulled by the Linux GTK/WebKit platform stack; the affected iterator APIs are not directly used by this application. `lru` is pulled by Nostr database/relay components; the advisory concerns panicking key destructors with unwind/catch-unwind, while this workspace's release profile uses `panic = "abort"`. These observations narrow exposure and do not establish that all transitive call paths are safe. Review warnings for each release target and follow upstream fixes; do not call this an advisory-free dependency tree.

## Configuration and source hygiene

- Public, environment-driven `cashu-app/src/constants.ts` replaces imports of ignored local source. The blank `env.example` is now publishable.
- Versions are synchronized across app/npm, Tauri, workspace crates and website. The updater fallback reads the package version.
- Public-source checks reject credential/build/wallet/note paths and recognizable private keys, compare known local credentials without printing them, and check version consistency.
- Authentication/payment payload logs, phone-number logs and proof-secret logs were removed. Proxy AES key/IV byte packing was corrected and checked against independent AES-256-CBC/HMAC decoding. Development update simulation is excluded from production behavior.
- npm and Cargo lockfiles, Node.js 24, `npm ci`, payment tests and audit checks are part of release/CI setup.

## Validation

- 62 Rust workspace tests passed with the locked dependency set, including official Cashu interoperability vectors. Local verification disabled debug symbols/incremental caches after exhausting disk space; assertions and test coverage were retained.
- 100 frontend/payment tests passed.
- A credential-free public-source snapshot passed `npm ci`, payment tests and a production build; no ignored `.env` or local constants were copied.
- Public file hygiene/version checks and the extended history check passed after the maintainer reported rotating the exposed transit key. The same history check had previously failed on the old configured value.
- npm audit and RustSec report zero known vulnerabilities. The 11 upstream informational warnings above remain documented.
- Website checks passed at mobile and desktop widths, including version labels and both download targets.
- TypeScript/Vite build and `git diff --check` passed. The existing large Spark/WASM bundle advisory remains visible. Native device signing, mainnet money movement and app-store/notarization validation are separate checks in [RELEASING.md](RELEASING.md). New website URLs require uploaded `v0.1.17` assets before deployment.
