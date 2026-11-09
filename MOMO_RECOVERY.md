# Mobile Money request recovery

Rotating the transit key revealed two independent problems: the payment backend decrypted Octoba requests outside its forwarding `try/catch`, and the app persisted `INITIATING_PAYMENT` without a restart handler. Express 4 does not automatically catch rejected async handlers. A rejected key could leave the HTTP connection unanswered, and restarting the app restored a phase with no work running to finish it.

## App behavior

- Rate/proxy requests have a 30-second whole-operation deadline, including response-body reads. The native mint/funding calls used by this flow are also bounded; timing out a native payment does not establish that it failed.
- The backend's HTTP 401 with code `INVALID_ENCRYPTED_REQUEST` identifies a local decryption rejection before any provider call. The app presents an update/support message. Other HTTP errors, missing records, invalid status bodies and network failures remain uncertain outcomes.
- A definitely rejected top-up can be closed and started again. Interrupted preparation before payment is safely dismissible. Other saved initiation/funding phases open a recovery screen after upgrade/restart.
- Opening Top Up/Cash Out saves an older provider wait/recovery record separately and opens the requested form. Pending records remain under **Saved transfers**, with **View transfer**, **Check status** and **New top-up** actions. Creating a new transfer assigns a new ID and preserves older records.
- Actual submission/funding phases remain attached until their bounded request finishes; they cannot be replaced mid-write. Status/completion updates for saved transfers target their own IDs, so they cannot overwrite a different foreground transfer.
- Saved pending transfers continue background reconciliation, one check at a time with a per-record delay increasing from 30 seconds to five minutes. Confirmed top-ups can finish crediting their own mint quote. Background cashout checks never re-fund or re-submit a payout. Manual status checks remain available immediately.
- Recovery looks up the original transaction ID. It does not re-pay the wallet funding invoice or POST a new payout. An explicitly rejected payout can be retried by the user using its existing funding and transaction ID. An uncertain or provider-failed funded cashout requires status reconciliation/support.
- Verification timeouts retain pending records. Late responses from obsolete polling effects cannot advance another transaction. Already claimed top-ups can complete recovery without asking the proxy to pay their invoice again.

## Coordinated rollout

1. Deploy the companion `payment_backend` change: bounded decryption rejection responses for Octoba top-up/payout routes and the Lightning/mint proxy handlers. It returns `401 / INVALID_ENCRYPTED_REQUEST` for rejected envelopes, and `500 / PAYMENT_OUTCOME_UNKNOWN` for unexpected failures. The current key remains the only accepted key.
2. Rebuild and distribute BitNotes with the current deployment configuration and this recovery code. The locally rebuilt arm64 v0.1.17 APK includes this patch; earlier v0.1.17 builds do not. Preserve wallet/app storage during the update.
3. Test a rejected old-key request with non-production fixture keys, then verify upgrade/restart behavior on a copy of saved transaction data. Use a small controlled amount for device/provider verification; automated tests do not establish live settlement.
4. For an existing interrupted cashout, reconcile its original ID, funding invoice and provider record before approving any further money movement. Never clear app storage, discard its funding record, or automatically resend to unblock the UI.

Deploying the backend response can release an old app that is still waiting on a request. It cannot change the recovery code in an already installed binary, and already disconnected HTTP requests cannot receive a later response. Users with a saved stuck initiation state need the updated app. Uninstalling is not a recovery procedure.

The inspected backend saves provider references after the provider accepts a request; a failure in that gap can leave no database record despite provider acceptance. Its in-memory lock also does not guarantee idempotency across requests/processes. Consequently a status HTTP 404 is **not** used as proof that a request is safe to resend. Durable provider idempotency/reconciliation is separate backend work.

## Verification

`npm --prefix cashu-app run test:payments` covers key rejection, hung requests/bodies, real store rehydration, ambiguous outcomes, independent new top-ups and saved-transfer completion without changing the foreground transfer. Browser checks use synthetic saved records and mocked services. The backend has isolated and real-route HTTP tests in `tests/paymentErrors.test.mjs`; run them with Bun, without starting the production server or contacting a live payment provider. No live funds were moved during these checks.
