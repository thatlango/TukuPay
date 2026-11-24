# Financial core completion plan and verification record

## Scope
Candidate: d391d2fe2024b6e4f1c9730d48595cc33de94a77. Draft PR 4.
Release decision: HOLD. No production changes authorized or performed.
The previous migrations 008–010 are an empty-database candidate, not an approved upgrade of existing financial data.

## Current implementation and ownership
| Control | Evidence today | Remaining acceptance |
|---|---|---|
| Dispatch recovery | Durable reservation; operational review endpoint; offline review classification | Engineering: worker lease and recovery design, fault injection, exact provider contract. No ambiguous write replay. |
| Transaction state machine | TypeScript and SQL transition definitions | Engineering + Finance: demonstrate all state transitions against PostgreSQL, including conflicting observations and initial-state restrictions. |
| Dispatch uniqueness | Unique indexes in migration 008 | Engineering: concurrent transaction test with isolated PostgreSQL, verify rollback and recovery. |
| Success evidence | Minimal immutable record and response digest in migration 009 | Security + Finance: validate authenticity, scope, access privileges, retention and correspondence with provider evidence. A digest alone does not authenticate a statement. |
| Journal integrity | Deferred balance and scope checks, immutable journals/postings, offline review | Finance + Engineering: verify deferred commit checks, approved account identities, correction policy and exact ledger coverage. |
| Settlements | Non-posting proposal/review, independent dataset matching | Finance: obtain independently authenticated provider and bank evidence, actual human approver, agreed accounting policy. No automated posting. |
| Financial events | Atomic product events and pull acknowledgement | Product owners: prove consumer durability, duplicate handling, access isolation, ordering policy and contract compatibility. Push fanout is deferred. |

## Legacy database migration procedure (planning only)
Prerequisites: designated finance owner and database administrator; explicit environment and revision; authorized read-only access; restricted encrypted backup; independent provider and bank evidence; isolated restoration target. Do not connect a simulator to existing financial data.

1. Inventory the actual deployed revision and schema migration history. Determine whether the database already has financial data and whether it is a single environment. Stop if provenance or environment is unclear.
2. Take an approved consistent backup. Restore it to an isolated network with no operator credentials or public ingress. Record checksums, timestamps, restore logs, row counts and scope.
3. Inventory successful intents, missing or duplicate provider references, missing journals, amount/currency/country discrepancies, and previously recorded settlements. Run the existing read-only payment integrity check and journal export on the isolated copy. Record every discrepancy and distinguish missing evidence from failed transactions.
4. Reconcile against independently obtained statements. Do not infer historical success from status or manufacture missing evidence. Finance must approve a classification for each exception. Keep immutable source snapshots.
5. Design a separately reviewed legacy migration; do not remove the empty-database guard merely to complete deployment. Preserve IDs, original references, evidence, approval history and accounting amounts. Establish pre/post migration totals by product, environment, provider and currency. Do not aggregate different currencies.
6. Rehearse the approved migration on the isolated restoration target. Validate all constraints, existing reads, reconciliation and event consumers. Verify recovery/rollback with no lost history. Reject any unexplained difference.
7. Obtain finance, security and infrastructure acceptance. Production promotion remains a separate decision with an approved maintenance and recovery plan.

Completion: exact candidate revision, backup/restore proof, signed reconciliation dispositions, reviewed migration, zero unexplained differences, passing integration/security evidence and approved recovery plan. Stop at any missing prerequisite.

## Offline review module
python/intelligence/core_review.py provides review_settlements, review_dispatch and review_journal. It makes no database or network requests. Settlement matching compares normalized proposal, provider settlement and bank credit observations; detects missing, conflicting or duplicate observations and reused bank references. Bank scope is environment/country/currency/reference. Multiple bank accounts and provider merchant accounts need independently defined account identifiers before real use. Caller-supplied datasets do not establish provenance or completeness. Matching is not payment or posting authority. Journal review checks positive bounded amounts, unique posting IDs, currency consistency and balanced totals; it does not create corrections. Dispatch review classifies uncertainty, not dispatch commands.

## Executed evidence
Local isolated Python unittest, six tests passed in 0.001 seconds. No failed tests. Exact committed blob hashes match local executed sources:
- core_review.py a2a8f587f9e6a05360367328da08a06d7eded3e2
- test_core_review.py f503d280fea7ac372d3612895b0635929f1a6354

Command: python3 -m unittest -v (in a directory containing only the two source files). All data synthetic. No network or database. This is not a full repository test or verification of actual provider/bank evidence. No runtime integration, worker activation, journal correction or settlement posting implemented by this slice. The environment still lacks pnpm, PostgreSQL, Docker and Cargo. The previous attempt to add expanded simulator integration coverage was blocked; this record does not claim those tests exist or passed. No release gate closed.

## Next verification
Run the existing full local verification and offline financial suites on the dedicated runner. Review migrations 008–010 against the actual PostgreSQL version. Record exact command, exit status, test scope and logs. Test duplicate and concurrent submissions, deferred journal validation, independent evidence and approval separation, event acknowledgements and interruption recovery in the simulator. Establish actual source-level test coverage before interpreting results. Do not use a production endpoint to obtain missing evidence.
