# TukuPay security audit — 24 November 2026

Status: source assessment completed for reviewed components; full penetration test outstanding.
Main: 6979583ca3686c2dcafd28ddd18c913af350c630.
Development candidate: 74e72827c5e3b9270e1f10e4e3a20fd623fbbb0a (draft PR 4).
Release decision: HOLD live-money activation and production promotion. No live endpoint, operator account, production database or real funds were accessed. No exploit against a deployed service was attempted. This is not security certification.

## Scope and method
Reviewed authentication, product authorization, payment/payout services, provider transport and evidence, webhook policy, finance/ledger/settlements, reconciliation, migration and deployment, SDK, local operations workspace and offline intelligence. Compared critical main-branch paths with candidate paths. Ran selected existing unit tests from hash-matched source files and a separate synthetic authorization harness. Findings are qualitative engineering severity, not CVSS or independently confirmed live exploits.

## Vulnerability and control-gap register
All findings remain open unless otherwise stated. Critical findings block live use; high findings block promotion until remediated or formally risk-accepted with evidence.

| ID | Severity | Source evidence and impact | Remediation / acceptance |
|---|---|---|---|
| SEC-01 | Critical | Main routes/payments.ts and routes/payouts.ts lack product checks; scope alone does not isolate transactions. Candidate adds product checks. | Verify candidate HTTP authorization matrix and deny cross-product create/read/refresh/approve. Determine deployed commit before exposure assessment. |
| SEC-02 | Critical | Main services/payout-service.ts does not reserve dispatch atomically; main payment-service.ts posts collection ledger outside status commit. Candidate improves both. | Prove concurrency and crash consistency on disposable database; enforce uniqueness and zero integrity-audit findings. |
| SEC-03 | High | auth/service-auth.ts retains wildcard static legacy administrator; token expiration, lifecycle, duplicate-token validation and human identity absent. | Strict registry validation, scoped expiring identities, rotation, Core integration, controlled break-glass. Verify revoked and expired identities rejected. |
| SEC-04 | High | services/payout-service.ts uses service identity for approval; no independent human maker/checker proof, verified beneficiary or risk-based approval policy. | Human-attributed approval bound to immutable intent, independent approver and beneficiary evidence. Test changed intent invalidates approval. |
| SEC-05 | High | services/settlement-service.ts and routes/ops.ts permit recorded settlements without independent bank evidence or second approval. | Separate recording, evidence matching and approval from posting; reject unverified settlement postings. |
| SEC-06 | High | database/migrations/001_initial.sql and 004 schema lack immutable posted-journal protections and database-enforced balanced posting sets. | Add governed journal finalization and compensation; finance-approved accounting constraints, immutable history and tested DB roles. |
| SEC-07 | High | providers/settlement-validation.ts does not establish a durable unique provider financial-evidence registry; payment/payout applyStatus retains mutable latest response. | Persist separately verified evidence and uniqueness by authoritative scope; preserve history and reject conflicts. |
| SEC-08 | High | providers/webhook-policy.ts and routes/webhooks.ts lack native callback authentication; candidate defaults unsigned production callbacks off and treats callbacks as wake-ups only. | Keep unsigned production ingress disabled unless independently reviewed; verify provider-specific authenticity, bounded ingress, replay policy, durable processing. |
| SEC-09 | High | providers/airtel.ts balance lookup has no account-specific argument; ops-service.ts labels balance using caller-selected account. | Explicit account capability and evidence; prevent collection balance from representing disbursement funds. |
| SEC-10 | High | providers/airtel.ts casts monetary amount to Number; utils/money.ts lacks signed BIGINT bound; settlement evidence numeric precision policy incomplete. | Canonical exact money contract, checked provider representation, range and currency vectors across languages. |
| SEC-11 | High | services/reconciliation.ts process-local concurrency guard and no durable dispatch/recovery record; transaction service crash windows unresolved. | Durable outbox and bounded worker leases; test ambiguous outcome recovery without duplicate financial requests. |
| SEC-12 | High | services/payment-service.ts and payout-service.ts persist provider request/response data; server.ts logs unhandled errors; retention/redaction policy not enforced in source. | Data minimization, allowlisted error records, sensitive field redaction and retention/access controls. Test synthetic secrets and PII absent from logs. |
| SEC-13 | High | compose.prod.yml shares secret file across services; role separation and backup restore not verified. New migration 007 is a binding guard, not privileged-access isolation. | Separate migration, API and read-only identities; distinct environment storage/secrets, least privilege, backup and restore rehearsal. |
| SEC-14 | High | CI has failed; no lockfile or reproducible complete release verification; dependencies and image scan outstanding. | Restore equipped runner, lock dependencies, scan SBOM and images, enforce release checks. |
| SEC-15 | Medium | auth/service-auth.ts rate limiting is per process and authenticated identity; configuration validity and ingress protections incomplete. | Validate limits, bound anonymous ingress and distributed quotas; test controlled load and expected rejection. |
| SEC-16 | Medium | routes/payments.ts, payouts.ts and ops.ts have partial schema checks; identifiers, metadata lengths, phone formats and errors need consistent validation. | Shared versioned request schemas and field limits; malformed input returns stable 4xx without financial state change. |
| SEC-17 | Medium | provider credentials mode checks do not independently establish operator endpoint/account legitimacy. | Approved endpoint and account registry, explicit mode/target checks, deployment egress restrictions and contract verification. |
| SEC-18 | Medium | packages/sdk/src/index.ts accepts shape-unverified response objects; local workspace uses service identity rather than individual operator identity. | Runtime response schemas, human operator identity and tested authorization; no exposure of loopback workspace to public ingress. |
| SEC-19 | Medium | routes/internal.ts and ops-service.ts aggregate currencies or convert amounts to Number; financial telemetry may misrepresent values. | Currency-separated exact string amounts and approved estate telemetry schema. |
| SEC-20 | Medium | Offline reports use local file integrity hashes and supplied scope evidence, not independent authentication. | Restrict filesystem access, retain provenance, require verified statement origin and explicit completeness; no automated financial decisions. |

## Executed verification
Node 22.16.0, TypeScript transpileModule ES2022, temporary isolated directory. Git checkout failed because github.com DNS unavailable. All seven reproduced repository source/test blobs matched exact Git hashes:
- errors.ts bc96773dc3fb8a096c6203ce4e506b10e78b30b5
- auth/service-auth.ts 2c729243d3fdc4f75adc171134da90370c626e8d
- auth/service-auth.test.ts 414316d4d5581b411cf94e4b2a1f5918727a4d10
- config/financial-environment.ts 311648a81ca7db2767472afb4ac4c09bbabcca1e
- config/financial-environment.test.ts f1dbce4af092a5c9d5e9502cc43a7e9e941eb447
- providers/webhook-policy.ts 8d3d6018a939aaa237dfe9ff9edffd26081a362a
- providers/webhook-policy.test.ts 944cdc346d4d01335adecb8e475f02e7233dd4f1

Existing unit test groups: 6 passed, 0 failed (product access 1, environment 3, callback policy/reference 2).
Separate synthetic harness: 3 passed, 0 failed (invalid/missing credential denial; read-only identity permission denial; other-product denial). Harness uses mocked request/reply objects, not Fastify injection, HTTP or production credentials. No database or network requests. These results verify only the tested helper behavior.

Latest candidate CI run 45369865200: failure; both verify and financial-modules failed, no step details available. Cargo, pnpm, Docker and psql unavailable here. No dependency, image or secret history scanner was executed. No full stack, infrastructure, TLS, webhook, operator, load, race, backup/restore, or live penetration testing was performed. Deployed revision and configuration unknown.

## Mandatory release gates and ownership
Engineering: restore runner; full typecheck/build and simulator E2E, concurrency/crash and authorization regression tests; zero unexpected ledger integrity findings; dependency/secret/image scans with reviewed results.
Finance: approve accounting rules, immutable evidence and settlement/approval policies; reconcile independently supplied statements; review legacy data.
Infrastructure/security: separate database environments and roles, validate secret lifecycle and ingress/egress, restore backup on isolated host, complete authorized staging penetration test and remediate critical/high findings.
Product owner: confirm commercial provider certification and risk acceptance; approve promotion only after recorded evidence. No production promotion or real-money testing by this audit.

Audit document only; no application remediation or deployment was performed during this review.
