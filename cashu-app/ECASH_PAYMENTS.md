# QR ecash invoices

Use **Receive → Request** to create a single-use Cashu payment request at the selected mint. Requests and their receiving keys are saved in the encrypted wallet before a payable QR is displayed. Open **History → Requested eCash** to resume a request, check its relay inbox, or retry claiming a saved payment after closing or restarting the app. A compatible payer sends an encrypted NIP-17 payment payload to the temporary inbox advertised by the QR.

Use the main **Scan** page to review and pay a request. The Send tab receives the scanned request for confirmation. Confirmation shows the recipient amount, fee allowance, mint swap fee and total debit. A failed delivery retries the same saved token from History. Relay acknowledgement is not proof of redemption.

The receiver advertises confirmed relay subscriptions only. Request ID, mint, sat unit, proof bounds, input fees, cryptographic envelopes and invoice replay checks are validated before showing success. Closing or backgrounding stops the live connection, while the original receiving key and request remain saved. Reopening reconnects to the same relay inbox and retrieves available stored payments. There is no local ten-minute expiry. Payment tokens are saved before redemption; the paid status comes from a successful invoice-bound receive transaction. History lists public request metadata only. Relay retention determines whether a payment sent while the app was closed remains available. Check an unconfirmed sender token in History before paying again.

Run npm run test:payments and npm run build from this directory. The parser tests require Node with TypeScript stripping support.

Invoices use NUT-18 `creqA` with URL-safe Base64, including after confirmed relay addresses update the QR. Ordinary Base64 output from cashu-ts is normalized to avoid rejection by Cashu.me native/CDK decoders.

Requests use the same transaction cards and detail sheet as other activity, and are included in Recent activity. A confirmed receive replaces its request row to avoid duplicate inflows. Authenticated legacy native Cashu.me messages without inner recipient tags are supported; wrapper recipient checks, both signatures, sender binding, explicit inner recipient tags when present, and invoice constraints remain enforced.

Delivery connects to several NIP-17-capable relays independently and enables the QR after the first accepted subscription, without waiting for blocked routes. The QR follows the currently active subscriptions. Defaults are auth.nostr1.com, nos.lol, and relay.primal.net. Saved requests retain their original routes; fallback additions are encrypted on disk before a revised QR is shown, with at most four routes. Returning online reconnects the saved request. If all routes fail, Connection details shows per-relay reasons while the request remains recoverable.
