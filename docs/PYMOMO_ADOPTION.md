# PyMoMo adoption — sprint implementation and gates

Source: https://github.com/wkambale/pymomo/tree/9c9416e584b1e5fe15b27c577f7abdd8eadd4a32 (MIT). Use version 1.3.0 only in an isolated test environment. No upstream source is vendored in this change. Retain upstream copyright and licence if future code is copied. Production runtime remains TypeScript.

## Sprint 1: independent contract tests
The existing PostgreSQL simulator is retained for business lifecycle tests. The independent PyMoMo HTTP gateway tests actual MTN and Airtel adapter requests, token exchange, status parsing, duplicate MTN references and balances. It does not prove live operator compatibility.

Prerequisites: Node 22, pnpm, Python 3.10+ and reviewed PyMoMo package dependencies. From repository root:

```sh
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
python -m venv .venv-pymomo
.venv-pymomo/bin/python -m pip install -r apps/api/scripts/requirements-pymomo.txt
.venv-pymomo/bin/python apps/api/scripts/contract-pymomo.py
```

Run the existing simulator E2E with an isolated PostgreSQL database and simulator credentials as documented in CI. Never run its payout tests against production. Completion: all unit, simulator and contract checks pass; inspect logs for no external operator requests.

## Sprint 2: transport and financial integrity
Implemented: HTTPS requirement (loopback HTTP for tests), no redirect following, per-attempt timeout, bounded safe-read retries with Retry-After and jitter, response size bounds, atomic collection status and journal writes, deduplicated webhook processing. Financial POST requests are never automatically replayed. Callback contents still never determine settlement.
Added credential-fingerprinted single-flight token renewal and conditional 401 invalidation (read-only retry). Successful settlements now require authoritative matching amount, currency and transaction identity. If an operator omits required evidence, retain PENDING and record the verification error; confirm exact production response contracts before activation. Remaining: full provider-specific response schema checks; provider-specific signature/replay checks only where the operator contract supports them. Audit existing successful collections with missing or unbalanced journals before release. Validate behavior with failure injection.

## Operations
- GET /v1/ops/provider-transport (ops:read): process-local request counts, status, latency, retry and timeout totals; reset on restart. No provider payloads, URLs, credentials or transaction references. HTTP success is not financial settlement success.
- GET /v1/ops/exceptions?limit=50 (ops:read): pending collections/payouts with errors or age above 30 minutes, including stranded approved payouts. Read-only; does not initiate transfers or retry financial writes.
- Status lookup failures now record a generic error and last-check time. Reconciliation selects least recently checked records first; errors back off to at most five minutes. Manual refresh is still available to authorized callers. A future durable exception workflow must add assignment and resolution audit.

## Sprint 3: payout release gates
Existing MTN payout and approval flow retained; dispatch reservation and provider-reference creation are now atomic; tests cover concurrent approval, repeat approval and reconciliation. An approved but unreserved payout can be resumed by approval; an ambiguous reserved payout must not be automatically re-sent. Successful payouts now post an atomic balanced journal (debit product payout allocation clearing asset, credit provider disbursement clearing asset). This is an interim clearing policy, not final expense/loan classification. Live payout initiation defaults to disabled unless TUKUPAY_LIVE_PAYOUTS_ENABLED=true; do not enable before finance and operator sign-off. Before release: add approval identity separation, product ownership authorization, limits and audit; review provisional payout clearing accounting with finance and implement funding/fee/settlement reconciliation; test crashes before/after transmission, duplicate requests and conflicting status updates. Airtel payout stays disabled until current Uganda portal contract, encryption/signing, account and settlement arrangements are confirmed. PyMoMo provides a reference implementation but not evidence of operator approval.

## Sprint 4: market expansion
Candidate provider catalog (not routable): M-Pesa, Paystack, Flutterwave, Wave, Orange Money. Add adapters behind operation-specific capability checks and explicit provider-market activation only after verifying current contracts. Never infer provider solely from MSISDN; do not fail over while original write outcome is uncertain. Begin with M-Pesa Kenya once market scope and commercial account are confirmed. No additional provider or production market is activated by this branch.

## Release decision
Draft only. No live calls, credentials, activation, deployment or merge. Verify CI and local isolated test evidence, then review security and finance gates before requesting production activation. Existing tests are not evidence of regulatory authorization. Collections on behalf of unrelated third parties and cross-border remittances require separate compliance assessment.

Run `psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -f database/checks/payment_integrity.sql` against an approved read-only connection to identify missing/unbalanced journals and duplicate payout attempts. Historical exceptions require manual investigation; this change does not backfill or modify prior records.

## Local verification without GitHub Actions
Prerequisites: checkout of the candidate branch, Node 22+, pnpm 9, Docker running locally, curl, and installed workspace dependencies (`pnpm install --no-frozen-lockfile`). The verifier creates its own disposable PostgreSQL container and loopback simulator API, uses generated test-only credentials, strips inherited environment variables from the application processes, and removes its own processes/container on exit. It does not accept a production database URL or a live operator endpoint.

```sh
bash scripts/verify-local.sh
# With the reviewed, pinned PyMoMo environment installed:
bash scripts/verify-local.sh --pymomo
```

Completion: exit code zero and PASS output, plus successful PyMoMo contract output for the full release gate. Save terminal output and commit SHA as evidence. A run without --pymomo does not satisfy the external contract gate. Dependency installation is not lockfile reproducible yet; resolve and review the dependency lock before production release.
