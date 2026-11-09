# Contributing to BitNotes

BitNotes combines a Rust Cashu wallet/CLI with a React + Tauri native app and a static download website. See the [README](README.md), [security policy](SECURITY.md), and [release guide](RELEASING.md).

## Setup

Install stable Rust and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/), then use Node.js 24:

```sh
nvm use
npm --prefix cashu-app ci
cp cashu-app/env.example cashu-app/.env
cd cashu-app
npm run tauri dev
```

The tracked `src/constants.ts` builds with public defaults. Optional integrations can be configured in `.env`; no private constants file or real credentials are required to compile. `npm run dev` previews browser UI, but wallet/storage/payment commands require Tauri or mocks.

## Checks

From the repository root:

```sh
npm --prefix cashu-app run test:payments
npm --prefix cashu-app run check:release
npm --prefix cashu-app run build
cargo test --workspace --locked
```

Use the committed npm and Cargo lockfiles. Add regression coverage for payment, proof, request validation and recovery changes. Do not skip tests, remove assertions or ignore advisories to get a green release. New tests should use generated or explicitly documented public fixtures, never funded tokens or real wallet exports.

Keep changes focused and preserve existing wallet schemas and journals. Describe what changed, how it was verified, and any platform limitations in pull requests. Cryptographic or money-movement changes require particular care and interoperability tests.

## Public repository hygiene

Do not commit `.env`, keystores, credentials, private keys, wallet files, physical-note output, release binaries or logs. Do not paste these into issues either. The release check validates both tracked and new publishable files, including private paths forced past `.gitignore`. Review the staged diff yourself before pushing.

Versions must agree across npm, Tauri, Rust crates and website links; follow [RELEASING.md](RELEASING.md). Website changes are plain HTML/CSS/JS under `website/`, with download URLs in `website/config.js`.
