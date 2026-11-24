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

## Request contracts, monetary formatting and reconciliation configuration
Candidate commits eba9229ca806fb702ffc41b36da8d5a2a7da22c0 and b9363c91f343bcbcc4a2e6bc32a26e02334f7016.
- Shared collection/payout HTTP create parser validates product, country/currency shape, positive exact amount, provider, reference, optional description and metadata. Optional idempotency keys must be one visible ASCII value without commas, at most 128 characters. Existing service-level provider, environment and authorization checks remain in place; this slice does not alter dispatch or approval semantics.
- Signed minor-unit formatting now handles negative and zero values exactly, including negative fractional major units. Aggregate display values may exceed a single transaction's signed BIGINT range; majorToMinor still enforces positive bounded transaction amounts.
- Reconciliation configuration rejects invalid boolean, interval and batch settings rather than allowing invalid timer or query parameters. Batch limits are validated within the service too. This does not implement distributed worker coordination or durable run history.
- Executed isolated strict TypeScript compilation (tsc 5.8.3, ES2022, NodeNext, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes) and Node 22.16.0 unit tests. Combined run: 9 passed, zero failed (117.832967 ms). Six test groups are new; three existing money groups rerun. Executed exact Git blobs:
  - errors.ts bc96773dc3fb8a096c6203ce4e506b10e78b30b5
  - domain/payments.ts 27986c7b1eeb8e975f3a845a5663dbc102540dc5
  - config/reconciliation-settings.ts 2299b16e80ba169d8629e9bae5898ba24bb70fab
  - config/reconciliation-settings.test.ts 5de81312f33d296e882a0d0616f28ce1de527af3
  - utils/money.ts 529edb4e8b5aab905b6b22d4087d14ff907bb05d
  - utils/money.test.ts ad56a95dadf6e75354c47f9d975074eda144d5da
  - utils/create-intent.ts cad784b4f003b7d4dba88272437ed2c0d08a7d77
  - utils/create-intent.test.ts 98b30bad2f2dfda5632b3c46ee7e857296d64702
- Full API build, HTTP integration, actual timer operation, PostgreSQL and consumer compatibility remain unverified. No live requests or deployment. STAB-05 and STAB-06 remain open.

## Remaining executable backlog — final implementation slice

All seven named areas have code changes. This is not closure of the original STAB issues or release gates.

| Area | Candidate changes | Verification boundary |
|---|---|---|
| Credential configuration | Endpoint schemes, userinfo/query/fragment rejection, mode consistency, MTN market target, MSISDN enum, Airtel v1 and path checks; configured status now checks credential configuration | Pure settings tests passed. Actual credential loading, operator contract and market endpoints still require integration tests. |
| Sensitive-data protection | Request logging disabled, redaction paths configured, generic failure log events and persisted error labels | Source inspection only; Fastify/Pino runtime capture, historical data and raw provider payload retention remain open. |
| Phone validation | Explicit international country mismatch and invalid characters rejected; sandbox fixtures preserved | Four tests passed using Uganda dial-code test double, not full national numbering validation or beneficiary verification. |
| Provider capabilities | Expose collection/disbursement balance configuration and availability separately, block unsupported Airtel operator disbursement balance | Two tests passed for account capability helper. Database activation and adapter integration still unverified. |
| SDK | Runtime validation of operational responses, recovery retrieval, event acknowledgement, non-posting settlement proposal/review contracts | All eight validator tests passed; full isolated SDK strict compilation and four mocked client checks passed. HTTP/API integration and product adoption pending. |
| Integrity checks | Read-only repeatable-read audit expanded to financial events, dispatch, evidence, journal and settlement review consistency | SQL not executed; PostgreSQL unavailable. |
| Rust/TypeScript consistency | Shared 64-character money input boundary and two additional vectors | TypeScript passed all 17 shared money vectors; Rust not compiled or tested. |

Implementation commits: 6a4f215d4ef618a4846e45681d8e577d3beebefd, d596d55392c1aeecb21da1897dae8dcc75d23d50, f43dd6148274109385368af258d9ff16beb5f2a7, 37277ae085f621067d039f8aa3fc3c087b5347f3, 66f8bb380fbc146e020578354dee95ffe0558327, 8d54e80f35792ed1e6f4bc351251841fcbd7e457, a7a34aca0055f49af35e007f89559aceac96bb36.

Executed in isolated reconstructed source layout, Node 22.16.0, strict ES2022/NodeNext TypeScript compilation with noUncheckedIndexedAccess and exactOptionalPropertyTypes. Final test groups: 3 settings + 4 phone + 2 account capability + 8 SDK = 17 passed, zero failed. The phone module imports an isolated Uganda dial-code test double. Tested source blob hashes match repository blobs:
- provider-settings.ts b4b48decedafbb0add72200f41d493ebc4190f27; test d80d7601b4472c257dbdfc87f879a7383b1298d4
- msisdn.ts 5c4076f4e6c07ee99af263c94933275c2ae313f7; test 450efee82b78bf4d7375bbda688bcf1a5ee9c2a0
- balance-accounts.ts 5a2077eadba86d9101c64c95facc9b605d80473f; test af64df2b4be519fca3d3eca9bd3de61b60a5f63a
- SDK response.ts 81215631b03bfbd1dd24bb3668c30b4edd1fc45f; test 52a25d99bbd88bf6363e1da0d106ac5e2d3dd343
- SDK ops-response.ts c5bcc0819500857dff9fd5d6867b3fcdf2534765; test a1975879b75ad5baf814ecaf0f64f82fe0b0f45d
- SDK settlement-response.ts 0a86a731e7b0be78d2c9a860692ffb1d77905cdb; test 800224abb685f03dea09ddade359ac2272703c17
- SDK index.ts 9f53b4d9e299d0789865019f1e5c84be3c6cd1d9. Complete SDK source and declaration compile in isolated layout, with 4 mocked fetch checks (event retrieval, successful acknowledgement, invalid acknowledgement rejection, recovery retrieval).
- money.ts 529edb4e8b5aab905b6b22d4087d14ff907bb05d; money.tsv 87231241fb3d9e5775d5f2536cf2c0ed271945d2. All 17 shared vectors executed in TypeScript with exact integer assertions.

No operator, external payment endpoint, database, or production server was accessed. No live credential used. No full API integration, Rust compilation or SQL execution. SDK settlement decisions remain non-posting; matching response shapes is not financial evidence. All release gates remain open. Existing deployments must review strict settings and API compatibility before upgrading. See SDK_INTEGRATION.md for the updated contract.
