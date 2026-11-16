# BitNotes app

React, TypeScript and Tauri 2 wallet for Cashu ecash, physical notes, Lightning, on-chain Bitcoin, optional Dollar conversions and Mobile Money integrations. Version and release instructions are maintained in the [root README](../README.md) and [release guide](../RELEASING.md).

## Development

Use Node.js 24 and stable Rust, plus the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
cp src/constants.example.ts src/constants.local.ts
npm run tauri dev
```

The app imports the ignored `src/constants.local.ts`. Copy `src/constants.example.ts` once during setup, then configure your deployment in the local file. Uncomment and fill its fields locally before building; keep every field blank in the tracked template. Breez/Spark operations need your own client API key. Mobile Money additionally needs a compatible payment backend and its configured transit key. Missing optional configuration should not be replaced with somebody else's credentials.

Frontend environment values, including SDK client keys and transit keys, are extractable from distributed builds. Keep privileged provider credentials and authorization on the backend. See [security policy](../SECURITY.md).

`npm run dev` runs a browser preview. Native wallet storage, camera, clipboard and payment commands require Tauri or test mocks.

## Verification

```sh
npm run test:payments
npm run check:release
npm run build
```

From the repository root, also run `cargo test --workspace --locked` and `cargo audit`. CI generates synthetic values from the blank template for build checks, without deployment credentials.

- [Dollar conversions and recovery](STABLE_BALANCE.md)
- [QR ecash invoices and persistence](ECASH_PAYMENTS.md)
- [Contribution guide](../CONTRIBUTING.md)
