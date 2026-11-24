# TukuPay estate integration programme
Status: implementation candidate; production HOLD. Baseline e4717b25575b6b9d4086343d7d2bdb6b6fd9b96f; PR #4.

## Developer experience
One server-side dependency, @tuku/pay-sdk, and one product-specific configuration. Products import a configured client, use typed methods and supply their immutable business reference and idempotency key. Other languages use the same versioned HTTPS API. Browser/mobile clients call their own product backend, never receive payment service tokens. No provider credentials outside TukuPay.

## Verified repository inventory
- Tuku-Core b6c8784: existing PKCE SSO exchange, product integration credentials, /api/v1/integrations/events and batch, estate telemetry client. The telemetry endpoint map does not yet include tukupay. Do not invent an OIDC/JWT contract; Core owns human identity and entitlements.
- kela f5fe9f5: existing KelaTukuPayService directly calls the API for collection and polling. It currently settles from SUCCESSFUL status using local total without checking authoritative amount/currency/product/external reference. First collection pilot must validate the entire binding before local fulfillment.
- lendflow c5ec9da: deferred provider registrar and collection interface exist. Country, tenant, loan/payment allocation and callback contracts need review; no new execution until verified. LendFlow owns loan accounting and repayment allocation.
- UnitsV1 2be4f5e: invoice payment functions and Core outbox exist. Use invoice-level payment references and durable local posting, not a second ledger in TukuPay.
- impactos-platform 2491e7a: finance and enterprise integrations; controlled approvals and local accounting remain product responsibilities.
- Tuku-Tuku-Operations-Console dac695b: existing Core integration and operations UI. Read-only ops views first; finance approvals later.
- Momentum ff6c824: consume Core estate telemetry, not individual payment records.
- Connex: verify actual repository/notification contract before wiring; no repository identified by the initial inventory. Notifications originate from deduplicated business outcomes, not unverified provider callbacks.
- TukuIQ: scoped aggregated intelligence, no raw phone numbers or payment credentials.

## Work packages and order
| ID | Role | Acceptance |
|---|---|---|
| EST-01 | SDK/platform | Versioned server package with ESM and CommonJS support, configuration factory, typed errors, API examples, install artifact and unit/contract tests. No registry publication until approved. |
| EST-02 | Core/identity | Register product, environment-scoped service credentials; Core telemetry contract, independent human identity and tenant authorization. Do not enable payment-based entitlements from initiation status. |
| EST-03 | Kela | Replace bespoke HTTP client with SDK after package distribution; bind payment ID, product, business reference, country, currency, amount and provider; durable idempotent local fulfillment; simulator tests. |
| EST-04 | LendFlow | Implement adapter against verified SDK, preserve local posting/allocations and maker-checker; keep disabled until test/approval. |
| EST-05 | Units and ImpactOS | Invoice and finance adapter mapping, durable local consumer processing, tenant isolation; no cross-product access. |
| EST-06 | Operations, Connex, TukuIQ, Momentum | Scoped telemetry/ops, notifications from confirmed domain events, exact monetary strings, privacy-minimized aggregate signals. |
| EST-07 | Integration QA | Contract matrix, package install tests, end-to-end simulator, duplicate and crash tests, independent security/finance review, staged rollout and rollback. |

Plan first: EST-01 is the dependency for product integrations. EST-02 and consumer discovery may proceed concurrently. Pilot Kela before LendFlow and other finance products. No independent coding-agent delegation tool is available; work packages are handoffs, not actual agent execution.

## Contract and ownership
A product owns its quote, invoice, loan, tenant, order and accounting rules. TukuPay owns transaction evidence, provider communication and its payment ledger. On successful status, the product must match the original immutable local obligation to the authoritative TukuPay transaction, then atomically record the business effect and processed event ID; acknowledge only after commit. A response or event alone is not authority to grant value. An ambiguous write is reconciled against the original reference, not automatically replayed. Never aggregate amounts across currencies. No direct database coupling.

## Release gates
Keep draft branches, no production deployment or registry publish. SDK artifact must be built from reviewed exact source and installed in a separate consumer test; no dependency on an absent package. Full API and PostgreSQL tests, Core authorization, product tenant mapping, event consumer idempotency and finance/security acceptance are required. Existing products retain current configuration until controlled cutover. New integration flags default off. A successful SDK unit test is not a live rail certification.

## Sprint 1 execution record — 2026-11-24
| Package | Issue | Status and artifact |
|---|---|---|
| EST-01 | #11 | Candidate SDK 0.2.0 implemented and independently installed; private distribution/registry and consumer lockfiles outstanding. Commit ad7d0e11373c2b5f6f1ae876eeac3d6c1d2b835f. |
| EST-02 | #12 | [Core draft PR 101](https://github.com/thatlango/Tuku-Core/pull/101), read-only normalized telemetry adapter; catalog activation and identity work outstanding. TukuPay environment field added in e6ed6f4362e90a6c1b2c4ab8a3ed18350c7e33d0. |
| EST-03 | #13 | [Kela draft PR 40](https://github.com/thatlango/kela/pull/40), interim API binding checks, SDK installation and durable local processing outstanding. |
| EST-04 | #14 | Actual deferred LendFlow interface inspected; implementation outstanding. |
| EST-05 | #15 | Units and ImpactOS discovery; implementation outstanding. |
| EST-06 | #16 | Estate read-only telemetry foundation; other consumers outstanding. |
| EST-07 | #17 | Isolated verification below; full integration tests outstanding. |

### Verification
Node 22.16.0, npm 10.9.2, TypeScript 5.8.3. SDK source reconstructed in isolated folder; all source and package configuration hashes match the committed files. Local tsconfig reproduced repository compiler settings with a local typeRoots override; no full monorepo build. ESM and CommonJS compile, 11 SDK unit tests passed, 0 failed. npm pack --ignore-scripts after build generated a private tarball; independent consumer npm install --offline --ignore-scripts --no-audit --no-fund succeeded. Both ESM import and CJS require passed. Package SHA-256 c0e69094b8cadf8c1913451dfb1d611d5eba4389478b8a311a0acd6daa683b51 (8626 bytes; candidate local artifact, not a published registry version).
SDK added source blob estate.ts cb80ffa0e63690c35eb1555a5de647f98c242bfe, estate.test.ts c3d7e25beea9ea7dd9bd94a9e114d7abb607c869, index.ts 2c901c831780b2aad1a2833720345af0210e3f7d; package.json 20f28ae094e04cf4304563a8631fe599a781c1a3, tsconfig.cjs.json 3fe549e6672a25ea0ccd26f6094e0294a9a8e62f, mark-commonjs.mjs 5091c57588d93422b20d51ed8e60146a46231ba3.
Core helper strict compilation and three isolated Node checks passed; actual source hash 3c70ebfc230843fa26c01d8bbe48e69fd612195d. Kela helper strict compilation and two isolated Node checks passed; actual source hash ac3ce8e1d3990a9496f1fd4a6c982f2fc6f4f162. Core and Kela Vitest test files committed but not run in their full projects. No cross-service calls or financial transactions. Core and Kela draft PRs initially report mergeable false; review actual branch conflicts or status before any merge.

### Next acceptance
Provide a controlled private distribution path for the SDK and install the pinned package in Kela and LendFlow; generate consumer lockfiles. Review actual product-specific tenant and obligation scope and implement local transactional deduplication, posting and recovery. Establish independent human approval using the actual Core contract. Verify Core telemetry/catalog and product integration end to end in simulator. Keep all seven issues open; independent coding agents were not launched, as delegation is unavailable. Do not promote or publish this candidate yet.
