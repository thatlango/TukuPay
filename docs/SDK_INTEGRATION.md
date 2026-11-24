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
