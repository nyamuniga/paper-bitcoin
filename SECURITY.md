# Security policy

BitNotes handles bearer ecash, wallet recovery material, payment requests and third-party payment integrations. Treat notes, tokens, wallet databases and backups as money. The cryptographic implementation has not received an independent security audit.

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/nyamuniga/paper-bitcoin/security/advisories/new) when enabled. If unavailable, contact the maintainer through their GitHub profile to arrange a private channel. Do not place recovery phrases, tokens, wallet files, authentication headers, signing credentials or personal payment details in public issues, screenshots or logs.

## Source and builds

- `.env`, local constants, signing material, bearer-note outputs and wallet backups must stay outside public version control. `env.example` contains blank credential fields and public defaults only.
- Frontend environment values are visible in distributed JavaScript/native bundles. A proxy transit key does not provide server-side authorization. Keep privileged provider secrets on the backend and apply the provider's client-key restrictions where available.
- Wallet material is encrypted locally. Development debug logs must not print keys, proofs, authorization headers, full payment responses or phone numbers. CLI commands that explicitly display/export wallet material should only be used in a private terminal.
- Keep native/web dependencies and their lockfiles current. Run the npm and RustSec audits in the [release guide](RELEASING.md). An unresolved advisory is a release decision requiring documented assessment, not an automatic ignore entry.

## Financial boundaries

Cashu balances depend on their issuing mint. Offline note verification does not prove that a note remains unspent. Relay acknowledgement does not prove that the recipient redeemed a payment. Dollar holdings use a dollar-linked digital asset and depend on its issuer/peg; they are not a bank deposit.

Conversions require review and confirmation. Pending operations and invoice receiving keys are preserved in the encrypted wallet. Recovery must reconcile saved receipts/tokens, not repeat an ambiguous payment or discard a journal. Never delete wallet data to resolve a stuck screen.

## Review scope

Release hygiene checks cover current public files, recognizable credential patterns, known locally configured credentials and synchronized release versions. They do not prove absence of every possible secret, replace dependency audits, validate backend deployment authorization or constitute a cryptographic penetration test. Use secret scanning on the hosting repository as an additional control.
