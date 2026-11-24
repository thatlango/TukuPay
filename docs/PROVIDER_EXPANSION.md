# Provider expansion — contract implementation and release gates

## Scope
The candidate contract client accepts only HTTP on 127.0.0.1. It cannot use live credentials, and is not registered with the payment router. Local fixture success is not operator sandbox or live certification. MTN and Airtel collection remain the only existing routable rails.

| Rail | Implemented in fixture client | Remaining |
| --- | --- | --- |
| Airtel Uganda | PyMoMo payout initiation/status fixture; fail-closed evidence boundary | Obtain account-specific disbursement product/version, approved PIN encryption/signing contract, key rotation, request/response and status schemas. |
| M-Pesa Kenya | STK initiation and query | Daraja account OAuth, persist checkout ID, trusted financial amount/receipt evidence, B2C contract and callback handling. STK query alone cannot settle. |
| Paystack | Hosted checkout, verify, transfer, transfer verify | Merchant account coverage, recipient onboarding, signed webhooks, immutable provider IDs and checkout session persistence. |
| Flutterwave | Hosted checkout, verify by reference, transfer and transfer lookup | Merchant account/version/market and recipient verification, signed callbacks and hosted checkout integration. |
| Wave | Checkout, lookup by session ID, payout and payout lookup | Merchant account, optional request signing, callback authentication, reconcile net amount and fees. |
| Orange Money | PyMoMo checkout/status fixture; fail-closed evidence boundary | Select licensed merchant market, obtain its actual Web Payment API contract and supported operations, verify callback and payment evidence. No generic payout assumed. |

Public reference URLs (reviewed 2026-11-24):
- Airtel: https://developers.airtel.africa/
- Safaricom: https://developer.safaricom.co.ke/
- Paystack: https://paystack.com/docs/api/transaction/ and https://paystack.com/docs/api/transfer/
- Flutterwave v3: https://developer.flutterwave.com/api/transactions/verify-transaction-with-tx-ref and https://developer.flutterwave.com/api/transfers/create-a-transfer
- Wave: https://docs.wave.com/checkout and https://docs.wave.com/payout/
- Orange: https://developer.orange.com/apis/om-webpay/

## Non-negotiable design before routing candidates
1. Extend payment intents with customer next action (hosted URL or mobile prompt), immutable merchant reference and distinct provider-native identifier. Never put a provider-generated checkout ID in place of the Tuku reference. Persist acknowledgement atomically and recover ambiguous writes by the original merchant reference. An operator that cannot recover a missing acknowledgement needs manual exception handling.
2. Separate stored beneficiary identifiers from phone numbers; bind the approved recipient to the payout and match it against authoritative evidence. Validate fees, funding source and settlement currency.
3. Separate provider market availability, sandbox testing and production authorization. Extend database/provider enums and route selection only with reviewed adapter contracts. Never route planned providers by default.
4. Obtain signed or authenticated callback specifications per operator; use callbacks only as hints unless a reviewed contract establishes authoritative evidence. Match amount, currency, merchant reference, provider ID and beneficiary where applicable.
5. Require isolated tests for success, rejection, timeout, duplicate reference, missing response, amount/currency/recipient mismatch, concurrent dispatch and provider outage.
6. Run operator sandbox with approved test credentials in a separate environment, record evidence and obtain finance/security/operator approval. Only then consider activation.

## Airtel and Orange acceptance gates
The public portals identify the products, but the current Tuku merchant-account contracts have not been supplied. Do not invent encryption algorithms, PIN handling, endpoint paths, signing headers, key exchange or payout support. Require a sanitized account-specific API specification and test vectors (never real PINs, secrets or private keys) before implementing the adapter. Confirm status and balance response formats, error mapping, currency/amount rules, callback authentication and settlement reconciliation. A mock that returns success cannot replace this evidence.

## Local test and operator workspace
Run pnpm test from root (candidate nested tests explicitly included), then bash scripts/verify-local.sh --pymomo with dependencies available. Candidate tests use synthetic credentials and a loopback HTTP fixture. Review SDK_INTEGRATION.md and OPS_WORKSPACE.md. Workspace is local and not a production deployment.

Release status: development only, no production activation or payment execution.

PyMoMo 1.3.0 pinned mock server exposes Airtel v1 disbursement and Orange Web Payment paths. The new candidate methods exercise those fixtures with synthetic values only. Both stay pending regardless of a successful fixture status. PyMoMo's Airtel helper describes RSA PKCS#1 v1.5 plus Base64 PIN encryption; treat that as a third-party reference, not an approved Airtel Uganda contract. Obtain operator test vectors and current key/signing specifications before implementing production encryption. The independent PyMoMo harness includes these two fixture checks; no real PIN or merchant secret is used.
