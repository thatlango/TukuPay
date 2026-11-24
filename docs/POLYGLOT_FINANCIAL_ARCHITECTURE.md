# TukuPay polyglot financial architecture

## Decision
Retain TypeScript as the public API, provider orchestration, SDK and operational application layer. PostgreSQL remains the only authoritative financial data store. Rust and Python are components of this repository, not new deployed services. No runtime routes, financial writes, production credentials or automatic financial decisions are introduced by this change.

## Rust financial kernel
Location: crates/financial-kernel. Dependency-free Rust library (Rust 1.74+), unsafe code forbidden.
- Money values use positive, checked signed 64-bit minor units, aligned with PostgreSQL BIGINT. Currency allowlist mirrors the existing TukuPay markets and EUR/USD. Zero-decimal policy follows the current TypeScript registry. Review ISO/provider-specific discrepancies before adding currencies.
- Payout limits use i128 intermediate sums, preventing overflow.
- Ledger validation requires positive balanced postings in the same currency and optionally matches the original amount.
- Strict collection and payout state transitions are target rules: terminal-state corrections require a separate governed process. These are not yet a drop-in replacement for TypeScript transitions.
- The shadow binary consumes currency/major-amount TSV. The comparison script checks the existing TypeScript implementation against Rust using shared vectors. No runtime fallback or second financial authority.

## Python intelligence
Location: python/intelligence. Python 3.10+ standard library only. It matches unique references within environment/country/provider/currency/operation, flags mismatches and duplicate references, identifies stale pending transactions and unusual amounts, and calculates a conservative historical gross payout baseline only when complete history is explicitly attested. Outputs are human-review suggestions, not fraud determinations or approved funding forecasts. There is no ML model yet, no automated blocking, no AI provider access, no database writes.

Snapshot schema v1:
- as_of and window_start: timezone-aware ISO timestamps.
- transactions and statements: arrays of normalized records with reference, country, provider, currency, environment (simulator/sandbox/production), kind (collection/payout), status, amount_minor (positive integer string), timestamp (observation timestamp). Optional created_at identifies actual initiation time; otherwise age is based on observation.
- statement_coverage_complete: true only if independent operator/bank statement coverage of the complete snapshot scope is established. Missing statement evidence is not flagged for partial exports.
- complete_daily_history: true only for complete prior 14 UTC days of actual settlement timestamps. Exporter deliberately sets false because status observations are not settlement timestamps and missing zero-volume groups cannot be inferred.

Export via an approved read replica or isolated simulator. Set TUKUPAY_INTELLIGENCE_READONLY_URL with a dedicated read-only credential; never a write-capable service account. Use an ignored directory with restrictive permissions.

```sh
mkdir -p financial-snapshots
chmod 700 financial-snapshots
umask 077
node apps/api/scripts/export-intelligence.mjs simulator 14 > financial-snapshots/snapshot.json
python3 python/intelligence/cli.py financial-snapshots/snapshot.json
# If an independently normalized statement array is available:
python3 python/intelligence/cli.py financial-snapshots/snapshot.json --statements financial-snapshots/statement.json
```

Use --complete-statements only after the finance operator confirms scope, dates and completeness. Do not use internal records as independent evidence. Snapshot includes only required financial references and dimensions, not phones, payloads, PINs or credentials. Keep reports confidential; delete them according to retention policy. The exporter selects the latest provider attempt for each updated transaction and does not include unreserved payouts; it is not a ledger extract or full statement coverage. The report must not be used to move money. Currency and environments are never aggregated together.

## Verification
```sh
python3 -m unittest discover -s python/intelligence -p 'test_*.py' -v
cargo test --manifest-path crates/financial-kernel/Cargo.toml --locked --offline
pnpm build
bash scripts/verify-financial.sh
```
The full existing simulator and PyMoMo contract gate also remains mandatory. No new dependencies are required for Rust or Python. Rust build/test must run on an installed toolchain; shared vectors also run with TypeScript tests. Capture exit codes, commit SHA and output; do not treat code review as executed verification.

## Adoption gates
1. Verify all languages and the existing simulator suite against the same commit.
2. Expand financial vectors for overflow, unsupported currency, journal posting, duplicate dispatch and terminal transitions. Document intentional TypeScript/Rust differences before enforcement.
3. Benchmark representative workloads on the intended host. Measure latency, throughput, memory, operational cost and failure isolation; do not extract a service on assumed gains.
4. Run shadow comparisons on sanitized or simulator cases. Review discrepancies with finance and engineering; do not let Rust or Python independently mutate the ledger.
5. Add independent statement parsers and finance-approved funding/fee/settlement reconciliation. Evaluate rules on labeled historical data before introducing statistical/ML scoring; keep humans responsible for decisions.
6. Consider a Rust library binding or native service only if measured benefits outweigh integration/operational cost. Review threat model and rollback; retain one transaction/ledger writer. Python stays offline/read-only until data governance, model evaluation and operations controls are approved.

No production cutover is authorized.

### Independent statements and report provenance
The CLI accepts normalized CSV or JSON arrays. CSV requires exact columns `reference,country,provider,currency,environment,kind,status,amount_minor,timestamp`; an example is in `python/intelligence/fixtures/statement.csv`. Preserve duplicates for investigation. No native operator-specific CSV mapping is assumed. The report records SHA-256 digests of input artifacts and per-scope counts, observed successful totals, matched amounts and differences as integer strings. Duplicate reference groups are excluded from amount totals and remain explicit findings. The observed difference is not an outstanding liability or a certified reconciliation result, particularly when coverage is partial. Never infer completeness from matching totals or a file hash. Review coverage and source authenticity independently.

### Synthetic kernel benchmark
After building TypeScript, run `cargo run --release --locked --offline --manifest-path crates/financial-kernel/Cargo.toml --bin benchmark` and `node scripts/benchmark-financial-kernel.mjs`. Both use 100,000 synthetic KES parse/format/limit evaluations; require equal checksums and collect several runs on the same host. Compare median elapsed time, not one run. This is a narrow CPU microbenchmark, not API throughput or evidence that a separate Rust service saves resources. Record toolchain, CPU, memory and release build settings. Rust rejects unsupported currencies and values above signed BIGINT even where current TypeScript accepts them; these are intentional candidate policy differences pending review. Boundary tests now include max i64 roundtrips, overflow, unsupported currency, unbalanced journals and cumulative overflow.


## Treasury, risk, independent journal audit and operator reports
Treasury is optional in snapshot v1. Under treasury provide normalized balances (scope dimensions, account collection/disbursement, available_minor, timestamp), obligations (scope dimensions, reference, due_at, amount_minor, estimated_fee_minor), and settlements (scope dimensions, reference, timestamp, gross_minor, actual_fee_minor, expected_fee_minor, net_minor). Amounts are nonnegative integer strings where zero is permitted. Obligations must be independently approved and reconciled; set obligations_complete only when coverage is established for the entire included scope. A funding gap scenario is shown only with a fresh disbursement balance and explicitly complete obligations. Collection wallet balance is not assumed available for payouts. Overdue obligations are included; settlement checks compare supplied fee assumptions and arithmetic, not a certified bank settlement. These inputs are manual normalized evidence; no automatic provider balance fetch or funding action is implemented.

Activity indicators use unique references with explicit creation timestamps inside the snapshot window. Report peak five-minute activity, terminal unsuccessful counts and shares by provider/currency/country/environment/operation. Descriptive only, not a customer risk score or automatic block. Evaluate historical baselines before using risk scores.

The independent Rust journal audit accepts TSV via stdin and checks currency, positive postings, duplicate posting IDs within a journal, debit/credit balance and original amount where applicable. Exit 0 = exported journals passed; 1 = journals require review; 2 = malformed or oversized export. An empty export is not evidence of ledger completeness. The original SQL integrity check is still required for successful transactions missing journals, duplicate journals and duplicate dispatch. The existing ledger lacks environment tags: run the export on an isolated simulator or a separately proven environment, never infer production separation. No changes to the database.

```sh
cargo build --locked --offline --manifest-path crates/financial-kernel/Cargo.toml --bin journal_audit
crates/financial-kernel/target/debug/journal_audit < contracts/financial/journals.tsv
```

For a separately authorized read-only database session, use database/checks/export_journals.sql with psql -X -qAt, tab delimiter and ON_ERROR_STOP. Export to a restricted local file and run the binary. No database connection was made during implementation.

The local operations workspace optionally reads a private JSON report at TUKUPAY_INTELLIGENCE_REPORT. Generate the report with the Python CLI into a file using umask 077; use a single environment per report. For an operator runtime explicitly set TUKUPAY_INTELLIGENCE_ENVIRONMENT to sandbox or production; simulator runtime always requires simulator. The panel displays the report timestamp, coverage, findings, reconciliation, funding scenarios, fee differences and observed activity. Reports older than 24 hours are marked stale; no automated changes or API calls originate from the report. The report loader allows only selected display fields; use a trusted workstation and keep input files private. Do not expose the local workspace through a proxy.

## Controlled integration decision
The runtime cutover is not implemented: Rust remains offline; Python is read-only. One authoritative ledger writer remains TypeScript/PostgreSQL. Before a proposal to enable Rust in the transaction path, obtain green full CI or equivalent local verification, reviewed policy differences, representative performance evidence, environment separation and finance-approved journal rules. Test rollback and fail-closed behavior in simulator. Do not introduce a second transaction writer. This is a gated future release decision, not an automatic switch.
