# Reporting contract v2

Decision: financial amounts are never summed across currencies. Scope-free counts remain valid. Monetary aggregate values are decimal strings in minor units, not JavaScript numbers. Reports describe recorded observations, not certified cash balances.

- GET /internal/estate-telemetry now returns schemaVersion: 2 and amountsByCurrency (array of currency, collectedMinor, paidOutMinor; both amounts are strings). The previous kpis.collectedMinor and kpis.paidOutMinor are removed because their values were not meaningful across currencies. Consumers must migrate before deployment; do not assume missing values equal zero.
- GET /v1/ops/summary now includes schemaVersion: 2. payments24h, payouts24h and settlements24h contain counts only; use payments24hByCurrency, payouts24hByCurrency and settlements24hByCurrency for monetary amounts.
- Offline reconciliation excludes ambiguous references from both sides' totals and reports ambiguous_reference_count. A zero observed difference does not establish complete reconciliation; ambiguous references and incomplete evidence remain review findings.

Acceptance: consumer contract tests; synthetic PostgreSQL tests with multiple currencies and values exceeding safe JavaScript integers; verify no legacy consumer assumes aggregate numeric amounts; review exact currency scope and reporting time semantics. SQL changes not yet executed. Do not promote until these tests and consumer migration are complete.
