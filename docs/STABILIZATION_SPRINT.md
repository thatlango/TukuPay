# TukuPay stabilization sprint

Status: ACTIVE; release HOLD. Baseline 1f7cc938b9fd2f0bd764e0ce343d7696fd752122. Work on draft PR #4. No new rails or product features until P0 acceptance.

## Work packages
| Package | Owner role | Issue | Dependency | Status |
|---|---|---|---|---|
| STAB-01 | Build/QA | #5 | Isolated runner and repository access | BLOCKED |
| STAB-02 | Database/backend | #6 | STAB-01 for integration verification | OPEN |
| STAB-03 | Finance/financial-core | #7 | Verified schema; independent finance review | OPEN |
| STAB-04 | Security/infrastructure | #8 | Approved isolated staging; identity and evidence contracts | OPEN |
| STAB-05 | Integration | #9 | Stable API and event contracts | OPEN |
| STAB-06 | Data/operations | #10 | Stable data and reporting contracts | IN PROGRESS |

No separate coding agents have been assigned or executed in this session. Issues are agent-ready handoffs, not evidence of delegated execution. The only connected host is the production OVH VPS; do not use it as the development runner.

## Execution and integration
1. Build/QA restores dependency and toolchain reproducibility; record exact test commands and results. Do not close STAB-01 before clean full builds and database verification.
2. Database and security work can be reviewed in parallel but must use separate branches and synthetic tests. Resolve conflicts at integration; do not allow a coding agent to modify production systems, secrets or funds.
3. Financial-core work requires approved accounting policies and independently sourced evidence. Review-only analysis may proceed; final settlement posting, corrections and live payment enablement require independent acceptance.
4. Integration work defines versioned interfaces and consumer compatibility. Do not silently roll out breaking API changes.
5. Data/operations work fixes exact monetary and reporting semantics and adds regression tests.
6. Integration reviewer checks every branch diff, executes the entire suite, then records release evidence against docs/release-gates.json. Keep all unresolved issues open. Code committed does not equal complete.
7. Product, security and finance owners accept the release only after required evidence is available. No production promotion through this sprint.

## Implemented during this session
- f1c56cb844e8f54057a0248fe2a5a49f6a57e260: exclude ambiguous duplicate references from both reconciliation totals, expose ambiguous_reference_count, add regression test.
- 0b3942ce7088205c31fe05d11ba0a5f2c53a20db: estate telemetry and ops summary reporting v2; remove meaningless currency-free monetary totals; expose exact string amounts by currency and ambiguous reference count in offline review. See REPORTING_CONTRACT_V2.md. The report-reader changes are tested; database SQL and consumer compatibility remain unverified.

## Executed verification
Local Python 3: ten tests passed (0.002s), no failures. Exact Git blobs checked before execution:
- intelligence.py e33c7c0d726dd51c271d707383092a799d781b6b
- test_intelligence.py 82e618a26b13d101dd3f38dceb5ad79b79df07ee

Node 22.16.0: three report-reader tests passed (106.768779ms), no failures. Exact Git blobs:
- intelligence-report.mjs b0cce6024077076de6c7e5841e601a150fe73110
- intelligence-report.test.mjs 8cc41475695edb1889cd57abc7dc9c9ff2377af2

Both test suites ran in an isolated temporary reconstruction of those exact files. No full repository build or SQL tests. No live endpoints, credentials or funds used. Git clone fails DNS; pnpm, cargo, rustc, docker, psql absent. Earlier CI run 45409301484 failed in both jobs with no step-level logs. No release gate closed.

## Exit criteria
Every issue has implementation and acceptance evidence, all release gates closed, full integration and security tests pass, legacy upgrade and rollback rehearsed, finance/security reviewers approve. Current session does not meet these criteria.

## Expanded offline verification
At candidate 860e225ee66a0fff5135e99600f70c79dad8680a all five Python test modules ran together: 29 tests passed in 0.018s, zero failures (includes the ten intelligence tests above; not additive). All eleven source/test files and both fixtures matched repository Git blob hashes before execution. Command: python3 -m unittest discover -s . -p 'test_*.py' -v in isolated reconstructed module directory. CLI fixture and batch CLI fixture both passed with one matched successful record and HUMAN_REVIEW_ONLY decision. CLI blob hash 75ffa75b0ea2eb7d045123ad76b0415a8cfd1e9e matched repository. Total unique unit groups: 29 Python + 3 Node = 32. Two offline CLI smoke checks also passed. No provider or database access, full build or release gate closure.

## API and SDK validation slice
Commits 66def61dfb776f0647c8230f59bda0fdd16bdd16, fa81db27c3ece9b84a0a576d1696b4f55e598d7f and 528933bdeb86dae6670a3b7bb289271b70dad894.
- Shared UUID validation before database access in payment, payout, settlement review and event acknowledgement routes. Strict integer limits for exceptions and manual reconciliation; explicit balance account validation. Missing limit uses the documented default; malformed or out-of-range limits return 400 rather than being clamped. Missing balance account retains the collection default.
- SDK rejects non-object response envelopes and structurally invalid payment/payout responses, including unexpected product scope. The new getFinancialEvents() method reads product-scoped event batches and validates event schema, scope, identifiers, status, exact positive minor-unit strings and duplicate IDs. This is read-only retrieval, not consumer delivery or acknowledgement integration. SDK package test command builds then runs compiled response tests. SDK instances are intended to be scoped to one product; callers relying on an admin SDK instance to read unrelated products must migrate. Shape validation is not proof of financial correctness or evidence authenticity.
- Executed isolated strict TypeScript compilation with ES2022/NodeNext, noUncheckedIndexedAccess, exactOptionalPropertyTypes and local Node type declarations; Node 22.16.0. Validation helper tests: 3 passed, 0 failed (64.601878 ms). SDK response helper tests: 3 passed, 0 failed (58.501037 ms). Exact Git blob hashes match executed sources:
  - errors.ts bc96773dc3fb8a096c6203ce4e506b10e78b30b5
  - request-validation.ts b37b469bcd5e759231accc5d6f679fd732f4a8cc
  - request-validation.test.ts aaacaca90994fd78a1a44e90c3cfd52aa113636e
  - response.ts 81215631b03bfbd1dd24bb3668c30b4edd1fc45f
  - response.test.ts 52a25d99bbd88bf6363e1da0d106ac5e2d3dd343
- Inspected committed route and SDK wiring. Full API and SDK compilation, package-manager execution, HTTP integration and PostgreSQL verification are not established by helper tests. STAB-05 remains open. No production changes or financial requests.
