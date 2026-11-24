# TukuPay SDK integration
Use the server-side SDK, never embed a service credential in a browser or mobile build.
The current routable Provider type remains MTN/Airtel; CandidateProvider is informational only.
Use a product-specific service token with the relevant operation scope. Use a different, authorized finance identity for approval. Do not distribute a wildcard admin credential to products.
Create operations require a stable idempotency key per immutable business intent. Do not generate a new key on timeout. Query the original transaction and reconcile pending outcomes; do not give value on an initiation acknowledgment.
The SDK exposes create/get/refresh payment and payout, approval, and scoped operations queries. TukuPayApiError exposes HTTP status and application code. No automatic financial POST replay. For SDK transport failures, outcome may be unknown.
Operations methods require ops:read; they are intended for a dedicated operator backend, not product clients.
The new candidate checkout contracts are not part of the public createPayment API yet. Hosted checkout requires persisted provider-native IDs, next-action URLs and callback/return routing before integration.

## Candidate contract additions
- getFinancialEvents requires events:read. acknowledgeFinancialEvent requires events:ack and must be invoked only after durable local consumer processing. Deduplicate by event ID; do not use sequence as a commit-order high-water mark.
- getDispatchRecovery requires ops:read and is review-only. No automatic resubmission.
- proposeSettlement requires settlements:write; reviewSettlement requires settlements:review and independent reviewer identity. Both return ledgerPosted:false. Neither API authorizes actual settlement posting. These SDK methods validate shape and requested scope/decision; they do not independently authenticate evidence.
- Operations capabilities, exception records, transport metrics and review envelopes receive runtime checks. The broad operations summary remains an envelope check; consumers must validate fields used in decisions.
- Balance capabilities now optionally include accounts.collection and accounts.disbursement, each with configured and available flags. Flags do not prove connectivity, available funds or commercial certification.
- Provider configuration requires a valid endpoint, compatible mode, explicit supported MSISDN mode when supplied, and supported Airtel API version (v1). MTN sandbox target is sandbox; production target must match the market registry. Confirm operator-specific paths and targets before promotion. Loopback HTTP is permitted for sandbox fixtures only; production requires HTTPS and rejects loopback.
- Phone validation rejects explicit international scope mismatches and invalid characters but does not establish subscriber ownership or complete national numbering-plan validity.
- Sensitive request and error logging is minimized in the candidate. Existing stored raw provider payloads are not migrated or deleted; retention, minimization, access controls and log capture tests remain separate release requirements.

## Estate SDK package 0.2.0 (candidate)
Build at repository root: pnpm --filter @tuku/pay-sdk build. Package from packages/sdk: npm pack --ignore-scripts after successful build and test. The private package supports both ESM import and CommonJS require; no external runtime dependencies. Install the reviewed tarball through the product's package manager or an approved private registry. Do not publish or install from a moving branch. Keep version and integrity pinned; consumer lockfile must be generated and reviewed in the consumer repository.

Server configuration: TUKUPAY_ENABLED=false by default; set true only in authorized environments. TUKUPAY_BASE_URL, TUKUPAY_TOKEN, optional TUKUPAY_TIMEOUT_MS (1000–60000, default 12000). Use the product code as a fixed application constant, not user input. Example:

```ts
import { createEstateClient, assertSuccessfulCollection } from '@tuku/pay-sdk';
const pay = createEstateClient('kela');
// Initialize once in the server-side payment service. If null, integration is disabled.
// Persist the obligation and a stable idempotency key before creation.
// After reading the authoritative payment by its persisted ID:
if (pay) {
  // binding is read from the local immutable obligation, never reconstructed from the response.
  const payment = await pay.getPayment(binding.paymentId);
  assertSuccessfulCollection(payment, binding);
  // Product still owns idempotent local posting/fulfillment and durable event processing.
}
```

The guard matches payment ID, product, external reference, country, currency, exact decimal amount, optional provider, successful status and presence of provider reference. It does not authenticate independent bank evidence, check beneficiary ownership, authorize posting or replace product tenant controls. The SDK validates response shapes; products retain their own domain ledger. HTTP fallback uses the documented /v1 endpoints and the same binding checks.

Core telemetry: GET /internal/estate-telemetry returns schemaVersion 2, productCode tukupay, financialEnvironment and currency-separated minor-unit strings. Core must reject a mismatched environment. No event ingress, entitlement, or notification activation is implied.

## SDK 0.3.0 candidate — event consumption
The optional consumeFinancialEventsOnce(client, processDurably) helper executes one bounded pull batch. The application callback must first authorize the local obligation, verify binding and commit its local business effect and deduplication record atomically. Return processed only after commit, already-processed only after durable lookup, or deferred to stop the batch without acknowledging that event. A thrown handler or failed acknowledgement stops the batch and propagates the error; a later scheduled invocation can see the event again. This does not supply a database transaction, scheduler, automatic retry or fanout. A deferred event can block later items in the batch; operators must review and resolve it. Do not use sequence as a commit-order high-water mark. Existing consumers remain pinned to 0.2.0 until the new release is reviewed and adopted.
