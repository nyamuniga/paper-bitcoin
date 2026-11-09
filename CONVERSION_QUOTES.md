# Protected conversion reviews and quote fitting

Both Bitcoin → Dollar and Dollar → Bitcoin treat the entered source amount as a hard spending ceiling. The display exchange rate supplies an initial guess, while the actual provider conversion quote and Cashu funding fees determine whether that guess fits. Dollar ceilings stay in six-decimal token units; they are not replaced by an approximate sat budget.

## Amount screen and protected Review

The amount screen polls the shared fiat ticker every three seconds while visible. Requests are deduplicated, cached briefly and bounded to ten seconds. This updates a display estimate, not a Cashu invoice or a provider quote. Its starting output is divided by 1.03 in both directions: a conservative receive estimate, never an inflated promise.

New reviews persist `protection_bps: 300`. Legacy journals default to zero and retain their original recovery behavior. The review fixes `max_debit` to the entered source budget and `output_amount` to the fitted minimum received. A 60-second countdown is an app review deadline, not a reservation of provider liquidity. Protected reviews cannot silently refresh their amount, ceiling or expiry; native journal code rejects refreshes. Expiry requires editing/requoting and confirming the resulting new review.

Quote fitting reserves `ceil(quotedSourceCost * 1.03)`. In Bitcoin → Dollar that is **usable funding** in the Spark funding invoice, with Cashu melt reserves and input fees additionally checked against the original budget. In Dollar → Bitcoin the extra allowance remains in the user's token balance until needed. The SDK's own 0.1% slippage setting is unchanged and already represented in its estimates; the 3% reserve covers movement between review and execution, not an additional app fee. Provider minimums/fees may reduce output beyond the initial display estimate.

Confirmation reprices the same receive floor within the saved cap. The SDK builder installs a `PaymentObserver`: during a protected send it also checks source-asset provisional outputs after internal SDK repricing, before broadcast. It sums outgoing source amounts by payment ID, reserves the latest estimated conversion fee, and blocks debits above funded Bitcoin / the approved microdollar ceiling. It never raises the cap or retries a submitted send. A live hook rejection before any source payment approval restores the journal to funded/review, allowing return or a fresh attempt without repeating funding. After any source approval, a crash, timeout or other exception remains pending and requires receipt reconciliation; those cases never trigger this reset.

Unused Dollar allowance stays in the Dollar balance. Unused funded Bitcoin stays in the SDK wallet, uses the existing automatic Cashu sweep once at least 100 sats are available. Smaller residuals remain user-owned; later residuals can bring them above the return threshold. Active conversion journals block background sweeping of reserved funds. Returning Bitcoin incurs the normal Lightning/mint fees, so this is not a promise that every reserved sat will return free of charge.

This design reduces repricing failures, but cannot guarantee delivery after Review: provider downtime, liquidity changes, price moves outside the approved bounds, insufficient balances and network failures still require safe recovery. Never describe the countdown as a guaranteed provider rate lock.

## Fitting and caching

The search makes at most five provider preparation attempts and stops at the first valid fee-inclusive quote. For an overshoot, it translates the excess source cost into output units using the provider's quoted principal:

```
overshoot = totalSourceDebit - sourceBudget
correction = ceil(output * overshoot / quotedSourcePrincipal) + 1 output unit
nextOutput = max(0, output - correction)
```

Provider minimums still apply. A repeated identical debit indicates a flat/rounded fee tier; the existing bounded 5% plateau guard remains for that case, rather than repeatedly subtracting an overshoot that does not change the fee. Convergence in one or two attempts is not guaranteed for discontinuous fees. Exhausting the five attempts fails without sending or saving candidate receive transactions.

A successful quote's observed principal/total-fee envelope is cached for 60 seconds, scoped by SDK wallet instance, conversion direction and mint. It only seeds the next search. Every review still gets an authoritative live quote and checks the actual total against the source ceiling. No fixed 0.25% routing/conversion fee is assumed.

## Temporary invoices and History

Dollar → Bitcoin candidates use `stable_mint_quote_preview`. These are real unpaid invoices at the mint, but no wallet receive transaction or blinding outputs are allocated during fitting, Review, or rate refresh. A fresh checked preview can be reused in Review in either direction.

On confirmation, the app checks the live conversion cost, then calls `stable_accept_mint_quote` with the saved operation ID. Native code validates the signed invoice's amount, Bitcoin network and expiry, checks the mint's quote ID/invoice/unpaid state, and saves recovery outputs for that exact quote. It does not create another invoice. The conversion cannot advance to sending until this receive record exists. Quote/wallet changes during verification are rejected; a repeated preparation reuses the existing pending receive record rather than allocating outputs twice.

Bitcoin → Dollar uses temporary Spark funding invoices to check the selected Cashu mint's fee reserve. Only the selected funding invoice is paid, after confirmation, through the existing capped and journaled funding path. Legacy live-review refresh reuses the selected invoice whenever it still fits; protected reviews do not refresh automatically.

Existing pending receive entries are retained for status reconciliation. Their amounts/timestamps alone cannot safely distinguish abandoned conversion candidates from genuine incoming payments.

## Amountless-invoice compatibility

The installed Breez Spark SDK exposes `prepareSendPayment`, not the lower-level `getLightningSendFeeEstimate` API. NUT-23 specifies an amount on BOLT11 mint quote requests; its advertised `options.amountless` support concerns melting/paying invoices. That does not establish a portable amountless Cashu receive-quote API for this wallet's recovery path. This implementation therefore uses the fixed-invoice fallback in both directions, without probing unsupported zero-amount requests or changing SDKs.

This fallback can still create multiple temporary remote invoices. It bounds those attempts and prevents them from becoming pending History entries. A future amountless extension must carry an explicit amount through fee estimation, quote verification, capped funding and receipt recovery before being enabled.

Sources: [Cashu NUT-23](https://cashubtc.github.io/nuts/23/), [Breez token conversion](https://sdk-doc-spark.breez.technology/guide/token_conversion.html), [Breez fee policies](https://sdk-doc-spark.breez.technology/guide/send_payment.html#fee-policy).

SDK source verified for the installed 0.28.0 release: [conversion execution](https://github.com/breez/spark-sdk/blob/0.28.0/crates/breez-sdk/core/src/sdk/payments/conversion.rs), [pre-send observer](https://github.com/breez/spark-sdk/blob/0.28.0/crates/breez-sdk/core/src/models/payment_observer.rs).
