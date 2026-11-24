# TukuPay SDK integration
Use the server-side SDK, never embed a service credential in a browser or mobile build.
The current routable Provider type remains MTN/Airtel; CandidateProvider is informational only.
Use a product-specific service token with the relevant operation scope. Use a different, authorized finance identity for approval. Do not distribute a wildcard admin credential to products.
Create operations require a stable idempotency key per immutable business intent. Do not generate a new key on timeout. Query the original transaction and reconcile pending outcomes; do not give value on an initiation acknowledgment.
The SDK exposes create/get/refresh payment and payout, approval, and scoped operations queries. TukuPayApiError exposes HTTP status and application code. No automatic financial POST replay. For SDK transport failures, outcome may be unknown.
Operations methods require ops:read; they are intended for a dedicated operator backend, not product clients.
The new candidate checkout contracts are not part of the public createPayment API yet. Hosted checkout requires persisted provider-native IDs, next-action URLs and callback/return routing before integration.
