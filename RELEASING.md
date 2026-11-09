# Releasing BitNotes

The prepared release is **0.1.17**. Read [the current verification report](RELEASE_CHECKS.md), including the rotation record, upstream warnings and remaining native-device checks, before pushing. Release preparation does not publish a GitHub release, upload binaries, deploy the website, or rotate credentials.

## Public source boundary

Commit application source, tests, documentation, `cashu-app/env.example`, `cashu-app/src/constants.ts`, both dependency lockfiles, and the maintained Android project sources. Do not commit `.env`, `constants.local.ts`, wallet databases/backups, generated physical notes, signing credentials, keystores, build directories, diagnostic logs, or release binaries. The ignore rules protect these paths; `npm run check:release` also checks tracked files forced past the ignore rules and compares known local credentials without printing them.

Frontend environment values are extractable from builds. Configure provider client keys for the deployment and keep privileged backend credentials on the backend. Signing credentials belong in a local secret manager or CI secrets, not shell scripts in this repository. The public test vector in `cashu-app/tests/fixtures/cashume-nostr-payment.json` comes from Cashu.me's public interoperability fixture; it is not a real wallet backup.

The release checker is a hygiene check, not a full security audit. Use `--history` for reachable Git history as well; exact local-credential matching requires the private local configuration to be available and must not be replaced with CI secrets in untrusted pull requests. Also inspect `git diff --cached` and the exact file list before pushing. If a credential was ever published, remove its current occurrence and rotate it; deleting it from the latest commit does not remove it from history. Coordinate any history rewrite with maintainers.

## Versions

Update `cashu-app/package.json`, its npm lockfile root versions, `cashu-app/src-tauri/tauri.conf.json`, and every workspace crate manifest together. The app's browser update fallback imports its version from `package.json`. Update website download URLs, desktop/mobile version text and the `config.js` cache query together. Add the corresponding changelog entry.

When updating Rust dependencies, align the resolved `tauri` and `tauri-plugin-*` versions with their JavaScript counterparts: each pair must share its major/minor release. Keep the Tauri CLI on the corresponding release line. `check:release` checks these pairs in both lockfiles; a frontend build alone does not catch native version mismatches. Rebuild the native target after dependency updates.

## Required checks

Use Node.js 24 (`nvm use`) and stable Rust with Tauri's platform prerequisites installed.

```sh
npm --prefix cashu-app ci
npm --prefix cashu-app run check:release
npm --prefix cashu-app run check:release -- --history
npm --prefix cashu-app run test:payments
npm --prefix cashu-app run build
npm --prefix cashu-app audit --audit-level=high
cargo test --workspace --locked
cargo audit
```

Build once from a clean checkout without `.env` or `constants.local.ts`. Credentials are optional for compilation; live Spark/Mobile Money operations require the appropriate deployment configuration. Never dismiss dependency advisories just to pass a release gate. Review unresolved target-specific and unmaintained dependency warnings explicitly.

The normal frontend bundle includes a large Spark WASM payload and currently produces Vite's large-chunk advisory. That advisory is not a failed type check; do not raise the threshold to hide it.

## Device checks before publishing

Use a small, user-controlled amount on supported native builds to verify receive/send, QR ecash invoice creation, paying from another wallet, saved invoice recovery after restart, both Dollar conversion directions, interrupted conversion recovery, and signed app upgrades. Automated payment tests use mocks and do not establish real-money end-to-end success. NFC has been removed; do not advertise tap-to-pay support.

Keep an encrypted wallet backup before upgrading. Preserve conversion journals and saved invoice keys; never clear a pending operation merely to unblock a new transfer. Native changes require rebuilding and reinstalling the app.

For Mobile Money key rotations, follow [the recovery and backend rollout notes](MOMO_RECOVERY.md). The backend rejection response must be deployed, and apps must be rebuilt with the current configuration and recovery code. Do not clear app storage or reuse a retired key to bypass an interrupted transaction.

## Artifacts and website

Build on the target platform with its normal Tauri prerequisites. From `cashu-app`:

```sh
# macOS (sign/notarize according to the deployment's local credential setup)
CI=true npx tauri build

# Android arm64; supply TAURI_ANDROID_KEYSTORE_* variables through a secret manager
npx tauri android build --apk --target aarch64
```

Verify signatures and checksums, then publish the intended release artifacts under tag `v0.1.17`:

- `bitnotes-android-wallet-v0.1.17.apk`
- `bitnotes_0.1.17_aarch64.dmg`

These filenames are the website contract. Upload and verify both assets before deploying `website/`; otherwise its new download links will return 404. The site is a static directory and can be previewed with `python3 -m http.server 8080 --directory website`. Check both desktop and mobile navigation/download buttons.

## Rollback

For a website issue, restore its previous configuration/assets and verify downloads. For an app issue, stop promoting new binaries and keep affected wallets/journals intact while reconciling pending payments. Do not instruct users to downgrade into an older wallet schema without testing compatibility on a copy. A rollback must never resend a conversion or replace the user's wallet data.
