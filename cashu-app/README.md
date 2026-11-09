# BitNotes app

React, TypeScript and Tauri 2 wallet for Cashu ecash, physical notes, Lightning, on-chain Bitcoin, optional Dollar conversions and Mobile Money integrations. Version and release instructions are maintained in the [root README](../README.md) and [release guide](../RELEASING.md).

## Development

Use Node.js 24 and stable Rust, plus the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
cp env.example .env
npm run tauri dev
```

The tracked `src/constants.ts` contains public defaults. A clean clone builds without credentials. Configure optional integrations in the ignored `.env`; `constants.local.ts` is no longer imported. Breez/Spark operations need your own client API key. Mobile Money additionally needs a compatible payment backend and its configured transit key. Missing optional configuration should not be replaced with somebody else's credentials.

Frontend environment values, including SDK client keys and transit keys, are extractable from distributed builds. Keep privileged provider credentials and authorization on the backend. See [security policy](../SECURITY.md).

`npm run dev` runs a browser preview. Native wallet storage, camera, clipboard and payment commands require Tauri or test mocks.

## Verification

```sh
npm run test:payments
npm run check:release
npm run build
```

From the repository root, also run `cargo test --workspace --locked` and `cargo audit`. CI builds with public defaults and no private `.env`.

- [Dollar conversions and recovery](STABLE_BALANCE.md)
- [QR ecash invoices and persistence](ECASH_PAYMENTS.md)
- [Contribution guide](../CONTRIBUTING.md)
