# TukuPay v1.0 — engineering recovery and production readiness
Decision: freeze new provider/features until P0 release gates are met. This is a development programme, not a release authorization. PR #4 remains draft. Baseline audit: docs/SECURITY_AUDIT_2026-11-24.md.

| Workstream | Priority | Owner role | Acceptance evidence | Status |
|---|---|---|---|---|
| EP01 Engineering recovery | P0 | Engineering | Reproducible dependencies, complete local and hosted tests, reviewable artifacts, scans | BLOCKED: equipped runner and lockfile |
| EP02 Transaction integrity | P0 | Engineering | Durable dispatch, state policy, concurrency and crash tests, no duplicate dispatch | OPEN |
| EP03 Financial ledger | P0 | Engineering + Finance | Reviewed rules, immutable evidence, balanced journals, compensation, zero integrity exceptions | OPEN |
| EP04 Identity and approvals | P0 | Security + Core owner | Human identity, least privilege, beneficiary verification, independent approvals | OPEN |
| EP05 Infrastructure and data | P0 | Infrastructure + Security | Separate roles/storage, retention, redaction, backup restore, incident drill | OPEN |
| EP06 Provider/API security | P1 | Engineering + Security | Certified callback and provider contracts, request/response validation and rate limits | OPEN |
| EP07 Treasury | P1 | Finance + Engineering | Independently matched bank/provider evidence, funding and obligations | OPEN |
| EP08 Operations workspace | P1 | Product + Finance | Scoped human access, reconciliation and exception workflow | OPEN |
| EP09 Estate integration | P1 | Core + product owners | Durable versioned financial events and contract tests | OPEN |
| EP10 Payment capabilities | P2 | Product + Finance | Governed refund/reversal, checkout, receipts and scheduling contracts | DEFERRED |
| EP11 Provider expansion | P2 | Provider partnerships + Engineering | Commercial certification and financial/security tests for each rail | DEFERRED |
| EP12 Intelligence | P2 | Engineering + Finance | Historical validation, independent audit and benchmark evidence | OPEN, offline only |

## Implementation order
1. Recover verification on a separate non-production runner, generate and review dependency lockfile, execute existing full suite; fix build defects before accepting runtime changes.
2. Specify financial transition, evidence and journal invariants. Implement thin slices behind simulator verification; review with finance before activation. Preserve original references and financial history.
3. Integrate Core human identity and approval policy only after confirming its actual interface; do not invent an identity contract or grant new production privileges.
4. Implement infrastructure and data controls; test migration rehearsal, restore and recovery on isolated storage.
5. Complete P1, then evaluate P2.

## Closure discipline
Every finding SEC-01 through SEC-20 has a release gate mapping in release-gates.json. Code committed is not evidence of verification. Record the exact candidate SHA, command, exit status, scope, artifacts, reviewer and limitations. No closed finding without relevant test and review evidence. No production changes, real transactions or operator onboarding through this programme without explicit release authorization. Do not merge this draft merely because GitHub reports mergeable.

## Known constraints
GitHub CI failures have no step-level evidence. Local DNS cannot resolve GitHub; pnpm, Docker, PostgreSQL and Cargo are absent. Node and Python are available. No live deployment inspected. Use the dedicated runner runbook to unblock EP01. No financial approvals or commercial certifications inferred from code.
